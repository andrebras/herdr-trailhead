import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shellPath, findScript, parseFound } from "../mods/trailhead/remote.js";

test("shellPath turns ~ into the machine's home and quotes the rest", () => {
  assert.equal(shellPath("~"), '"$HOME"');
  assert.equal(shellPath("~/my code"), `"$HOME"/'my code'`);
  assert.equal(shellPath("/srv/it's"), `'/srv/it'\\''s'`);
});

test("parseFound reads home, repos, worktrees and unreadable roots", () => {
  const out = ["H /home/me", "R /home/me/code/api/.git", "W /home/me/code/api-login/.git", "E /nope", ""].join("\n");
  assert.deepEqual(parseFound(out), {
    home: "/home/me",
    found: [
      { path: "/home/me/code/api", kind: "repo" },
      { path: "/home/me/code/api-login", kind: "worktree" },
    ],
    unreadable: ["/nope"],
  });
});

test("parseFound leaves out repos inside another repo", () => {
  const out = "R /c/app/.git\nR /c/app/vendor/lib/.git\nR /c/apple/.git\n";
  assert.deepEqual(
    parseFound(out).found.map((p) => p.path),
    ["/c/app", "/c/apple"],
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
  mk("code/login");
  writeFileSync(join(home, "code/login/.git"), "gitdir: /elsewhere\n");
  writeFileSync(join(home, "not-a-folder"), "");
  const out = execFileSync("sh", ["-c", findScript(["~/code", "~/missing", "~/not-a-folder"], 2)], {
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });
  const { found, unreadable } = parseFound(out);
  assert.deepEqual(
    found.map((p) => `${p.kind} ${p.path.slice(home.length)}`),
    ["repo /code/api", "repo /code/group/web", "worktree /code/login"],
  );
  // A missing root is skipped quietly (roots often differ between machines); one that is
  // there but can't be opened is reported.
  assert.deepEqual(unreadable, [join(home, "not-a-folder")]);
});
