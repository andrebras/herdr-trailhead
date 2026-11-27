// Projects on other machines. Mods can't read another machine's folders, so Trailhead runs
// one small `find` script there through Herdr and reads what it prints. Knows nothing about
// Herdr, so tests can run it under node.

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
 * The script that lists the repos under the roots, as the local search does: `depth` levels
 * down, skipping hidden folders and node_modules. It prints "H <home>" first, then a line
 * per repo ("R <path>") or worktree ("W <path>"), and "E <root>" for a root that is there but can't be read; a missing root prints nothing.
 * @param {string[]} roots
 * @param {number} depth
 */
export function findScript(roots, depth) {
  const max = depth + 1; // the .git entry is one level below its repo
  // Hidden folders (but not "." itself or .git) and node_modules are not searched.
  const skip = `\\( -name node_modules -o \\( -name '.*' ! -name . ! -name .git \\) \\) -prune`;
  /** @param {string} type @param {string} tag */
  const list = (type, tag) =>
    `  (cd "$d" && find . -maxdepth ${max} ${skip} -o -name .git ! -path ./.git -type ${type} -print) 2>/dev/null |` +
    ` while IFS= read -r l; do printf '${tag} %s/%s\\n' "$d" "\${l#./}"; done`;
  const lines = [`printf 'H %s\\n' "$HOME"`];
  for (const root of roots) {
    const r = shellPath(root);
    lines.push(
      // A root that isn't there is skipped quietly: roots often differ between machines.
      `if [ ! -e ${r} ]; then :`,
      `elif d=$(cd ${r} 2>/dev/null && pwd); then`,
      list("d", "R"),
      list("f", "W"),
      `else printf 'E %s\\n' ${r}; fi`,
    );
  }
  return lines.join("\n");
}

/**
 * What the script printed, as the machine's home folder, its projects (each repo's folder,
 * not its .git; nothing inside another repo, as the local search skips those), and the
 * roots it couldn't read.
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
    else if ((kind === "R " || kind === "W ") && rest.endsWith("/.git")) {
      all.push({ path: rest.slice(0, -5), kind: kind === "R " ? "repo" : "worktree" });
    }
  }
  all.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  /** @type {{ path: string, kind: "repo" | "worktree" }[]} */
  const found = [];
  for (const p of all) {
    const last = found[found.length - 1];
    if (last && (p.path === last.path || p.path.startsWith(`${last.path}/`))) continue;
    found.push(p);
  }
  return { home, found, unreadable };
}
