import { test } from "node:test";
import assert from "node:assert/strict";
import { keptText, readKept } from "../mods/trailhead/kept.js";

test("the kept list reads back what was written, with times", () => {
  const projects = [
    { path: "/h/code/acme", kind: "repo", name: "acme", logs: "/h/code/acme/.git/logs/HEAD" },
    { path: "/srv/api", kind: "repo", name: "api", machine: "devbox" },
  ];
  const touched = new Map([
    ["/h/code/acme", 100],
    ["devbox:/srv/api", 200],
  ]);
  const back = readKept(keptText(projects, touched));
  assert.equal(back?.length, 2);
  assert.equal(back?.[0].touched, 100);
  assert.equal(back?.[1].machine, "devbox");
  assert.equal(back?.[1].touched, 200);
});

test("a missing, broken or older kept list reads as none", () => {
  assert.equal(readKept(null), null);
  assert.equal(readKept("{not json"), null);
  assert.equal(readKept(JSON.stringify({ version: 0, rows: [] })), null);
});

test("rows without a path, kind or name are dropped", () => {
  const text = JSON.stringify({
    version: 1,
    rows: [
      { path: "/a", kind: "repo" },
      { path: "/b", kind: "repo", name: "b" },
    ],
  });
  assert.deepEqual(
    readKept(text)?.map((r) => r.path),
    ["/b"],
  );
});
