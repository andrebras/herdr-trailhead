import { test } from "node:test";
import assert from "node:assert/strict";
import { command, installedCheck } from "../mods/trailhead/actions.js";

const project = { path: "/h/code/acme", name: "acme" };
const space = { id: "sp1" };

test("Enter goes to the open space, or makes one", () => {
  assert.deepEqual(command(project, space, {}), { name: "space.select", args: { id: "sp1" } });
  assert.deepEqual(command(project, null, {}), { name: "space.new", args: { folder: "/h/code/acme", name: "acme" } });
});

test("Alt+Enter makes a new space even when one is open", () => {
  assert.equal(command(project, space, { fresh: true }).name, "space.new");
});

test("Cmd+Enter starts the agent in a new tab, or in a new space", () => {
  assert.deepEqual(command(project, space, { agent: ["claude"] }), {
    name: "tab.new",
    args: { space: "sp1", folder: "/h/code/acme", argv: ["claude"] },
  });
  assert.deepEqual(command(project, null, { agent: ["claude", "--resume"] }).args.argv, ["claude", "--resume"]);
});

test("a project on another machine makes its space there", () => {
  const remote = { ...project, machine: "devbox" };
  assert.equal(command(remote, null, {}).args.machine, "devbox");
});

test("the installed check uses sh, or where on Windows", () => {
  assert.equal(installedCheck("claude", false).command, "sh");
  assert.deepEqual(installedCheck("claude", true), { command: "where", args: ["claude"] });
});
