// The filters above the list: a machine (typing "@" lists the machines, and picking one shows
// only its projects) and a repo (Tab shows only a repo and its worktrees). Knows nothing about
// Herdr, so tests can run it under node.

import { projectKey } from "./keys.js";

// What the filter calls this computer. A project here has no machine (null).
export const LOCAL = "local";

/**
 * A machine offered while "@" is typed, as a row of the list.
 * @typedef {{ kind: "machine", name: string, path: "", key: string, touched: null }} MachineRow
 */

/**
 * Whether a row is a machine to filter by, rather than a project, a space or a folder.
 * @template {{ kind: string }} R
 * @param {R | MachineRow} r
 * @returns {r is MachineRow}
 */
export const isMachine = (r) => r.kind === "machine";

/**
 * What follows a lone "@" (the start of a machine's name), or null when the text isn't that.
 * @param {string} text
 */
export function machineQuery(text) {
  const m = /^@(\S*)$/.exec(text);
  return m ? m[1] : null;
}

/**
 * The machines whose name starts with `prefix`, letter case ignored, as rows.
 * @param {string[]} names "local" first, then each connected machine
 * @param {string} prefix
 * @returns {MachineRow[]}
 */
export function machineRows(names, prefix) {
  const p = prefix.toLowerCase();
  return names
    .filter((name) => name.toLowerCase().startsWith(p))
    .map((name) => ({ kind: "machine", name, path: "", key: `machine:${name}`, touched: null }));
}

/**
 * "@dev " typed with a space after it: the machine to filter by and what was typed after the
 * space. The machine is `selected` when it matches, else the first that does; null when none
 * matches or the text isn't that.
 * @param {string} text
 * @param {string[]} names
 * @param {string | null} selected the machine row selected before the space
 * @returns {{ machine: string, rest: string } | null}
 */
export function typedMachine(text, names, selected) {
  const m = /^@(\S*) ([\s\S]*)$/.exec(text);
  if (!m) return null;
  const hits = machineRows(names, m[1]).map((r) => r.name);
  if (hits.length === 0) return null;
  return { machine: selected && hits.includes(selected) ? selected : hits[0], rest: m[2] };
}

/**
 * The rows on one machine: "local" is this computer.
 * @template {{ machine?: string | null }} R
 * @param {R[]} rows
 * @param {string} machine
 * @returns {R[]}
 */
export function onMachine(rows, machine) {
  const want = machine === LOCAL ? null : machine;
  return rows.filter((r) => (r.machine ?? null) === want);
}

/**
 * A row as the repo filter sees it.
 * @typedef {{ kind: string, path: string, repo?: string | null, machine?: string | null }} RepoRow
 */

/**
 * The repo a row belongs to: a repo's own folder, a worktree's repo. `key` tells repos apart
 * (its machine and folder); `name` is its folder's name, for the pill. Null for anything else,
 * and for a worktree whose repo isn't known.
 * @param {RepoRow} r
 * @returns {{ key: string, name: string } | null}
 */
export function repoOf(r) {
  const repo = r.kind === "repo" ? r.path : r.kind === "worktree" ? r.repo : null;
  if (!repo) return null;
  return { key: projectKey(r.machine, repo), name: repo.split(/[/\\]/).filter(Boolean).pop() ?? repo };
}

/**
 * The keys of the repos that have a worktree in the list.
 * @param {RepoRow[]} rows
 * @returns {Set<string>}
 */
export function reposWithWorktrees(rows) {
  /** @type {Set<string>} */
  const keys = new Set();
  for (const r of rows) {
    const repo = r.kind === "worktree" ? repoOf(r) : null;
    if (repo) keys.add(repo.key);
  }
  return keys;
}

/**
 * A repo's rows: the repo itself and its worktrees.
 * @template {RepoRow} R
 * @param {R[]} rows
 * @param {string} key the repo's key, from repoOf
 * @returns {R[]}
 */
export function inRepo(rows, key) {
  return rows.filter((r) => repoOf(r)?.key === key);
}
