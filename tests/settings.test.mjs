import { test } from "node:test";
import assert from "node:assert/strict";
import { readSettings, DEFAULTS } from "../mods/trailhead/settings.js";

test("no files means the defaults and no problems", () => {
  assert.deepEqual(readSettings(null, null), { settings: DEFAULTS, problems: [] });
});

test("mod.json settings win over projects.json, which fills the rest", () => {
  const mod = JSON.stringify({ settings: { roots: ["~/code"], agent: ["codex"] } });
  const old = JSON.stringify({ roots: ["~/old"], depth: 2, folders: ["~/notes"] });
  const { settings, problems } = readSettings(mod, old);
  assert.deepEqual(settings.roots, ["~/code"]);
  assert.equal(settings.depth, 2);
  assert.deepEqual(settings.folders, ["~/notes"]);
  assert.deepEqual(settings.agent, ["codex"]);
  assert.deepEqual(problems, []);
});

test("a bad value falls back to its default and is reported", () => {
  const mod = JSON.stringify({ settings: { depth: 9, agent: "claude", zoxide: "yes" } });
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
    "mod.json isn't valid JSON; using the defaults",
    "projects.json isn't valid JSON; using the defaults",
  ]);
});

test("an empty folders list is fine", () => {
  assert.deepEqual(readSettings(JSON.stringify({ settings: { folders: [] } }), null).problems, []);
});
