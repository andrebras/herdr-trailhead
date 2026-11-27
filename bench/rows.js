// The list the speed checks rank: 5,000 made-up projects, a third with no known last change,
// and the first 50 as recent picks. Shared by tests/speed.test.mjs and bin/bench-herdr.

export function benchRows() {
  const words = ["acme", "web", "api", "notes", "infra", "billing", "login", "docs", "mobile", "data"];
  const rows = Array.from({ length: 5000 }, (_, i) => {
    const name = `${words[i % 10]}-${words[(i * 7) % 10]}-${i}`;
    const path = `/home/me/code/${words[(i * 3) % 10]}/${name}`;
    const touched = i % 3 ? 1700000000 + ((i * 7919) % 100000) : null;
    return { name, path, key: path, lname: name, lpath: path, touched };
  });
  return { rows, recent: rows.slice(0, 50).map((r) => r.path) };
}
