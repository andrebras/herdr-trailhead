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
// `display(row)` gives the path as shown (~/...).
export function best(rows, f, shown, display) {
  return rows
    .map((r) => ({ r, s: score(f, r.name.toLowerCase(), display(r.path).toLowerCase()) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, shown)
    .map((x) => x.r);
}
