// The projects on this computer: the repos under the roots, plus the listed folders. Reads
// folders itself, through the functions it is given, so tests can run it under node on real
// folders and it knows nothing about Herdr.

import { presentRoots } from "./settings.js";
import { reflogTime, uniqueNames, worktreeRepo } from "./match.js";

/**
 * How to read this computer's folders and files: Herdr's `fs/promises`, or node's in tests.
 * Each rejects when it can't read.
 * @typedef {{ name: string, isDirectory(): boolean }} Entry
 * @typedef {{ entries: (dir: string) => Promise<Entry[]>, names: (dir: string) => Promise<string[]>,
 *   read: (path: string) => Promise<string> }} Files
 * @typedef {ReturnType<typeof import("./paths.js").makePaths>} Paths
 * @typedef {{ path: string, kind: "repo" | "worktree" | "folder", logs: string | null,
 *   repo?: string | null }} Found
 */

/**
 * Every repo under the roots and each listed folder, as found: kind "repo" (a .git folder),
 * "worktree" (a .git file pointing at its repo's) or "folder"; `logs` is the reflog that says
 * when it last changed; `repo`, a worktree's repo. A repo's own folders aren't searched, so a
 * submodule or a vendored checkout inside it is left out, and neither are hidden folders and
 * node_modules. Also the roots that couldn't be read, in words for the error bar, and whether
 * the search stopped early because it had looked at `maxFolders` folders.
 * `defaultRoots`: the roots are the defaults, so only those in the home folder are searched,
 * and none is reported missing.
 * @param {import("./settings.js").Settings} settings
 * @param {boolean} defaultRoots
 * @param {{ files: Files, paths: Paths, home: string, maxFolders: number }} io
 * @returns {Promise<{ found: Found[], unreadable: string[], stopped: boolean }>}
 */
export async function findProjects({ roots, depth, folders }, defaultRoots, { files, paths, home, maxFolders }) {
  const { join, expand, trim, inHome, short } = paths;
  /** @type {Found[]} */
  const found = [];
  /** @type {string[]} */
  const unreadable = [];
  let budget = maxFolders;
  /**
   * @param {string} dir
   * @param {number} left how many more levels below this folder may be searched
   * @param {boolean} isRoot
   * @returns {Promise<void>}
   */
  const walk = async (dir, left, isRoot) => {
    if (budget-- <= 0) return;
    let entries;
    try {
      entries = await files.entries(dir);
    } catch {
      // Gone, unreadable, or outside the home folder; a root that can't be read is reported.
      if (isRoot && !defaultRoots)
        unreadable.push(
          inHome(dir) ? `Can't read ${short(dir)}` : `Can't read ${dir}: mods may only read in your home folder`,
        );
      return;
    }
    const git = isRoot ? null : entries.find((e) => e.name === ".git");
    if (git) {
      found.push(
        git.isDirectory()
          ? { path: dir, kind: "repo", logs: join(join(join(dir, ".git"), "logs"), "HEAD") }
          : await worktree(dir, files, paths),
      );
      return;
    }
    if (left <= 0) return;
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules" || !e.isDirectory()) continue;
      await walk(join(dir, e.name), left - 1, false);
    }
  };
  const searched = defaultRoots
    ? presentRoots(roots, await files.names(home).catch(() => /** @type {string[]} */ ([])))
    : roots;
  for (const root of searched) await walk(trim(expand(root)), depth, true);
  found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const seen = new Set(found.map((r) => r.path));
  for (const f of folders) {
    const path = trim(expand(f));
    if (seen.has(path)) continue;
    // Mods may only read in the home folder: a folder elsewhere is listed unchecked.
    const there =
      !inHome(path) ||
      (await files.names(path).then(
        () => true,
        () => false,
      ));
    if (there) found.push({ path, kind: "folder", logs: null });
    seen.add(path);
  }
  return { found, unreadable, stopped: budget < 0 };
}

/**
 * A worktree's .git file says "gitdir: <its folder in the repo's .git>", where its reflog is.
 * @param {string} dir
 * @param {Files} files
 * @param {Paths} paths
 * @returns {Promise<Found>}
 */
async function worktree(dir, files, { join, isPath }) {
  try {
    const text = await files.read(join(dir, ".git"));
    const gitdir = /^gitdir:\s*(.+?)\s*$/m.exec(text)?.[1];
    const abs = gitdir ? (isPath(gitdir) ? gitdir : join(dir, gitdir)) : null;
    const repo = abs ? worktreeRepo(abs) : null;
    return { path: dir, kind: "worktree", repo, logs: abs ? join(join(abs, "logs"), "HEAD") : null };
  } catch {
    return { path: dir, kind: "worktree", logs: null };
  }
}

/**
 * Seconds since 1970 of the reflog's last entry, or null when there is none to read.
 * @param {string} logs
 * @param {Files} files
 */
export async function lastChange(logs, files) {
  try {
    return reflogTime(await files.read(logs));
  } catch {
    return null;
  }
}

/**
 * The names the projects show: their folder's; a worktree's after its repo too
 * ("acme/login"); and where two clash, as much of the path as tells them apart.
 * @param {{ path: string, repo?: string | null }[]} found
 * @param {(path: string) => string} base the last part of a path
 */
export function projectNames(found, base) {
  const label = (/** @type {{ path: string, repo?: string | null }} */ r) =>
    r.repo ? `${base(r.repo)}/${base(r.path)}` : base(r.path);
  return uniqueNames(found.map((r) => ({ path: r.path, label: label(r) })));
}
