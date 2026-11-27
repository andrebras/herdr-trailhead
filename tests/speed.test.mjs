// The speed bar: each key press re-ranks 5,000 rows in under one frame (16 ms), and the order
// with nothing typed is worked out as fast. These run under Node.js, which compiles
// JavaScript and is several times faster than Herdr's engine (QuickJS); bin/bench-herdr times
// the same work inside Herdr.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rankIndex, bestIn, best, ordered } from "../mods/trailhead/match.js";
import { benchRows } from "../bench/rows.js";

const { rows, recent } = benchRows();
const show = (p) => p;

test("ranking 5,000 rows takes under 16 ms per key", () => {
  const typed = "acme-web-12";
  const index = rankIndex(rows, show, recent);
  let worst = 0;
  for (let n = 1; n <= typed.length; n++) {
    const start = performance.now();
    bestIn(index, typed.slice(0, n), 12);
    worst = Math.max(worst, performance.now() - start);
  }
  assert.ok(worst < 16, `slowest key took ${worst.toFixed(1)} ms`);
});

test("the order with nothing typed takes under 16 ms for 5,000 rows", () => {
  const start = performance.now();
  ordered(rows, recent, null, 12);
  const took = performance.now() - start;
  assert.ok(took < 16, `took ${took.toFixed(1)} ms`);
});

test("typing more letters gives the same rows as ranking from scratch", () => {
  const index = rankIndex(rows, show, recent);
  for (const f of ["a", "ac", "acm", "acme", "acme-w", "ac", "web", "web-1", "zz", "z"]) {
    assert.deepEqual(bestIn(index, f, 12), best(rows, f, 12, show, recent), f);
  }
});

test("the order for the first 12 is the first 12 of the full order", () => {
  for (const current of [null, rows[7].key]) {
    assert.deepEqual(ordered(rows, recent, current, 12), ordered(rows, recent, current).slice(0, 12));
  }
});
