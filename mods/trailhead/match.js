// Matching that knows nothing about Herdr, so tests can run it under node.

/**
 * A row in the list: a project, or a space that is open. `key` tells rows apart (see keys.js);
 * `pkey` is the key of the project a space is in, so a pick of the project counts for its space
 * too. `lname` and `lpath` are the name and the shown path in lowercase, worked out once when
 * the list is built so a key press doesn't redo them.
 * @typedef {{ name: string, path: string, key?: string, pkey?: string | null, lname?: string,
 *   lpath?: string, space?: { status?: string | null } }} Row
 */

/**
 * The row's identity: its key, or its path.
 * @param {Row} r
 */
export const keyOf = (r) => r.key ?? r.path;

/**
 * How recently a row was picked: its own key's place in `at` (key → place, newest 0), else
 * its project's, unless that is `skip`. Undefined when it wasn't picked.
 * @param {Row} r
 * @param {Map<string, number>} at
 * @param {string | null} [skip]
 */
function recency(r, at, skip = null) {
  const own = at.get(keyOf(r));
  if (own !== undefined || !r.pkey || r.pkey === skip) return own;
  return at.get(r.pkey);
}

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
  let at = -1;
  for (let i = 0; i < f.length; i++) {
    at = text.indexOf(f[i], at + 1);
    if (at < 0) return false;
  }
  return true;
}

/**
 * A list made ready for ranking, once per list rather than once per key: each row's name and
 * shown path in lowercase, and its bonus (see `bonus`). `display(path)` gives the path as shown
 * (~/...); `recent` the recent picks, newest first; `zoxide` a small bonus per path from
 * zoxide's ranking (see zoxideBonus). `last` remembers the last query and the rows it matched.
 * @template {Row} R
 * @typedef {{ rows: R[], names: string[], paths: string[], bonus: number[],
 *   last: { f: string, hits: number[] } | null }} RankIndex
 */

/**
 * @template {Row} R
 * @param {R[]} rows
 * @param {(path: string) => string} display
 * @param {string[]} [recent]
 * @param {Map<string, number>} [zoxide]
 * @returns {RankIndex<R>}
 */
export function rankIndex(rows, display, recent = [], zoxide = new Map()) {
  const at = places(recent);
  return {
    rows,
    names: rows.map((r) => r.lname ?? r.name.toLowerCase()),
    paths: rows.map((r) => r.lpath ?? display(r.path).toLowerCase()),
    bonus: rows.map((r) => bonus(r, at, zoxide)),
    last: null,
  };
}

/**
 * The best `shown` rows for a lowercase query, best first; ties keep the list's order.
 * One pass that keeps only the best few, so no sort of every match. When the query only adds
 * letters to the last one, only the rows that matched it are looked at again: nothing else
 * can match a longer query.
 * @template {Row} R
 * @param {RankIndex<R>} index
 * @param {string} f
 * @param {number} shown
 * @returns {R[]}
 */
export function bestIn(index, f, shown) {
  const { names, paths } = index;
  const from = index.last && f.startsWith(index.last.f) ? index.last.hits : null;
  const n = from ? from.length : names.length;
  /** @type {number[]} */
  const hits = [];
  /** @type {{ i: number, s: number }[]} */
  const top = [];
  for (let j = 0; j < n; j++) {
    const i = from ? from[j] : j;
    const m = score(f, names[i], paths[i]);
    if (m === 0) continue;
    hits.push(i);
    const s = m + index.bonus[i];
    if (top.length === shown && s <= top[shown - 1].s) continue;
    // Rows come in list order, so a tie stays behind the rows already kept.
    let k = top.length;
    while (k > 0 && top[k - 1].s < s) k--;
    top.splice(k, 0, { i, s });
    if (top.length > shown) top.pop();
  }
  index.last = { f, hits };
  return top.map((x) => index.rows[x.i]);
}

/**
 * The best `shown` rows for a lowercase query, for a list ranked once (see rankIndex).
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
  return bestIn(rankIndex(rows, display, recent, zoxide), f, shown);
}

// With nothing typed, so Cmd+O then Enter jumps back to the project you were in before:
// 1. the newest recent pick that isn't the current space (it starts selected);
// 2. the other open spaces, in the sidebar's order;
// 3. the other recent picks, newest first;
// 4. the rest, most recently changed first; those with no known change last, by name;
// 5. the current space, last (going to it would change nothing).
// A pick of the current space's project doesn't count for its other spaces: you are there.
/**
 * @template {Row & { touched?: number | null }} R
 * @param {R[]} rows
 * @param {string[]} recent keys of recent picks, newest first
 * @param {string | null} [current] the current space's row key
 * @param {number} [limit] how many to return: the order is only worked out for those
 * @returns {R[]}
 */
export function ordered(rows, recent, current = null, limit = Infinity) {
  /** @type {Map<string, number>} */
  const pick = new Map();
  recent.forEach((k, i) => {
    if (k !== current && !pick.has(k)) pick.set(k, i);
  });
  const here = rows.find((r) => keyOf(r) === current)?.pkey ?? null;
  /** @type {{ r: R, i: number, at: number | undefined }[][]} the five groups above */
  const groups = [[], [], [], [], []];
  /** @type {{ r: R, i: number, at: number | undefined } | null} */
  let previous = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (keyOf(r) === current) {
      groups[4].push({ r, i, at: undefined });
      continue;
    }
    const x = { r, i, at: recency(r, pick, here) };
    if (x.at !== undefined && (previous === null || x.at < (previous.at ?? Infinity))) previous = x;
    groups[r.space ? 1 : x.at !== undefined ? 2 : 3].push(x);
  }
  if (previous) {
    groups[0].push(previous);
    for (const g of [1, 2]) groups[g] = groups[g].filter((x) => x !== previous);
  }
  groups[2].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const head = [...groups[0], ...groups[1], ...groups[2]];
  const rest = firstOf(groups[3], Math.max(0, limit - head.length), byChange);
  return [...head, ...rest, ...groups[4]].slice(0, limit).map((x) => x.r);
}

/**
 * Most recently changed first; those with no known change last, by name; then list order.
 * @param {{ r: Row & { touched?: number | null }, i: number }} a
 * @param {{ r: Row & { touched?: number | null }, i: number }} b
 */
function byChange(a, b) {
  const ta = a.r.touched ?? null;
  const tb = b.r.touched ?? null;
  if (ta !== tb) {
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  }
  const na = a.r.lname ?? a.r.name.toLowerCase();
  const nb = b.r.lname ?? b.r.name.toLowerCase();
  return na < nb ? -1 : na > nb ? 1 : a.i - b.i;
}

/**
 * The first `k` of `list` in `cmp`'s order, without sorting the whole list when `k` is small.
 * @template T
 * @param {T[]} list
 * @param {number} k
 * @param {(a: T, b: T) => number} cmp
 * @returns {T[]}
 */
function firstOf(list, k, cmp) {
  if (k >= list.length) return [...list].sort(cmp);
  /** @type {T[]} */
  const out = [];
  for (const x of list) {
    if (out.length === k && (k === 0 || cmp(x, out[k - 1]) >= 0)) continue;
    let at = out.length;
    while (at > 0 && cmp(x, out[at - 1]) < 0) at--;
    out.splice(at, 0, x);
    if (out.length > k) out.pop();
  }
  return out;
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
  const at = recency(row, Array.isArray(recent) ? places(recent) : recent) ?? -1;
  const space = row.space ? (row.space.status === "blocked" ? 15 : 10) : 0;
  return space + (at < 0 ? 0 : Math.max(1, 10 - at)) + (zoxide?.get(row.path) ?? 0);
}

/**
 * Each key's place in a list, the first one where it appears twice.
 * @param {string[]} list
 */
function places(list) {
  /** @type {Map<string, number>} */
  const at = new Map();
  list.forEach((k, i) => {
    if (!at.has(k)) at.set(k, i);
  });
  return at;
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
 * A gitdir written relative to the worktree ("<worktree>/../acme/.git/...") gives the same
 * folder as an absolute one, so the repo and its worktrees match.
 * @param {string} gitdir
 * @returns {string | null}
 */
export function worktreeRepo(gitdir) {
  const m = /^(.*?)[/\\]\.git[/\\]worktrees[/\\][^/\\]+[/\\]?$/.exec(gitdir);
  return m ? withoutDots(m[1]) : null;
}

/**
 * The folder of a worktree, from the `gitdir` file git keeps for it in
 * "<repo>/.git/worktrees/<name>/", which holds the path to the worktree's .git file, either
 * absolute or relative to that folder (`at`). Null when it names no .git file.
 * @param {string} text
 * @param {string} at
 * @returns {string | null}
 */
export function worktreeFolder(text, at) {
  const line = text.trim();
  if (!line) return null;
  const abs = /^([/\\]|[A-Za-z]:[/\\])/.test(line) ? line : `${at}/${line}`;
  const dir = abs.replace(/[/\\]\.git$/, "");
  return dir === abs ? null : withoutDots(dir);
}

/**
 * A path with its "." and "name/.." parts taken out, in its own separator.
 * @param {string} path
 */
function withoutDots(path) {
  /** @type {string[]} */
  const out = [];
  for (const part of path.split(/[/\\]/)) {
    const last = out[out.length - 1];
    if (part === ".") continue;
    if (part === ".." && last !== undefined && last !== "" && last !== "..") out.pop();
    else out.push(part);
  }
  return out.join(path.includes("\\") ? "\\" : "/");
}

/**
 * The branch a git HEAD file names ("ref: refs/heads/<branch>"), or null when it names none
 * (a detached HEAD holds a commit instead).
 * @param {string} text
 * @returns {string | null}
 */
export function headBranch(text) {
  const m = /^ref: refs\/heads\/(.+?)\s*$/m.exec(text);
  return m ? m[1] : null;
}
