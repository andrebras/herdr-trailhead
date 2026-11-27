// The keys that tell rows apart. Knows nothing about Herdr, so tests can run it under node.
//
// A project is known by its machine and folder; an open space by its machine and id, because
// two spaces can share a folder (Alt+Enter makes one) and a space can have no folder at all.

/**
 * A project's key: its folder on this computer, or "<machine>:<folder>" on another machine.
 * The recent picks and the kept list store it, so its form must not change.
 * @param {string | null | undefined} machine
 * @param {string} path
 */
export const projectKey = (machine, path) => (machine ? `${machine}:${path}` : path);

/**
 * An open space's key.
 * @param {string | null | undefined} machine
 * @param {string} id
 */
export const spaceKey = (machine, id) => `space:${machine ?? ""}:${id}`;
