import { test } from "node:test";
import assert from "node:assert/strict";
import { readRecent, withPick } from "../mods/trailhead/recent.js";

test("stored picks read back, and broken text reads as none", () => {
  assert.deepEqual(readRecent('["/a", 3, "/b"]'), ["/a", "/b"]);
  assert.deepEqual(readRecent(null), []);
  assert.deepEqual(readRecent("{nope"), []);
  assert.deepEqual(readRecent('{"a": 1}'), []);
});

test("a pick goes first, a space's project right after it, without repeats", () => {
  assert.deepEqual(withPick(["/b", "/a"], { key: "/a" }, 10), ["/a", "/b"]);
  assert.deepEqual(withPick(["/p", "/b"], { key: "space::s1", pkey: "/p" }, 10), ["space::s1", "/p", "/b"]);
  assert.deepEqual(withPick(["/a", "/b", "/c"], { key: "/d" }, 3), ["/d", "/a", "/b"]);
});
