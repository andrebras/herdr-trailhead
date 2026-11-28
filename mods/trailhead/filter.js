// The machine filter: typing "@" lists the machines, and picking one shows only its
// projects. Knows nothing about Herdr, so tests can run it under node.

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
