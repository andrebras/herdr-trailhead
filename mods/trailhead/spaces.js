// The open spaces and the projects, merged into the rows of the list. Knows nothing about
// Herdr (main.js passes in what Herdr reports), so tests can run it under node.

import { projectKey, spaceKey } from "./keys.js";
import { makePaths } from "./paths.js";

/**
 * The parts of a space, a terminal and a machine that Trailhead uses (Herdr's SpaceInfo,
 * PaneInfo and machines() entries have more).
 * @typedef {{ id: string, name: string, folder: string, machine: string | null, active: boolean,
 *   status: "working" | "blocked" | "done" | "idle" | null, tabs: { id: string, active: boolean }[] }} Space
 * @typedef {{ tab: string, cwd: string | null, focused: boolean }} Pane
 * @typedef {{ name: string | null, layout: string }} Machine
 * @typedef {{ space: Space, folders: string[] }} OpenSpace
 * @typedef {import("./kept.js").Project} Project
 * @typedef {{ kind: "typed", name: string, path: string, touched: null }} TypedRow a typed folder
 */

/**
 * Whether a row is the folder a typed path names, rather than a project or a space.
 * @template {{ kind: string }} R
 * @param {R | TypedRow} r
 * @returns {r is TypedRow}
 */
export const isTyped = (r) => r.kind === "typed";

/**
 * Each open space with its folders: where it is now first (its shown tab's focused terminal,
 * else its first), then its other terminals' folders, then where it was made.
 * @param {Space[]} spaces
 * @param {Pane[]} panes
 * @returns {OpenSpace[]}
 */
export function openSpaces(spaces, panes) {
  return spaces.map((space) => {
    const shown = space.tabs.find((t) => t.active) ?? space.tabs[0];
    const tabs = new Set(space.tabs.map((t) => t.id));
    const mine = panes.filter((p) => tabs.has(p.tab) && p.cwd);
    const here = mine.filter((p) => p.tab === shown?.id);
    const now = (here.find((p) => p.focused) ?? here[0])?.cwd;
    const folders = [now, ...mine.map((p) => p.cwd), space.folder].filter(
      /** @returns {f is string} */ (f) => typeof f === "string" && f !== "",
    );
    return { space, folders: [...new Set(folders)] };
  });
}

/**
 * The space for a folder on a machine (null: this computer): made there, else one with a
 * terminal in it. `sep` is this computer's separator; other machines use "/".
 * @param {string} path
 * @param {OpenSpace[]} open
 * @param {string | null} machine
 * @param {string} sep
 * @returns {Space | undefined}
 */
export function spaceFor(path, open, machine, sep) {
  const mine = open.filter(({ space }) => (space.machine ?? null) === machine);
  const made = mine.find(({ space }) => space.folder === path);
  if (made) return made.space;
  const s = machine ? "/" : sep;
  const prefix = path.endsWith(s) ? path : `${path}${s}`;
  return mine.find(({ folders }) => folders.some((cwd) => cwd === path || cwd.startsWith(prefix)))?.space;
}

/**
 * The projects worth keeping: those on this computer or on a machine Herdr still lists. A
 * machine that was removed takes its projects with it.
 * @template {Project} P
 * @param {P[]} projects
 * @param {Machine[]} machines
 * @returns {P[]}
 */
export function onListedMachines(projects, machines) {
  const listed = new Set(machines.map((m) => m.name));
  return projects.filter((p) => !p.machine || listed.has(p.machine));
}

/**
 * Every row: one per open space, then each project no open space is in. Projects on a machine
 * that is gone or can't be reached now are left out: they couldn't be opened.
 * `prepare` makes a row ready for matching and gives it its project key.
 * @template {Project & { key: string }} P
 * @param {OpenSpace[]} open
 * @param {P[]} projects
 * @param {{ machines: Machine[], touched: Map<string, number>, sep: string, prepare: (p: Project) => P }} how
 * @returns {(P & { space?: Space, pkey: string | null, touched: number | null })[]}
 */
export function buildRows(open, projects, { machines, touched, sep, prepare }) {
  const up = new Set(machines.filter((m) => m.layout !== "unavailable").map((m) => m.name));
  const shown = projects.filter((p) => !p.machine || up.has(p.machine));
  const kindOf = new Map(shown.map((p) => [projectKey(p.machine, p.path), p.kind]));
  // A space in a worktree belongs to the worktree's repo (for the repo filter) and shows its
  // branch, as the worktree's own row does.
  const treeOf = new Map(shown.map((p) => [projectKey(p.machine, p.path), { repo: p.repo, branch: p.branch }]));
  const homeOf = new Map(shown.filter((p) => p.machine).map((p) => [p.machine, p.home]));
  /** @type {(P & { space?: Space, pkey: string | null, touched: number | null })[]} */
  const rows = open.map(({ space, folders }) => {
    const machine = space.machine ?? null;
    const madeThere = space.folder && kindOf.has(projectKey(machine, space.folder));
    const path = madeThere ? space.folder : (folders[0] ?? "");
    const pkey = path ? projectKey(machine, path) : null;
    const kind = (pkey && kindOf.get(pkey)) || "space";
    const home = homeOf.get(machine) ?? null;
    const tree = pkey ? treeOf.get(pkey) : undefined;
    const repo = tree?.repo ?? null;
    const row = prepare({ kind, name: space.name, path, machine, home, repo, branch: tree?.branch ?? null });
    // Keyed by its id, not its folder: two spaces can share a folder, or have none.
    return {
      ...row,
      space,
      key: spaceKey(machine, space.id),
      pkey,
      touched: pkey ? (touched.get(pkey) ?? null) : null,
    };
  });
  for (const p of shown) {
    if (spaceFor(p.path, open, p.machine ?? null, sep)) continue;
    rows.push({ ...p, pkey: p.key, touched: touched.get(p.key) ?? null });
  }
  return rows;
}

/**
 * What a row shows as its name: a worktree with a known branch shows its repo and that branch
 * ("acme-web › fix-login"); anything else, its name.
 * @param {Project} p
 */
export function label(p) {
  if (p.kind !== "worktree" || !p.repo || !p.branch) return p.name;
  const repo = p.repo.split(/[/\\]/).filter(Boolean).pop() ?? p.repo;
  return `${repo} › ${p.branch}`;
}

/**
 * Makes projects ready for matching: each gets its project key, its label (see `label`), and
 * its label and its path as shown (home as ~, on its own machine) in lowercase, worked out
 * once rather than per key. The label is what is matched, so a worktree's branch is too.
 * @param {(path: string) => string} short this computer's path as shown
 * @returns {<T extends Project>(p: T) => T & { key: string, label: string, lname: string, lpath: string }}
 */
export function preparer(short) {
  /** @type {Map<string, (path: string) => string>} */
  const there = new Map();
  /** @param {Project} p */
  const shown = (p) => {
    if (!p.machine) return short(p.path);
    if (!p.home) return p.path;
    let s = there.get(p.home);
    if (!s) there.set(p.home, (s = makePaths(p.home).short));
    return s(p.path);
  };
  return (p) => {
    const text = label(p);
    return {
      ...p,
      key: projectKey(p.machine, p.path),
      label: text,
      lname: text.toLowerCase(),
      lpath: shown(p).toLowerCase(),
    };
  };
}

/**
 * The rows for a typed folder path: that folder first (a "typed" row when it isn't a
 * project), then the projects inside it, at most `shown`. Letter case is ignored.
 * @template {{ path: string }} R
 * @param {R[]} rows
 * @param {string} path the typed path, with ~ expanded and no trailing separator
 * @param {{ join: (dir: string, name: string) => string, short: (path: string) => string }} paths
 * @param {number} shown
 * @returns {(R | TypedRow)[]}
 */
export function pathRows(rows, path, { join, short }, shown) {
  const lower = path.toLowerCase();
  const prefix = join(lower, "");
  const same = rows.find((r) => r.path.toLowerCase() === lower);
  const inside = rows.filter((r) => r !== same && r.path.toLowerCase().startsWith(prefix));
  /** @type {TypedRow} */
  const typed = { kind: "typed", name: short(path), path, touched: null };
  return [same ?? typed, ...inside].slice(0, shown);
}
