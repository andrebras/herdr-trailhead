// Projects on other machines. Mods can't list another machine's folders, so Trailhead runs
// one small sh script there through Herdr and reads what it prints. Knows nothing about Herdr,
// so tests can run it under node.

/**
 * A word for sh, quoted so spaces and quotes in it stay as they are.
 * @param {string} s
 */
const quote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * A root as sh should see it: `~` becomes that machine's home.
 * @param {string} root
 */
export function shellPath(root) {
  if (root === "~") return '"$HOME"';
  if (/^~\//.test(root)) return `"$HOME"/${quote(root.slice(2))}`;
  return quote(root);
}

/**
 * The script that lists the projects under the roots on another machine, as the local search
 * does: `depth` levels down, skipping hidden folders, node_modules and links, and never looking
 * inside a repo. It prints "H <home>" first, then a line per repo ("R <path>") or worktree
 * ("W <path>"), and "E <root>" for a root that is there but can't be read. A missing root
 * prints nothing: roots often differ between machines.
 * With `present` (the default roots, each "~/<name>"), only the ones in the home folder under
 * exactly that name are searched, so ~/code and ~/Code on a case-insensitive disk count once.
 * @param {string[]} roots
 * @param {number} depth
 * @param {boolean} [present]
 */
export function findScript(roots, depth, present = false) {
  const lines = [
    `printf 'H %s\\n' "$HOME"`,
    // walk <folder> <levels>: each folder in it is a repo, a worktree, or searched further.
    "walk() {",
    '  for d in "$1"/*/; do',
    "    d=${d%/}",
    '    if [ -L "$d" ] || [ ! -d "$d" ] || [ "${d##*/}" = node_modules ]; then continue; fi',
    `    if [ -d "$d/.git" ]; then printf 'R %s\\n' "$d"`,
    `    elif [ -f "$d/.git" ]; then printf 'W %s\\n' "$d"`,
    '    elif [ "$2" -gt 1 ]; then walk "$d" $(($2 - 1)); fi',
    "  done",
    "}",
    "root() {",
    '  if [ ! -e "$1" ]; then :',
    `  elif r=$(cd "$1" 2>/dev/null && pwd); then walk "$r" ${depth}`,
    `  else printf 'E %s\\n' "$1"; fi`,
    "}",
  ];
  if (present) {
    const names = roots.map((r) => quote(r.replace(/^~\//, ""))).join("|");
    lines.push(`for h in "$HOME"/*/; do h=\${h%/}; case \${h##*/} in ${names}) root "$h" ;; esac; done`);
  } else {
    for (const root of roots) lines.push(`root ${shellPath(root)}`);
  }
  return lines.join("\n");
}

/**
 * What the script printed, as the machine's home folder, its projects (nothing inside another
 * repo, as the local search skips those), and the roots it couldn't read.
 * @param {string} text
 * @returns {{ home: string | null, found: { path: string, kind: "repo" | "worktree" }[], unreadable: string[] }}
 */
export function parseFound(text) {
  /** @type {string | null} */
  let home = null;
  /** @type {{ path: string, kind: "repo" | "worktree" }[]} */
  const all = [];
  /** @type {string[]} */
  const unreadable = [];
  for (const line of text.split("\n")) {
    const kind = line.slice(0, 2);
    const rest = line.slice(2);
    if (kind === "H " && home === null) home = rest;
    else if (kind === "E ") unreadable.push(rest);
    else if ((kind === "R " || kind === "W ") && rest)
      all.push({ path: rest, kind: kind === "R " ? "repo" : "worktree" });
  }
  // A folder sorts before everything inside it, so each one's parents are seen first.
  all.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const kept = new Set();
  /** @type {{ path: string, kind: "repo" | "worktree" }[]} */
  const found = [];
  for (const p of all) {
    const parts = p.path.split("/");
    const nested = parts.some((_, i) => i > 0 && kept.has(parts.slice(0, i).join("/")));
    if (nested || kept.has(p.path)) continue;
    kept.add(p.path);
    found.push(p);
  }
  return { home, found, unreadable };
}

/**
 * Why a machine's projects couldn't be listed, in words for the error bar, or null when they
 * were. `out` is what the script returned; `error`, why it couldn't run at all.
 * @param {string} machine
 * @param {number} seconds the time limit
 * @param {{ code: number, stdout: string, stderr: string } | null} out
 * @param {unknown} [error]
 * @returns {string | null}
 */
export function scanProblem(machine, seconds, out, error) {
  const first = (/** @type {string} */ s) => s.trim().split("\n")[0];
  if (!out) {
    const why = error instanceof Error ? error.message : String(error ?? "");
    if (/took longer|timed out/.test(why)) return `${machine} didn't answer within ${seconds} seconds`;
    if (/cannot start sh/.test(why)) return `Can't list the projects on ${machine}: it has no sh`;
    return `Can't reach ${machine}${why ? `: ${first(why)}` : ""}`;
  }
  if (out.code === 0 || out.stdout) return null;
  const why = first(out.stderr);
  return `Listing the projects on ${machine} failed: ${why || `exit code ${out.code}`}`;
}
