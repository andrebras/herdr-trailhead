import { test } from "node:test";
import assert from "node:assert/strict";
import { openSpaces, spaceFor, buildRows, onListedMachines, preparer, pathRows } from "../mods/trailhead/spaces.js";
import { makePaths } from "../mods/trailhead/paths.js";
import { projectKey } from "../mods/trailhead/keys.js";
import { ordered } from "../mods/trailhead/match.js";

const space = (id, folder, extra = {}) => ({
  id,
  name: id,
  folder,
  machine: null,
  active: false,
  status: null,
  tabs: [{ id: `${id}-t`, active: true }],
  ...extra,
});
const project = (path, extra = {}) => ({ path, kind: "repo", name: path.split("/").pop(), ...extra });
const prepare = (p) => ({ ...p, key: projectKey(p.machine, p.path), lname: p.name, lpath: p.path });
const here = [{ name: null, layout: "ready" }];
const rowsOf = (spaces, projects, machines = here, panes = []) =>
  buildRows(openSpaces(spaces, panes), projects.map(prepare), {
    machines,
    touched: new Map(),
    sep: "/",
    prepare,
  });

test("two spaces in one folder, or with no folder, are different rows", () => {
  const rows = rowsOf([space("s1", "/h/app"), space("s2", "/h/app"), space("s3", ""), space("s4", "")], []);
  assert.equal(new Set(rows.map((r) => r.key)).size, 4);
  assert.deepEqual(
    rows.map((r) => r.pkey),
    ["/h/app", "/h/app", null, null],
  );
});

test("jump back between two spaces of one project", () => {
  // In s1, you pick s2; Trailhead opened again in s2 offers s1 first and s2 last.
  const rows = rowsOf([space("s1", "/h/app"), space("s2", "/h/app"), space("other", "/h/other")], []);
  const [s1, s2] = rows;
  const recent = [s2.key, "/h/app", s1.key, "/h/app"];
  const names = ordered(rows, recent, s2.key).map((r) => r.name);
  assert.deepEqual(names, ["s1", "other", "s2"]);
});

test("a pick of the current project doesn't make its other space the previous one", () => {
  // In a, you pick s1; opened again in s1, a comes first, not s1's sibling s2.
  const rows = rowsOf([space("a", "/h/a"), space("s1", "/h/app"), space("s2", "/h/app")], []);
  const [a, s1] = rows;
  const recent = [s1.key, "/h/app", a.key, "/h/a"];
  assert.equal(ordered(rows, recent, s1.key)[0].name, "a");
});

test("a project picked before its space opened is still the previous one", () => {
  const rows = rowsOf([space("c", "/h/c"), space("b", "/h/b")], []);
  const [c] = rows;
  // b was picked as a project (its folder's key), then c was reached from the sidebar.
  assert.equal(ordered(rows, [c.key, "/h/b"], c.key)[0].name, "b");
});

test("projects with an open space show as that space; the rest as projects", () => {
  const panes = [{ tab: "s1-t", cwd: "/h/app/src", focused: true }];
  const rows = rowsOf([space("s1", "")], [project("/h/app"), project("/h/web")], here, panes);
  assert.deepEqual(
    rows.map((r) => [r.name, r.kind, r.key]),
    [
      ["s1", "space", "space::s1"],
      ["web", "repo", "/h/web"],
    ],
  );
});

test("spaceFor finds the space made in a folder, else one with a terminal inside it", () => {
  const open = openSpaces(
    [space("s1", "/h/app"), space("s2", "", { machine: "devbox" })],
    [{ tab: "s2-t", cwd: "/srv/api/lib", focused: false }],
  );
  assert.equal(spaceFor("/h/app", open, null, "/")?.id, "s1");
  assert.equal(spaceFor("/srv/api", open, "devbox", "/")?.id, "s2");
  assert.equal(spaceFor("/srv/ap", open, "devbox", "/"), undefined);
  assert.equal(spaceFor("/srv/api", open, null, "/"), undefined);
});

test("a removed machine's projects are dropped; an unreachable one's are kept but hidden", () => {
  const projects = [project("/h/app"), project("/srv/api", { machine: "devbox" }), project("/x", { machine: "gone" })];
  const machines = [...here, { name: "devbox", layout: "unavailable" }];
  assert.deepEqual(
    onListedMachines(projects, machines).map((p) => p.path),
    ["/h/app", "/srv/api"],
  );
  assert.deepEqual(
    rowsOf([], projects, machines).map((r) => r.path),
    ["/h/app"],
  );
  const back = [...here, { name: "devbox", layout: "ready" }];
  assert.deepEqual(
    rowsOf([], projects, back).map((r) => r.path),
    ["/h/app", "/srv/api"],
  );
});

test("rows show paths with their own machine's home as ~", () => {
  const prep = preparer(makePaths("/Users/sam").short);
  const local = prep(project("/Users/sam/code/App"));
  assert.deepEqual([local.key, local.lname, local.lpath], ["/Users/sam/code/App", "app", "~/code/app"]);
  const remote = prep(project("/home/me/api", { machine: "devbox", home: "/home/me" }));
  assert.deepEqual([remote.key, remote.lpath], ["devbox:/home/me/api", "~/api"]);
  assert.equal(prep(project("/srv/x", { machine: "devbox", home: null })).lpath, "/srv/x");
});

test("a typed path shows that folder first, then the projects inside it", () => {
  const paths = makePaths("/Users/sam");
  const rows = [project("/Users/sam/code/app"), project("/Users/sam/code/web"), project("/Users/sam/notes")];
  assert.deepEqual(
    pathRows(rows, "/Users/sam/Code", paths, 12).map((r) => r.path),
    ["/Users/sam/Code", "/Users/sam/code/app", "/Users/sam/code/web"],
  );
  assert.equal(pathRows(rows, "/Users/sam/Code", paths, 12)[0].kind, "typed");
  assert.equal(pathRows(rows, "/Users/sam/notes", paths, 12)[0].kind, "repo");
});
