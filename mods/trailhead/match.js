// Matching that knows nothing about Herdr, so tests can run it under node.

/**
 * A row in the list: a project, or a space that is open. `key` tells rows apart across
 * machines (the path on this computer); `lname` and `lpath` are the name and the shown path
 * in lowercase, worked out once when the list is built so a key press doesn't redo them.
 * @typedef {{ name: string, path: string, key?: string, lname?: string, lpath?: string,
 *   space?: { status?: string | null } }} Row
 */

/**
 * The row's identity: its key, or its path.
 * @param {Row} r
 */
export const keyOf = (r) => r.key ?? r.path;

// Higher is better, 0 is no match: the name starting with it, then containing it, then
// its letters in order in the name or the path (a fuzzy match, as fzf does).
// `f`, `name` and `path` are already lowercase.
/**
 * @param {string} f
 * @param {string} name
 * @param {string} path
 * @returns {number}
 */
export function score(f, name, path) {
  if (name.startsWith(f)) return 400 - name.length;
  if (name.includes(f)) return 300 - name.length;
  if (inOrder(f, name)) return 200 - name.length;
  if (path.includes(f)) return Math.max(101, 150 - path.length / 10);
  if (inOrder(f, path)) return Math.max(1, 100 - path.length / 10);
  return 0;
}

/**
 * Whether the letters of `f` appear in `text` in order.
 * @param {string} f
 * @param {string} text
 */
export function inOrder(f, text) {
  let i = 0;
  for (const c of text) if (c === f[i]) i++;
  return i === f.length;
}

// The best `shown` rows for a lowercase query, best first; ties keep their order.
// `display(path)` gives the path as shown (~/...); `recent` the recent picks, newest first;
// `zoxide` a small bonus per path from zoxide's ranking (see zoxideBonus). One pass, and
// only the matches are sorted, so a key press stays well under a frame with 5,000 rows.
/**
 * @template {Row} R
 * @param {R[]} rows
 * @param {string} f
 * @param {number} shown
 * @param {(path: string) => string} display
 * @param {string[]} [recent]
 * @param {Map<string, number>} [zoxide]
 * @returns {R[]}
 */
export function best(rows, f, shown, display, recent = [], zoxide = new Map()) {
  const at = new Map(recent.map((p, i) => [p, i]));
  /** @type {{ r: R, s: number, i: number }[]} */
  const hits = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const m = score(f, r.lname ?? r.name.toLowerCase(), r.lpath ?? display(r.path).toLowerCase());
    if (m > 0) hits.push({ r, s: m + bonus(r, at, zoxide), i });
  }
  hits.sort((a, b) => b.s - a.s || a.i - b.i);
  return hits.slice(0, shown).map((x) => x.r);
}

// With nothing typed: open spaces first (in the sidebar's order), then your recent picks
// (newest first), then the rest by name.
/**
 * @template {Row} R
 * @param {R[]} rows
 * @param {string[]} recent
 * @returns {R[]}
 */
export function ordered(rows, recent) {
  const pick = new Map(recent.map((p, i) => [p, i]));
  const group = (/** @type {R} */ r) => (r.space ? 0 : pick.has(keyOf(r)) ? 1 : 2);
  return rows
    .map((r, i) => ({ r, i, g: group(r) }))
    .sort((a, b) => {
      if (a.g !== b.g) return a.g - b.g;
      if (a.g === 1) return (pick.get(keyOf(a.r)) ?? 0) - (pick.get(keyOf(b.r)) ?? 0);
      if (a.g === 2) return a.r.name.localeCompare(b.r.name);
      return a.i - b.i;
    })
    .map((x) => x.r);
}

// Among similar matches, an open space comes first, more so when an agent there needs you
// (blocked), then a recent pick, then what zoxide ranks high. The bonus is worth at most 30
// characters of name length, so a clearly better kind of match still wins.
/**
 * @param {Row} row
 * @param {string[] | Map<string, number>} recent recent picks, or their positions by key
 * @param {Map<string, number>} [zoxide]
 */
export function bonus(row, recent, zoxide) {
  const key = keyOf(row);
  const at = Array.isArray(recent) ? recent.indexOf(key) : (recent.get(key) ?? -1);
  const space = row.space ? (row.space.status === "blocked" ? 15 : 10) : 0;
  return space + (at < 0 ? 0 : Math.max(1, 10 - at)) + (zoxide?.get(row.path) ?? 0);
}

/**
 * `zoxide query -ls` output ("  12.5 /path" per line, best first) as a bonus per path: 5 for
 * the best few, down to 1, nothing past the first 100.
 * @param {string} text
 * @returns {Map<string, number>}
 */
export function zoxideBonus(text) {
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const line of text.split("\n")) {
    const m = /^\s*[\d.]+\s+(.+?)\s*$/.exec(line);
    if (!m || out.has(m[1])) continue;
    const rank = out.size;
    if (rank >= 100) break;
    out.set(m[1], Math.max(1, 5 - Math.floor(rank / 20)));
  }
  return out;
}

// How long ago, in a few letters: now, 5m, 3h, 2d, 3w, 4mo, 2y.
/** @param {number} seconds */
export function age(seconds) {
  const s = Math.max(0, seconds);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 14) return `${Math.floor(s / 86400)}d`;
  if (s < 86400 * 60) return `${Math.floor(s / (86400 * 7))}w`;
  if (s < 86400 * 365) return `${Math.floor(s / (86400 * 30))}mo`;
  return `${Math.floor(s / (86400 * 365))}y`;
}

// The time of a git reflog's last entry: "<old> <new> <name> <email> <seconds> <zone>\t<message>".
/**
 * @param {string} text
 * @returns {number | null}
 */
export function reflogTime(text) {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /> (\d+) [+-]\d{4}\t/.exec(lines[i]);
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * Where a lowercase query matches `text`, as character positions, for highlighting:
 * the first place it appears whole, else its letters in order; empty when it doesn't match.
 * @param {string} f
 * @param {string} text
 * @returns {number[]}
 */
export function positions(f, text) {
  if (!f) return [];
  const lower = text.toLowerCase();
  const at = lower.indexOf(f);
  if (at >= 0) return Array.from({ length: f.length }, (_, i) => at + i);
  const found = [];
  for (let i = 0; i < lower.length && found.length < f.length; i++) if (lower[i] === f[found.length]) found.push(i);
  return found.length === f.length ? found : [];
}

/**
 * `text` cut into pieces that alternate between matched and not, for drawing.
 * @param {string} text
 * @param {number[]} hits positions from `positions`
 * @returns {{ text: string, hit: boolean }[]}
 */
export function pieces(text, hits) {
  const on = new Set(hits);
  /** @type {{ text: string, hit: boolean }[]} */
  const out = [];
  for (let i = 0; i < text.length; i++) {
    const hit = on.has(i);
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.text += text[i];
    else out.push({ text: text[i], hit });
  }
  return out;
}

/**
 * A name for each path: its preferred label when no other path has that label, else the
 * shortest end of its path that no other path in the clash shares ("work/api", "home/api").
 * @param {{ path: string, label: string }[]} items
 * @returns {string[]}
 */
export function uniqueNames(items) {
  const parts = items.map((x) => x.path.split(/[/\\]/).filter(Boolean));
  const count = new Map();
  for (const x of items) count.set(x.label, (count.get(x.label) ?? 0) + 1);
  return items.map((x, i) => {
    if (count.get(x.label) === 1) return x.label;
    const mine = parts[i];
    const rivals = items.map((_, j) => j).filter((j) => j !== i && items[j].label === x.label);
    for (let n = 2; n <= mine.length; n++) {
      const tail = mine.slice(-n).join("/");
      if (rivals.every((j) => parts[j].slice(-n).join("/") !== tail)) return tail;
    }
    return mine.join("/") || x.label;
  });
}

/**
 * The repo folder a worktree belongs to, from its gitdir ("<repo>/.git/worktrees/<name>").
 * @param {string} gitdir
 * @returns {string | null}
 */
export function worktreeRepo(gitdir) {
  const m = /^(.*?)[/\\]\.git[/\\]worktrees[/\\][^/\\]+[/\\]?$/.exec(gitdir);
  return m ? m[1] : null;
}
