// Path helpers that know nothing about Herdr, so tests can run them under node.
// Paths use the system's separator: "\\" on Windows, where the home folder has one.

/**
 * The path helpers for a home folder.
 * @param {string} home
 */
export function makePaths(home) {
  const sep = home.includes("\\") ? "\\" : "/";

  const join = (/** @type {string} */ dir, /** @type {string} */ name) =>
    dir.endsWith(sep) ? `${dir}${name}` : `${dir}${sep}${name}`;

  // A typed path: ~, /, \\ or a drive (C:\\).
  const isPath = (/** @type {string} */ text) => /^(~|[/\\]|[A-Za-z]:[/\\])/.test(text);

  const expand = (/** @type {string} */ p) => {
    if (p === "~") return home;
    return /^~[/\\]/.test(p) ? `${home}${sep}${p.slice(2)}` : p;
  };

  // Without a trailing separator, except for a root such as / or C:\\.
  const trim = (/** @type {string} */ p) => {
    const t = p.replace(/[/\\]+$/, "");
    return t === "" ? p.slice(0, 1) : /^[A-Za-z]:$/.test(t) ? `${t}${sep}` : t;
  };

  const inHome = (/** @type {string} */ p) => p === home || p.startsWith(join(home, ""));

  const short = (/** @type {string} */ p) =>
    p === home ? "~" : p.startsWith(`${home}${sep}`) ? `~${sep}${p.slice(home.length + 1)}` : p;

  const base = (/** @type {string} */ p) => p.split(/[/\\]/).filter(Boolean).pop() ?? p;

  return { sep, join, isPath, expand, trim, inHome, short, base };
}
