import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shellPath, findScript, parseFound, scanProblem } from "../mods/trailhead/remote.js";

test("shellPath turns ~ into the machine's home and quotes the rest", () => {
  assert.equal(shellPath("~"), '"$HOME"');
  assert.equal(shellPath("~/my code"), `"$HOME"/'my code'`);
  assert.equal(shellPath("/srv/it's"), `'/srv/it'\\''s'`);
});

test("parseFound reads home, repos, worktrees and unreadable roots", () => {
  const out = ["H /home/me", "R /home/me/code/api", "W /home/me/code/api-login", "E /nope", ""].join("\n");
  assert.deepEqual(parseFound(out), {
    home: "/home/me",
    found: [
      { path: "/home/me/code/api", kind: "repo" },
      { path: "/home/me/code/api-login", kind: "worktree" },
    ],
    unreadable: ["/nope"],
  });
});

test("parseFound reads a worktree's repo and branch from the lines after it", () => {
  const out = ["H /h", "W /h/code/login", "D /h/code/api/.git/worktrees/login", "B fix-login", "R /h/code/api"];
  assert.deepEqual(parseFound(out.join("\n")).found, [
    { path: "/h/code/api", kind: "repo" },
    { path: "/h/code/login", kind: "worktree", repo: "/h/code/api", branch: "fix-login" },
  ]);
});

test("the find script prints a worktree's gitdir and branch, and skips a detached HEAD's", () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "trailhead-")));
  const mk = (p) => mkdirSync(join(home, p), { recursive: true });
  mk("code/api/.git/worktrees/login");
  mk("code/api/.git/worktrees/old");
  mk("code/login");
  mk("code/old");
  writeFileSync(join(home, "code/login/.git"), "gitdir: ../api/.git/worktrees/login\n");
  writeFileSync(join(home, "code/api/.git/worktrees/login/HEAD"), "ref: refs/heads/fix-login\n");
  writeFileSync(join(home, "code/old/.git"), `gitdir: ${home}/code/api/.git/worktrees/old\n`);
  writeFileSync(join(home, "code/api/.git/worktrees/old/HEAD"), "3f2a1c0d9e8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f\n");
  const out = execFileSync("sh", ["-c", findScript(["~/code"], 2)], {
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });
  const trees = parseFound(out).found.filter((p) => p.kind === "worktree");
  assert.deepEqual(
    trees.map((p) => [p.path.slice(home.length), p.branch ?? null]),
    [
      ["/code/login", "fix-login"],
      ["/code/old", null],
    ],
  );
  // A relative gitdir ("../api/...") names the same repo as an absolute one.
  assert.equal(trees[0].repo, join(home, "code/api"));
  assert.equal(trees[1].repo, join(home, "code/api"));
});

test("parseFound leaves out repos inside another repo", () => {
  const out = "R /c/app\nR /c/app/vendor/lib\nR /c/apple\n";
  assert.deepEqual(
    parseFound(out).found.map((p) => p.path),
    ["/c/app", "/c/apple"],
  );
});

test("parseFound leaves out a nested repo even when a sibling sorts between them", () => {
  // "-", "." and " " sort before "/", so app-two lands between app and app/vendor/lib.
  const out = "R /c/app\nR /c/app-two\nR /c/app.old\nR /c/app/vendor/lib\nR /c/app two\n";
  assert.deepEqual(
    parseFound(out).found.map((p) => p.path),
    ["/c/app", "/c/app two", "/c/app-two", "/c/app.old"],
  );
});

test("the find script finds repos and worktrees as the local search does", () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "trailhead-")));
  const mk = (p) => mkdirSync(join(home, p), { recursive: true });
  mk("code/api/.git");
  mk("code/group/web/.git");
  mk("code/group/deep/er/too-deep/.git");
  mk("code/.hidden/secret/.git");
  mk("code/node_modules/pkg/.git");
  mk("code/api/vendor/lib/.git");
  mk("code/login");
  writeFileSync(join(home, "code/login/.git"), "gitdir: /elsewhere\n");
  writeFileSync(join(home, "not-a-folder"), "");
  const out = execFileSync("sh", ["-c", findScript(["~/code", "~/missing", "~/not-a-folder"], 2)], {
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });
  // It stops at a repo: nothing inside api is even listed.
  assert.ok(!out.includes("vendor"), out);
  const { found, unreadable } = parseFound(out);
  assert.deepEqual(
    found.map((p) => `${p.kind} ${p.path.slice(home.length)}`),
    ["repo /code/api", "repo /code/group/web", "worktree /code/login"],
  );
  // A missing root is skipped quietly (roots often differ between machines); one that is
  // there but can't be opened is reported.
  assert.deepEqual(unreadable, [join(home, "not-a-folder")]);
});

test("with the default roots, only those in the home folder under that exact name are searched", () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "trailhead-")));
  mkdirSync(join(home, "Code/api/.git"), { recursive: true });
  writeFileSync(join(home, "src"), "");
  const out = execFileSync("sh", ["-c", findScript(["~/code", "~/Code", "~/src", "~/dev"], 3, true)], {
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });
  // ~/code and ~/Code are one folder on a case-insensitive disk: listed once. ~/src is a file
  // and ~/dev is missing: neither is reported.
  assert.deepEqual(parseFound(out), { home, found: [{ path: join(home, "Code/api"), kind: "repo" }], unreadable: [] });
});

test("each way a machine can fail to list its projects reads differently", () => {
  const ok = { code: 0, stdout: "H /h\n", stderr: "" };
  assert.equal(scanProblem("devbox", 2, ok), null);
  assert.equal(
    scanProblem("devbox", 2, null, new Error("sh took longer than 2 s on devbox and was stopped")),
    "devbox didn't answer within 2 seconds",
  );
  assert.equal(
    scanProblem("devbox", 2, null, new Error("cannot start sh: program not found")),
    "Can't list the projects on devbox: it has no sh",
  );
  assert.equal(
    scanProblem("devbox", 2, null, new Error("machine devbox is not connected\nmore")),
    "Can't reach devbox: machine devbox is not connected",
  );
  assert.equal(
    scanProblem("devbox", 2, { code: 2, stdout: "", stderr: "sh: syntax error\n" }),
    "Listing the projects on devbox failed: sh: syntax error",
  );
  assert.equal(
    scanProblem("devbox", 2, { code: 1, stdout: "", stderr: "" }),
    "Listing the projects on devbox failed: exit code 1",
  );
});
