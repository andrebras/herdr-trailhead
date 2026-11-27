import { test } from "node:test";
import assert from "node:assert/strict";
import { readSettings, presentRoots, DEFAULTS } from "../mods/trailhead/settings.js";

test("no files means the defaults and no problems", () => {
  assert.deepEqual(readSettings(null, null), { settings: DEFAULTS, problems: [], defaultRoots: true });
});

test("the default roots are the usual code folders, searched only where they exist", () => {
  assert.ok(DEFAULTS.roots.includes("~/code") && DEFAULTS.roots.includes("~/Developer"));
  assert.equal(readSettings(JSON.stringify({ roots: ["~/mine"] }), null).defaultRoots, false);
  // A bad "roots" is reported and the defaults are used, quietly where they're missing.
  assert.equal(readSettings(JSON.stringify({ roots: "~/mine" }), null).defaultRoots, true);
  assert.deepEqual(presentRoots(DEFAULTS.roots, ["Code", "Documents", "Lab", "code.txt"]), ["~/Code", "~/Lab"]);
});

test("trailhead.json wins over projects.json, which fills the rest", () => {
  const mod = JSON.stringify({ roots: ["~/code"], agent: ["codex"] });
  const old = JSON.stringify({ roots: ["~/old"], depth: 2, folders: ["~/notes"] });
  const { settings, problems } = readSettings(mod, old);
  assert.deepEqual(settings.roots, ["~/code"]);
  assert.equal(settings.depth, 2);
  assert.deepEqual(settings.folders, ["~/notes"]);
  assert.deepEqual(settings.agent, ["codex"]);
  assert.deepEqual(problems, []);
});

test("a bad value falls back to its default and is reported", () => {
  const mod = JSON.stringify({ depth: 9, agent: "claude", zoxide: "yes" });
  const { settings, problems } = readSettings(mod, null);
  assert.equal(settings.depth, 3);
  assert.deepEqual(settings.agent, ["claude"]);
  assert.equal(settings.zoxide, "auto");
  assert.equal(problems.length, 3);
  assert.match(problems[0], /"depth" must be a whole number from 1 to 6/);
});

test("broken JSON is reported and the defaults are used", () => {
  const { settings, problems } = readSettings("{nope", "[1,");
  assert.deepEqual(settings, DEFAULTS);
  assert.deepEqual(problems, [
    "trailhead.json isn't valid JSON; using the defaults",
    "projects.json isn't valid JSON; using the defaults",
  ]);
});

test("an empty folders list is fine", () => {
  assert.deepEqual(readSettings(JSON.stringify({ folders: [] }), null).problems, []);
});

test("trailhead.json that isn't an object is reported", () => {
  const { settings, problems } = readSettings("[1]", null);
  assert.deepEqual(settings, DEFAULTS);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /trailhead.json must hold an object/);
});
