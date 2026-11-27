// The speed bar from the proposal: each key press re-ranks 5,000 rows in under one frame
// (16 ms). This measures the ranking under Node.js; Herdr's JavaScript engine (QuickJS) has
// no just-in-time compiler and is slower, so the margin here should stay wide.
import { test } from "node:test";
import assert from "node:assert/strict";
import { best } from "../mods/trailhead/match.js";

const words = ["acme", "web", "api", "notes", "infra", "billing", "login", "docs", "mobile", "data"];
const rows = Array.from({ length: 5000 }, (_, i) => {
  const name = `${words[i % 10]}-${words[(i * 7) % 10]}-${i}`;
  const path = `/home/me/code/${words[(i * 3) % 10]}/${name}`;
  return { name, path, lname: name.toLowerCase(), lpath: path.toLowerCase() };
});
const recent = rows.slice(0, 50).map((r) => r.path);

test("ranking 5,000 rows takes under 16 ms per key", () => {
  const typed = "acme-web-12";
  best(rows, "a", 12, (p) => p, recent); // warm up
  let worst = 0;
  for (let n = 1; n <= typed.length; n++) {
    const start = performance.now();
    best(rows, typed.slice(0, n), 12, (p) => p, recent);
    worst = Math.max(worst, performance.now() - start);
  }
  assert.ok(worst < 16, `slowest key took ${worst.toFixed(1)} ms`);
});
