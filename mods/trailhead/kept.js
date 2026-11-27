// The list Trailhead keeps between opens, so the popup can draw it in its first frame and
// look for changes afterwards. Knows nothing about Herdr, so tests can run it under node.

import { projectKey } from "./keys.js";

const VERSION = 1;

/**
 * A project as found on disk and kept between opens.
 * @typedef {{ path: string, kind: string, name: string, logs?: string | null, repo?: string | null,
 *   machine?: string | null, home?: string | null, touched?: number | null }} Project
 */

/**
 * The text to keep: the projects with what was learned about each.
 * @param {Project[]} projects
 * @param {Map<string, number>} touched when each project (by projectKey) last changed, in seconds
 * @returns {string}
 */
export function keptText(projects, touched) {
  const rows = projects.map((p) => ({
    path: p.path,
    kind: p.kind,
    name: p.name,
    logs: p.logs ?? null,
    repo: p.repo ?? null,
    machine: p.machine ?? null,
    home: p.home ?? null,
    touched: touched.get(projectKey(p.machine, p.path)) ?? p.touched ?? null,
  }));
  return JSON.stringify({ version: VERSION, rows });
}

/**
 * The kept projects, or null when there are none or the text is from another version.
 * @param {string | null} text
 * @returns {Project[] | null}
 */
export function readKept(text) {
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    if (data?.version !== VERSION || !Array.isArray(data.rows)) return null;
    const str = (/** @type {unknown} */ v) => typeof v === "string";
    return data.rows
      .filter((/** @type {any} */ r) => r && str(r.path) && str(r.kind) && str(r.name))
      .map((/** @type {any} */ r) => ({
        path: r.path,
        kind: r.kind,
        name: r.name,
        logs: str(r.logs) ? r.logs : null,
        repo: str(r.repo) ? r.repo : null,
        machine: str(r.machine) ? r.machine : null,
        home: str(r.home) ? r.home : null,
        touched: typeof r.touched === "number" ? r.touched : null,
      }));
  } catch {
    return null;
  }
}
