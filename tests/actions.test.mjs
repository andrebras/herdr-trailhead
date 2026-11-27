import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command, installedCheck, checkedProgram } from "../mods/trailhead/actions.js";

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
  assert.equal(installedCheck("claude", false)?.command, "sh");
  assert.deepEqual(installedCheck("claude", true), { command: "where", args: ["claude"] });
  // `where` takes no paths: such an agent is started unchecked.
  assert.equal(installedCheck("C:\\tools\\agent.exe", true), null);
});

// Runs the check as Herdr's exec would, with `home` as the home folder.
const runCheck = (program, home) => {
  const check = installedCheck(program, false);
  try {
    const stdout = execFileSync(check.command, check.args, {
      env: { PATH: "/usr/bin:/bin", HOME: home },
      encoding: "utf8",
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout };
  }
};

test("an agent under ~ is found, and starts with ~ expanded", () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "trailhead-")));
  mkdirSync(join(home, "bin"));
  writeFileSync(join(home, "bin/start-work"), "#!/bin/sh\n", { mode: 0o755 });
  const found = runCheck("~/bin/start-work", home);
  assert.equal(checkedProgram("~/bin/start-work", false, found), join(home, "bin/start-work"));
  assert.equal(checkedProgram("sh", false, runCheck("sh", home)), "sh");
  assert.equal(checkedProgram("~/bin/nope", false, runCheck("~/bin/nope", home)), null);
  assert.equal(checkedProgram("claude", true, { code: 0, stdout: "C:\\x\\claude.exe\r\n" }), "claude");
});
