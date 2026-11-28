import { test } from "node:test";
import assert from "node:assert/strict";
import { readSettings, loadSettings, presentRoots, DEFAULTS } from "../mods/trailhead/settings.js";

test("no files means the defaults and no problems", () => {
  assert.deepEqual(readSettings(null), { settings: DEFAULTS, problems: [], defaultRoots: true });
});

test("the default roots are the usual code folders, searched only where they exist", () => {
  assert.ok(DEFAULTS.roots.includes("~/code") && DEFAULTS.roots.includes("~/Developer"));
  assert.equal(readSettings(JSON.stringify({ roots: ["~/mine"] })).defaultRoots, false);
  // A bad "roots" is reported and the defaults are used, quietly where they're missing.
  assert.equal(readSettings(JSON.stringify({ roots: "~/mine" })).defaultRoots, true);
  assert.deepEqual(presentRoots(DEFAULTS.roots, ["Code", "Documents", "Lab", "code.txt"]), ["~/Code", "~/Lab"]);
});

test("a bad value falls back to its default and is reported", () => {
  const mod = JSON.stringify({ depth: 9, agent: "claude", zoxide: "yes" });
  const { settings, problems } = readSettings(mod);
  assert.equal(settings.depth, 3);
  assert.deepEqual(settings.agent, ["claude"]);
  assert.equal(settings.zoxide, "auto");
  assert.equal(problems.length, 3);
  assert.match(problems[0], /"depth" must be a whole number from 1 to 6/);
});

test("broken JSON is reported and the defaults are used", () => {
  const { settings, problems } = readSettings("{nope");
  assert.deepEqual(settings, DEFAULTS);
  assert.deepEqual(problems, ["trailhead.json isn't valid JSON; using the defaults"]);
});

test("an empty folders list is fine", () => {
  assert.deepEqual(readSettings(JSON.stringify({ folders: [] })).problems, []);
});

test("trailhead.json that isn't an object is reported", () => {
  const { settings, problems } = readSettings("[1]");
  assert.deepEqual(settings, DEFAULTS);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /trailhead.json must hold an object/);
});

test("a settings file that can't be read is reported; a missing one isn't", async () => {
  const files = { "trailhead.json": JSON.stringify({ depth: 2 }) };
  const read = async (name) => files[name] ?? null;
  assert.deepEqual((await loadSettings(read)).problems, []);
  assert.equal((await loadSettings(read)).settings.depth, 2);
  const denied = async (name) => {
    if (name === "trailhead.json") throw new Error("Permission denied");
    return null;
  };
  const { settings, problems } = await loadSettings(denied);
  assert.deepEqual(settings, DEFAULTS);
  assert.deepEqual(problems, ["Can't read trailhead.json in Herdr's folder (Permission denied); using the defaults"]);
});
