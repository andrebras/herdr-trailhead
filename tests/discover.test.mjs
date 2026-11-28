import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findProjects, lastChange, projectNames } from "../mods/trailhead/discover.js";
import { makePaths } from "../mods/trailhead/paths.js";
import { DEFAULTS } from "../mods/trailhead/settings.js";

const files = {
  entries: (dir) => readdir(dir, { withFileTypes: true }),
  names: (dir) => readdir(dir),
  read: (path) => readFile(path, "utf8"),
};

// A made-up home folder with `make(home)` run in it.
function homeWith(make) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "trailhead-")));
  make(
    (p) => mkdirSync(join(home, p), { recursive: true }),
    (p, text) => writeFileSync(join(home, p), text),
  );
  return home;
}

const find = (home, settings, defaultRoots = false, maxFolders = 5000) =>
  findProjects({ ...DEFAULTS, ...settings }, defaultRoots, { files, paths: makePaths(home), home, maxFolders });

test("finds repos and worktrees, not inside a repo, hidden folders or node_modules", async () => {
  const home = homeWith((mk, write) => {
    mk("code/api/.git/logs");
    mk("code/api/vendor/lib/.git");
    mk("code/group/web/.git");
    mk("code/.hidden/secret/.git");
    mk("code/node_modules/pkg/.git");
    mk("code/a/b/c/too-deep/.git");
    mk("code/login");
    write("code/login/.git", "");
  });
  writeFileSync(join(home, "code/login/.git"), `gitdir: ${home}/code/api/.git/worktrees/login\n`);
  mkdirSync(join(home, "code/api/.git/worktrees/login"), { recursive: true });
  writeFileSync(join(home, "code/api/.git/worktrees/login/HEAD"), "ref: refs/heads/fix-login\n");
  const { found, unreadable, stopped } = await find(home, { roots: ["~/code"] });
  assert.deepEqual(
    found.map((p) => `${p.kind} ${p.path.slice(home.length)}`),
    ["repo /code/api", "repo /code/group/web", "worktree /code/login"],
  );
  assert.equal(found[0].logs, join(home, "code/api/.git/logs/HEAD"));
  assert.equal(found[2].repo, join(home, "code/api"));
  assert.equal(found[2].branch, "fix-login");
  assert.equal(found[2].logs, join(home, "code/api/.git/worktrees/login/logs/HEAD"));
  assert.deepEqual([unreadable, stopped], [[], false]);
});

test("a root you set that is missing is reported; missing default roots are not", async () => {
  const home = homeWith((mk) => mk("Code/app/.git"));
  assert.deepEqual((await find(home, { roots: ["~/nope"] })).unreadable, ["Can't read ~/nope"]);
  const { found, unreadable } = await find(home, {}, true);
  assert.deepEqual(
    found.map((p) => p.path),
    [join(home, "Code/app")],
  );
  assert.deepEqual(unreadable, []);
});

test("listed folders are added once, and only when they are there", async () => {
  const home = homeWith((mk) => {
    mk("notes");
    mk("code/app/.git");
  });
  const { found } = await find(home, { roots: ["~/code"], folders: ["~/notes", "~/gone", "~/code/app"] });
  assert.deepEqual(
    found.map((p) => `${p.kind} ${p.path.slice(home.length)}`),
    ["repo /code/app", "folder /notes"],
  );
});

test("the search says when it stopped at the folder limit", async () => {
  const home = homeWith((mk) => {
    for (const n of ["a", "b", "c", "d"]) mk(`code/${n}/x`);
  });
  assert.equal((await find(home, { roots: ["~/code"] }, false, 3)).stopped, true);
  assert.equal((await find(home, { roots: ["~/code"] }, false, 100)).stopped, false);
});

test("lastChange reads the reflog's last time, or null without one", async () => {
  const home = homeWith((mk, write) => {
    mk("logs");
    write("logs/HEAD", `${"0".repeat(40)} ${"a".repeat(40)} Sam <sam@example.com> 1700000000 +0000\tcommit: x\n`);
  });
  assert.equal(await lastChange(join(home, "logs/HEAD"), files), 1700000000);
  assert.equal(await lastChange(join(home, "nope"), files), null);
});

test("a worktree is named after its repo too, and clashing names get more of the path", () => {
  const base = (p) => p.split("/").pop();
  assert.deepEqual(
    projectNames([{ path: "/h/acme-login", repo: "/h/acme" }, { path: "/h/work/api" }, { path: "/h/home/api" }], base),
    ["acme/acme-login", "work/api", "home/api"],
  );
});
