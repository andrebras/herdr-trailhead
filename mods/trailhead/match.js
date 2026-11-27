// Matching that knows nothing about Herdr, so tests can run it under node.

// Higher is better, 0 is no match: the name starting with it, then containing it, then
// its letters in order in the name or the path (a fuzzy match, as fzf does).
// `f`, `name` and `path` are already lowercase.
export function score(f, name, path) {
  if (name.startsWith(f)) return 400 - name.length;
  if (name.includes(f)) return 300 - name.length;
  if (inOrder(f, name)) return 200 - name.length;
  if (path.includes(f)) return Math.max(101, 150 - path.length / 10);
  if (inOrder(f, path)) return Math.max(1, 100 - path.length / 10);
  return 0;
}

export function inOrder(f, text) {
  let i = 0;
  for (const c of text) if (c === f[i]) i++;
  return i === f.length;
}

// The best `shown` rows for a lowercase query, best first; ties keep their order.
// `display(path)` gives the path as shown (~/...); `recent` the recent picks, newest first.
export function best(rows, f, shown, display, recent = []) {
  return rows
    .map((r) => ({ r, m: score(f, r.name.toLowerCase(), display(r.path).toLowerCase()) }))
    .filter((x) => x.m > 0)
    .map((x) => ({ r: x.r, s: x.m + bonus(x.r, recent) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, shown)
    .map((x) => x.r);
}

// With nothing typed: open spaces first (in the sidebar's order), then your recent picks
// (newest first), then the rest by name.
export function ordered(rows, recent) {
  const pick = new Map(recent.map((p, i) => [p, i]));
  const group = (r) => (r.space ? 0 : pick.has(r.path) ? 1 : 2);
  return rows
    .map((r, i) => ({ r, i, g: group(r) }))
    .sort((a, b) => {
      if (a.g !== b.g) return a.g - b.g;
      if (a.g === 1) return pick.get(a.r.path) - pick.get(b.r.path);
      if (a.g === 2) return a.r.name.localeCompare(b.r.name);
      return a.i - b.i;
    })
    .map((x) => x.r);
}

// Among similar matches, an open space and a recent pick come first. The bonus is worth at
// most 20 characters of name length, so a clearly better kind of match still wins.
export function bonus(row, recent) {
  const at = recent.indexOf(row.path);
  return (row.space ? 10 : 0) + (at < 0 ? 0 : Math.max(1, 10 - at));
}

// How long ago, in a few letters: now, 5m, 3h, 2d, 3w, 4mo, 2y.
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
export function reflogTime(text) {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /> (\d+) [+-]\d{4}\t/.exec(lines[i]);
    if (m) return Number(m[1]);
  }
  return null;
}
