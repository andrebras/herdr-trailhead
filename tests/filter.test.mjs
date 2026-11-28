import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL,
  isMachine,
  machineQuery,
  machineRows,
  typedMachine,
  onMachine,
  repoOf,
  reposWithWorktrees,
  inRepo,
} from "../mods/trailhead/filter.js";

const names = [LOCAL, "devbox", "dev-gpu", "gpu-box"];

test("machineQuery reads a lone @ and what follows it", () => {
  assert.equal(machineQuery("@"), "");
  assert.equal(machineQuery("@dev"), "dev");
  assert.equal(machineQuery("@dev "), null);
  assert.equal(machineQuery("acme"), null);
  assert.equal(machineQuery("a@b"), null);
});

test("machineRows lists the machines whose name starts with what is typed, any case", () => {
  assert.deepEqual(
    machineRows(names, "").map((r) => r.name),
    names,
  );
  assert.deepEqual(
    machineRows(names, "DEV").map((r) => r.name),
    ["devbox", "dev-gpu"],
  );
  assert.deepEqual(machineRows(names, "box"), []);
  const [row] = machineRows(names, "gpu");
  assert.equal(isMachine(row), true);
  assert.equal(row.key, "machine:gpu-box");
});

test("typedMachine picks the selected machine, else the first that matches", () => {
  assert.deepEqual(typedMachine("@dev ", names, null), { machine: "devbox", rest: "" });
  assert.deepEqual(typedMachine("@dev ", names, "dev-gpu"), { machine: "dev-gpu", rest: "" });
  assert.deepEqual(typedMachine("@dev ", names, "gpu-box"), { machine: "devbox", rest: "" });
  assert.deepEqual(typedMachine("@ ", names, "gpu-box"), { machine: "gpu-box", rest: "" });
  assert.deepEqual(typedMachine("@gpu acme web", names, null), { machine: "gpu-box", rest: "acme web" });
});

test("typedMachine leaves the text alone when nothing matches or no space was typed", () => {
  assert.equal(typedMachine("@nope ", names, null), null);
  assert.equal(typedMachine("@dev", names, "devbox"), null);
  assert.equal(typedMachine("acme ", names, null), null);
});

test("onMachine keeps the rows of one machine, local being this computer", () => {
  const rows = [{ name: "a" }, { name: "b", machine: null }, { name: "c", machine: "devbox" }];
  assert.deepEqual(
    onMachine(rows, LOCAL).map((r) => r.name),
    ["a", "b"],
  );
  assert.deepEqual(
    onMachine(rows, "devbox").map((r) => r.name),
    ["c"],
  );
  assert.deepEqual(onMachine(rows, "gone"), []);
});

const repoRows = [
  { kind: "repo", path: "/h/code/acme-web" },
  { kind: "worktree", path: "/h/code/login", repo: "/h/code/acme-web" },
  { kind: "worktree", path: "/h/code/lost", repo: null },
  { kind: "repo", path: "/h/code/notes" },
  { kind: "folder", path: "/h/notes" },
  { kind: "repo", path: "/h/code/acme-web", machine: "devbox" },
];

test("repoOf names a repo's own folder, or a worktree's repo, on its machine", () => {
  assert.deepEqual(repoOf(repoRows[0]), { key: "/h/code/acme-web", name: "acme-web" });
  assert.deepEqual(repoOf(repoRows[1]), { key: "/h/code/acme-web", name: "acme-web" });
  assert.deepEqual(repoOf(repoRows[5]), { key: "devbox:/h/code/acme-web", name: "acme-web" });
  assert.equal(repoOf(repoRows[2]), null);
  assert.equal(repoOf(repoRows[4]), null);
  assert.equal(repoOf({ kind: "worktree", path: "C:\\code\\login", repo: "C:\\code\\acme" })?.name, "acme");
});

test("only repos with a worktree in the list can be narrowed to", () => {
  assert.deepEqual([...reposWithWorktrees(repoRows)], ["/h/code/acme-web"]);
});

test("inRepo keeps a repo and its worktrees, on that machine only", () => {
  assert.deepEqual(
    inRepo(repoRows, "/h/code/acme-web").map((r) => r.path),
    ["/h/code/acme-web", "/h/code/login"],
  );
  assert.deepEqual(inRepo(repoRows, "devbox:/h/code/acme-web"), [repoRows[5]]);
});
