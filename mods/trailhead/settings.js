// Trailhead's settings: trailhead.json in Herdr's folder. It sits outside the mod's own
// folder, so updating the mod never resets it. Every problem found is reported in words for the error bar. Knows
// nothing about Herdr, so tests can run it under node.

/** @typedef {{ roots: string[], depth: number, folders: string[], agent: string[], zoxide: "auto" | "off" }} Settings */

/**
 * The roots are the folders people most often keep their code in. Those that aren't there are
 * skipped quietly; a root set in trailhead.json that isn't there is reported.
 * @type {Settings}
 */
export const DEFAULTS = {
  roots: [
    "~/code",
    "~/Code",
    "~/projects",
    "~/Projects",
    "~/src",
    "~/dev",
    "~/Developer",
    "~/work",
    "~/git",
    "~/repos",
    "~/Lab",
  ],
  depth: 3,
  folders: [],
  agent: ["claude"],
  zoxide: "auto",
};

/**
 * The settings, and what was wrong with them (the default is used for each bad value).
 * @param {string | null} trailheadJson trailhead.json in Herdr's folder, or null when absent
 * `defaultRoots`: no valid "roots" was set, so the default roots are searched where they exist.
 * @returns {{ settings: Settings, problems: string[], defaultRoots: boolean }}
 */
export function readSettings(trailheadJson) {
  /** @type {string[]} */
  const problems = [];
  const own = parse(trailheadJson, "trailhead.json", problems);
  if (own !== undefined && !isObject(own)) {
    problems.push('trailhead.json must hold an object, such as {"agent": ["claude"]}');
  }
  const mine = isObject(own) ? own : {};
  /** @param {string} key */
  const pick = (key) => mine[key];

  const strings = (/** @type {unknown} */ v) =>
    Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.trim() !== "");
  /**
   * @template T
   * @param {string} key
   * @param {(v: unknown) => boolean} ok
   * @param {T} def
   * @param {string} want
   * @returns {T}
   */
  const take = (key, ok, def, want) => {
    const v = pick(key);
    if (v === undefined) return def;
    if (ok(v)) return /** @type {T} */ (v);
    problems.push(`"${key}" must be ${want}; using ${JSON.stringify(def)}`);
    return def;
  };
  const roots = take("roots", strings, DEFAULTS.roots, "a list of folders");
  return {
    settings: {
      roots,
      depth: take(
        "depth",
        (v) => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 6,
        DEFAULTS.depth,
        "a whole number from 1 to 6",
      ),
      folders: take(
        "folders",
        (v) => Array.isArray(v) && (v.length === 0 || strings(v)),
        DEFAULTS.folders,
        "a list of folders",
      ),
      agent: take("agent", strings, DEFAULTS.agent, 'a command as a list, such as ["claude"]'),
      zoxide: take("zoxide", (v) => v === "auto" || v === "off", DEFAULTS.zoxide, '"auto" or "off"'),
    },
    problems,
    defaultRoots: roots === DEFAULTS.roots,
  };
}

/**
 * Whether a parsed JSON value is an object (not an array), whose keys can be read.
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
export function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * @param {string | null} text
 * @param {string} name
 * @param {string[]} problems
 * @returns {unknown}
 */
function parse(text, name, problems) {
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    problems.push(`${name} isn't valid JSON; using the defaults`);
    return undefined;
  }
}

/**
 * The default roots that are in the home folder under exactly that name, given the names of the
 * folders there: ~/code and ~/Code on a case-insensitive disk are one folder, listed once.
 * @param {string[]} roots
 * @param {string[]} names
 */
export function presentRoots(roots, names) {
  const here = new Set(names);
  return roots.filter((r) => here.has(r.replace(/^~[/\\]/, "")));
}

/**
 * Reads and checks the settings in trailhead.json in Herdr's folder.
 * `read` gives a file's text, null when it isn't there, and rejects when it can't be read:
 * a missing file means the defaults, one that can't be read is reported.
 * @param {(name: string) => Promise<string | null>} read
 * @returns {Promise<{ settings: Settings, problems: string[], defaultRoots: boolean }>}
 */
export async function loadSettings(read) {
  /** @type {string[]} */
  const unreadable = [];
  const text = async (/** @type {string} */ name) => {
    try {
      return await read(name);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      unreadable.push(`Can't read ${name} in Herdr's folder (${why}); using the defaults`);
      return null;
    }
  };
  const result = readSettings(await text("trailhead.json"));
  return { ...result, problems: [...unreadable, ...result.problems] };
}
