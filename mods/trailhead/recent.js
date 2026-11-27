// The recent picks, newest first, as row keys (see keys.js). Knows nothing about Herdr, so
// tests can run it under node; main.js keeps the list in the mod's storage.

/**
 * The picks in stored text; none when the text is missing or broken.
 * @param {string | null} text
 * @returns {string[]}
 */
export function readRecent(text) {
  try {
    const list = JSON.parse(text ?? "[]");
    return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The picks with a row put first: its key, then for a space its project's key, so the
 * project stays recent after the space closes. At most `max` are kept.
 * @param {string[]} list
 * @param {{ key: string, pkey?: string | null }} row
 * @param {number} max
 * @returns {string[]}
 */
export function withPick(list, row, max) {
  const keys = row.pkey && row.pkey !== row.key ? [row.key, row.pkey] : [row.key];
  return [...keys, ...list.filter((k) => !keys.includes(k))].slice(0, max);
}
