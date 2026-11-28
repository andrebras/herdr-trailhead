// Trailhead: open a project, or get back to it. The git repos under your folders, as
// tmux-sessionizer lists them. Type to filter, ↑/↓ (or Ctrl+P/N) and Enter: go to the
// project's space, or make one there named after the folder. Alt+Enter (or Shift+Enter)
// makes a new space even if one is open; Cmd+Enter (Ctrl+Enter on Linux and Windows) also
// starts the agent there. With nothing typed: the project you were in before (so Enter jumps
// back), open spaces, recent picks, the rest by last change, and the current space last.
// Each row shows its space's agent status, its kind (repo, worktree, folder) and when it last
// changed (its reflog's last entry: a commit, checkout or pull). A typed path to a folder
// (~/code/foo) opens that folder. It never makes folders and never closes a space.
//
// Settings: trailhead.json in Herdr's folder, else projects.json there (never inside the
// mod's folder, so an update can't reset them):
//   { "roots": ["~/code"], "depth": 3, "folders": ["~/notes"], "agent": ["claude"], "zoxide": "auto" }
// roots are searched for repos `depth` folders down; folders are listed as they are; agent
// is what Cmd+Enter starts. Without "roots", the usual code folders (settings.js) are searched
// where they exist. A bad value, or a root you set that it can't read, shows in the error bar.
// On this computer it reads folders itself (discover.js), skipping hidden folders and
// node_modules, and only in your home folder, where mods may read. On other machines it runs a
// small sh script (remote.js), as mods can't list folders there.
//
// Speed: the list from last time is kept in the mod's storage and drawn in the first frame;
// the folders are read again after that, and the rows update in place without moving the
// selection. Programs it runs: that sh script on each other machine, `zoxide query -ls` when
// zoxide is installed (its ranking breaks ties; "zoxide": "off" stops it), and, on Cmd+Enter,
// a check that the agent is installed.
//
// This file is the view and what talks to Herdr; the rest is in modules with tests.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { readFile, readdir } from "fs/promises";
import { platform } from "os";
import {
  spaces,
  panes,
  run,
  theme,
  props,
  closeOverlay,
  home,
  appHome,
  exec,
  checking,
  machines,
  readTextFile,
} from "herdr";
import { makePaths } from "./paths.js";
import { rankIndex, bestIn, ordered, age, positions, pieces, zoxideBonus, keyOf } from "./match.js";
import { keptText, readKept } from "./kept.js";
import { loadSettings, DEFAULTS } from "./settings.js";
import { command, installedCheck, checkedProgram } from "./actions.js";
import { findScript, parseFound, scanProblem } from "./remote.js";
import { openSpaces, spaceFor, buildRows, onListedMachines, preparer, pathRows, isTyped } from "./spaces.js";
import { findProjects, lastChange, projectNames } from "./discover.js";
import { readRecent, withPick } from "./recent.js";
import { projectKey } from "./keys.js";
import {
  LOCAL,
  isMachine,
  machineQuery,
  machineRows,
  typedMachine,
  onMachine,
  repoOf,
  reposWithWorktrees,
  inRepo,
  repoFirst,
} from "./filter.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Color} Color */
/** @typedef {import("./settings.js").Settings} Settings */
/** @typedef {import("./kept.js").Project} Project */
/** @typedef {Project & { key: string, label: string, lname: string, lpath: string }} Prepared a project ready for matching */
/** @typedef {ReturnType<typeof buildRows<Prepared>>[number]} ListRow a project or an open space */
/** @typedef {ReturnType<typeof pathRows<ListRow>>[number]} Row a project, a space or a typed folder */
/** @typedef {Row | import("./filter.js").MachineRow} Shown a row as shown: also a machine while "@" is typed */
/** @typedef {{ sig: string, rows: ListRow[], index?: import("./match.js").RankIndex<ListRow>, scope?: string,
 *   trees?: Set<string>,
 *   shown?: { filter: string, scope: string, rows: Shown[] } }} Built the rows, and what is worked out
 *   from them; `scope` is the filter they were worked out for, `trees` the repos with worktrees */

// How many matches show: the best ones, as a fuzzy finder does.
const SHOWN = 12;
// At most this many folders are looked at per search, so a huge root can't stall it.
const MAX_FOLDERS = 5000;
// The projects you picked last, newest first, kept in this mod's storage.
const RECENT_KEY = "trailhead.recent";
const RECENT_MAX = 100; // a space takes two: its own key and its project's
// The last list found, kept so the next open draws it at once and then looks for changes.
const KEPT_KEY = "trailhead.list";
// How long another machine has to list its projects, and to say whether the agent is there.
const SCAN_SECONDS = 2;
const CHECK_MS = 3000;
// Alt+Enter also reaches the input as Enter; an Enter this soon after it is the same press.
const SAME_PRESS_MS = 300;
// Popups take the keyboard a moment after they open; focus is asked for again after this.
const REFOCUS_MS = 600;

export default class Trailhead extends View {
  // The fields init() sets. Herdr makes the view first and runs init() after, so these
  // declarations (undefined until then) never wipe what init() sets.
  /** @type {string} what is typed */
  filter;
  /** @type {string | null} the machine the list is filtered to ("local" or a name), shown as a pill */
  machine;
  /** @type {{ key: string, name: string } | null} the repo the list is narrowed to, with its worktrees */
  repo;
  /** @type {number} the selected row's place */
  at;
  /** @type {string | null} the selected row's key, so it stays selected when the list updates */
  selected;
  /** @type {Prepared[] | null} the projects; null until the first search when none were kept */
  repos;
  /** @type {Map<string, number>} project key → seconds since 1970 of its last commit, checkout or pull */
  touched;
  /** @type {Map<string, number>} path → a small ranking bonus, when zoxide is installed */
  zoxide;
  /** @type {Settings} trailhead.json, checked */
  settings;
  /** @type {string[]} what's wrong with the settings or the roots, shown in the error bar */
  problems;
  /** @type {Map<string, string>} machine → why its projects couldn't be listed */
  remoteProblems;
  /** @type {string | null} what went wrong with the last pick (a missing agent program) */
  problem;
  /** @type {string | null} the typed path that turned out not to be a folder */
  missing;
  /** @type {Built | null} the rows, until what they are built from changes */
  built;
  /** @type {number} when Alt+Enter was handled, so the input's own Enter doesn't repeat it */
  enterAt;
  /** @type {number} bumps when what the rows are built from changes */
  version;
  /** @type {string | null} the key of the space you were in when the popup opened */
  current;
  /** @type {string[]} the recent picks' keys, newest first (recent.js) */
  recent;
  /** @type {import("gpui-base").InputState} the search field */
  input;
  /** @type {import("gpui-kit").FocusHandle} the popup's keyboard focus */
  handle;

  /**
   * @param {unknown} _props
   * @param {AsyncContext} cx
   */
  init(_props, cx) {
    this.filter = "";
    // Every open starts with no filter.
    this.machine = null;
    this.repo = null;
    this.at = 0;
    this.selected = null;
    // The list from last time draws in the first frame; nothing is read from disk before it.
    // Projects of a machine that was removed from Herdr are dropped.
    const stored = readKept(storageGet(KEPT_KEY));
    const kept = stored ? onListedMachines(stored, machines()) : null;
    this.repos = kept ? kept.map(prepare) : null;
    this.touched = new Map();
    for (const r of kept ?? [])
      if (typeof r.touched === "number") this.touched.set(projectKey(r.machine, r.path), r.touched);
    this.zoxide = new Map();
    this.settings = DEFAULTS;
    this.problems = [];
    this.remoteProblems = new Map();
    this.problem = null;
    this.missing = null;
    /** @type {Built | null} */
    this.built = null;
    this.enterAt = 0;
    this.version = 0;
    // The space you are in now goes first in the recent picks, so that with nothing typed
    // the project you were in before is row 1 and Enter jumps back to it.
    const here = this.allRows().find((r) => r.space?.active);
    this.current = here ? keyOf(here) : null;
    if (here) remember(here);
    this.recent = readRecent(storageGet(RECENT_KEY));
    this.input = InputState.new({ placeholder: "Open a project…" });
    this.input.on("change", (_e, cx) => {
      const value = this.input.value();
      // "@dev " with a space: filter by the machine selected in the list, else the first match.
      if (this.machine === null && this.connected()) {
        const was = this.rows()[this.at];
        const typed = typedMachine(value, this.machineNames(), was && isMachine(was) ? was.name : null);
        if (typed) return this.lockMachine(typed.machine, typed.rest, cx);
      }
      this.filter = value;
      this.problem = null;
      this.at = 0;
      this.selected = null;
      cx.notify();
    });
    // Enter goes there; Cmd+Enter (Ctrl+Enter on Linux and Windows) starts the agent too;
    // Shift+Enter, like Alt+Enter, makes a new space even if one is open.
    this.input.on("submit", (e, cx) => {
      if (Date.now() - this.enterAt < SAME_PRESS_MS) return;
      const how = { agent: Boolean(e.secondary), fresh: Boolean(e.shift) };
      this.choose(this.rows()[this.at], cx, how);
    });
    this.input.focus();
    // Not while `herdr-app check` loads the mod, which reloads it and would strand the timer.
    if (!checking()) cx.timer.after(REFOCUS_MS, () => this.input.focus());
    this.handle = cx.focus_handle();
    // A check reloads the mod at once, which would strand this search; it shows the kept list.
    if (!checking()) cx.spawn((cx) => this.refresh(cx));
  }

  /**
   * Looks for changes after the first draw: the settings, the folders, then when each repo
   * last changed. Every other machine is searched at the same time, each on its own, so a
   * slow one never holds up this computer's rows or the others'.
   * @param {AsyncContext} cx
   */
  async refresh(cx) {
    const read = (/** @type {string} */ name) => readTextFile(join(appHome(), name));
    const { settings, problems, defaultRoots } = await loadSettings(read);
    this.settings = settings;
    if (settings.zoxide !== "off") cx.spawn((cx) => this.loadZoxide(cx));
    for (const m of machines()) {
      const name = m.name;
      if (name && m.layout !== "unavailable") cx.spawn((cx) => this.scanMachine(name, settings, defaultRoots, cx));
    }
    const io = { files: FILES, paths: paths(), home: home(), maxFolders: MAX_FOLDERS };
    const { found, unreadable, stopped } = await findProjects(settings, defaultRoots, io);
    const limit = `Stopped after ${MAX_FOLDERS} folders; some projects may be missing. Lower "depth" or narrow "roots".`;
    this.problems = [...problems, ...unreadable, ...(stopped ? [limit] : [])];
    const names = projectNames(found, base);
    const others = onListedMachines(this.repos ?? [], machines()).filter((r) => r.machine);
    const repos = [...found.map((r, i) => prepare({ ...r, name: names[i], machine: null })), ...others];
    this.repos = repos;
    this.version++;
    cx.notify();
    for (const r of repos) {
      const t = !r.machine && r.logs ? await lastChange(r.logs, FILES) : null;
      if (t !== null) this.touched.set(r.key, t);
    }
    this.version++;
    cx.notify();
    storageSet(KEPT_KEY, keptText(repos, this.touched));
  }

  /**
   * The projects on another machine: one sh script run there, with a time limit. These rows
   * show no age: the script doesn't read each repo's reflog, to stay within that limit.
   * @param {string} name
   * @param {Settings} settings
   * @param {boolean} defaultRoots
   * @param {AsyncContext} cx
   */
  async scanMachine(name, settings, defaultRoots, cx) {
    const script = findScript(settings.roots, settings.depth, defaultRoots);
    let out = null;
    let error;
    try {
      out = await exec("sh", ["-c", script], { on: name, timeout: SCAN_SECONDS * 1000 });
    } catch (e) {
      error = e;
    }
    const problem = scanProblem(name, SCAN_SECONDS, out, error);
    if (!out || problem) {
      this.remoteProblems.set(name, problem ?? `Can't reach ${name}`);
      cx.notify();
      return;
    }
    const { home: there, found, unreadable } = parseFound(out.stdout);
    if (unreadable.length > 0) this.remoteProblems.set(name, `Can't read ${unreadable.join(", ")} on ${name}`);
    else this.remoteProblems.delete(name);
    const names = projectNames(found, base);
    const rows = found.map((p, i) => prepare({ ...p, name: names[i], machine: name, home: there, logs: null }));
    this.repos = [...(this.repos ?? []).filter((r) => r.machine !== name), ...rows];
    this.version++;
    cx.notify();
    storageSet(KEPT_KEY, keptText(this.repos, this.touched));
  }

  /**
   * zoxide's ranking, when it is installed; without it nothing changes.
   * @param {AsyncContext} cx
   */
  async loadZoxide(cx) {
    try {
      const out = await exec("zoxide", ["query", "-ls"], { timeout: SCAN_SECONDS * 1000 });
      if (out.code !== 0) return;
      this.zoxide = zoxideBonus(out.stdout);
      this.version++;
      cx.notify();
    } catch {
      // Not installed: the order just doesn't use it.
    }
  }

  // Closes the popup. Not named close(): Herdr calls a view's close(cx) when it shuts it.
  dismiss() {
    closeOverlay(props().overlay);
  }

  // Whether another machine is connected. Only then does the Machine column show, and "@"
  // filter by machine; with none, "@" is typed text.
  connected() {
    return machines().some((m) => m.name);
  }

  // The machines "@" offers: this computer as "local", then each one that can be reached.
  machineNames() {
    const names = machines().flatMap((m) => (m.name && m.layout !== "unavailable" ? [m.name] : []));
    return [LOCAL, ...names];
  }

  // What follows a lone "@" while the machines are listed, or null when they aren't.
  choosing() {
    return this.machine === null && this.connected() ? machineQuery(this.filter) : null;
  }

  /**
   * Filters the list to one machine, shown as a pill before the input, which keeps only
   * what was typed after the machine's name.
   * @param {string} machine
   * @param {string} rest
   * @param {import("gpui-kit").Context} cx
   */
  lockMachine(machine, rest, cx) {
    this.machine = machine;
    this.narrowed(rest, cx);
  }

  /**
   * Narrows the list to a repo and its worktrees, shown as a pill before the input, which
   * empties.
   * @param {{ key: string, name: string }} repo
   * @param {import("gpui-kit").Context} cx
   */
  lockRepo(repo, cx) {
    this.repo = repo;
    this.narrowed("", cx);
  }

  /**
   * After a filter is added: the input keeps `rest`, and the first row is selected.
   * @param {string} rest
   * @param {import("gpui-kit").Context} cx
   */
  narrowed(rest, cx) {
    // Set here too: set_value may not report a change, and if it does, this one is done.
    this.filter = rest;
    this.problem = null;
    this.at = 0;
    this.selected = null;
    if (this.input.value() !== rest) this.input.set_value(rest);
    cx.notify();
  }

  /**
   * Enter or a click on a row: a machine filters the list; anything else is opened.
   * @param {Shown | undefined} r
   * @param {import("gpui-kit").Context} cx
   * @param {{ fresh?: boolean, agent?: boolean }} [how]
   */
  choose(r, cx, how = {}) {
    if (r && isMachine(r)) return this.lockMachine(r.name, "", cx);
    cx.spawn((cx) => this.go(r, cx, how));
  }

  /**
   * The repo Tab narrows the list to from this row: its repo, when that has worktrees in the
   * list. Null when there is none, or the list is narrowed to a repo already.
   * @param {Shown | undefined} r
   */
  worktreesOf(r) {
    if (!r || isMachine(r) || isTyped(r) || this.repo !== null) return null;
    const built = /** @type {Built} */ (this.built);
    built.trees ??= reposWithWorktrees(built.rows);
    const repo = repoOf(r);
    return repo && built.trees.has(repo.key) ? repo : null;
  }

  /**
   * The rows to show, worked out once per list, filter and query: a render, a key and Enter
   * all ask.
   * @returns {Shown[]}
   */
  rows() {
    const rows = this.allRows();
    const built = /** @type {Built} */ (this.built);
    const scope = `${this.machine ?? ""}|${this.repo?.key ?? ""}`;
    if (built.shown?.filter !== this.filter || built.shown.scope !== scope)
      built.shown = { filter: this.filter, scope, rows: this.pick(rows, built, scope) };
    return built.shown.rows;
  }

  /**
   * A lone "@", the machines; else the rows the filters keep: with nothing typed, in the order
   * `ordered` explains (the previous project first); a typed path, that folder and what is
   * inside it; else the best matches first. The ranking index is built on the first key, once
   * per list and filter.
   * @param {ListRow[]} all
   * @param {Built} built
   * @param {string} scope the filter, as rows() keys it
   * @returns {Shown[]}
   */
  pick(all, built, scope) {
    const at = this.choosing();
    if (at !== null) return machineRows(this.machineNames(), at);
    const mine = this.machine === null ? all : onMachine(all, this.machine);
    const rows = this.repo === null ? mine : inRepo(mine, this.repo.key);
    const typed = this.filter.trim();
    const f = typed.toLowerCase();
    if (!f && this.repo === null) return ordered(rows, this.recent, this.current, SHOWN);
    // In a repo's view the repo comes first, then its worktrees.
    if (!f) return repoFirst(rows, (rest, n) => ordered(rest, this.recent, this.current, n), SHOWN);
    // A typed path is a folder on this computer, so not while another machine is the filter.
    const here = this.machine === null || this.machine === LOCAL;
    if (here && isPath(typed)) return pathRows(rows, trim(expand(typed)), paths(), SHOWN);
    // The current space was only saved for jumping back; it gets no recent-pick bonus.
    const picks = this.recent.filter((k) => k !== this.current);
    if (built.scope !== scope) built.index = undefined;
    built.scope = scope;
    built.index ??= rankIndex(rows, short, picks, this.zoxide);
    const best = bestIn(built.index, f, SHOWN);
    return this.repo === null ? best : repoFirst(best, (rest) => rest, SHOWN);
  }

  /**
   * Every row, built again only when the projects, the spaces or the machines change, not
   * on each key.
   * @returns {ListRow[]}
   */
  allRows() {
    const open = openSpaces(spaces(), panes());
    const list = machines();
    const state = [open.map(({ space, folders }) => [space.id, space.name, space.status, folders]), list];
    const sig = `${this.version}|${JSON.stringify(state)}`;
    if (this.built?.sig === sig) return this.built.rows;
    const rows = buildRows(open, this.repos ?? [], {
      machines: list,
      touched: this.touched,
      sep: paths().sep,
      prepare,
    });
    this.built = { sig, rows };
    return rows;
  }

  /**
   * Goes to the row's project as `how` says: `fresh` for a new space even if one is open,
   * `agent` to start the agent there too.
   * @param {Row | undefined} r
   * @param {AsyncContext} cx
   * @param {{ fresh?: boolean, agent?: boolean }} [how]
   */
  async go(r, cx, how = {}) {
    if (!r) return;
    const path = r.path;
    const machine = isTyped(r) ? null : (r.machine ?? null);
    if (isTyped(r) && inHome(path) && !(await isFolder(path))) {
      // A typed folder opens when it exists; otherwise the popup says so and stays. Mods may
      // only read in the home folder, so a folder elsewhere opens unchecked, and Herdr says
      // so if it isn't there.
      this.missing = this.filter.trim();
      cx.notify();
      return;
    }
    const agent = how.agent ? await this.agentArgv(this.settings.agent, machine, cx) : null;
    if (how.agent && !agent) return;
    remember(r);
    this.dismiss();
    const project = { path, name: isTyped(r) ? base(path) : r.name, machine };
    const space = isTyped(r) ? undefined : r.space;
    const there = space ?? spaceFor(path, openSpaces(spaces(), panes()), machine, paths().sep);
    const c = command(project, there ?? null, { fresh: how.fresh, agent });
    run(c.name, c.args);
  }

  /**
   * The agent's command as it should start, with a leading ~ expanded, or null when its
   * program isn't installed: then the error bar says so and the popup stays. The check runs
   * where the agent will: sh, or `where` on Windows. Herdr doesn't say which system another
   * machine runs, so there sh is tried first and `where` when sh can't start, as Herdr's own
   * agent check does. When it can't be checked at all, it is started anyway and the
   * terminal shows any error.
   * @param {string[]} agent
   * @param {string | null} machine
   * @param {AsyncContext} cx
   * @returns {Promise<string[] | null>}
   */
  async agentArgv(agent, machine, cx) {
    const [first, ...rest] = agent;
    let windows = !machine && platform() === "windows";
    const program = windows ? expand(first) : first;
    for (;;) {
      const check = installedCheck(program, windows);
      if (!check) return [program, ...rest];
      let out;
      try {
        out = await exec(check.command, check.args, { on: machine, timeout: CHECK_MS });
      } catch (e) {
        if (windows || !machine || !/cannot start sh/.test(String(e))) return [program, ...rest];
        windows = true;
        continue;
      }
      const started = checkedProgram(program, windows, out);
      if (started) return [started, ...rest];
      const where = machine ? `on ${machine}` : "on this computer";
      this.problem = `${first} isn't installed ${where}. Change "agent" in trailhead.json in Herdr's folder.`;
      cx.notify();
      return null;
    }
  }

  render() {
    const t = palette();
    const rows = this.rows();
    // Keep the selected row selected when the list updates under it.
    const was = this.selected === null ? -1 : rows.findIndex((r) => keyOf(r) === this.selected);
    if (was >= 0) this.at = was;
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    this.selected = rows[this.at] ? keyOf(rows[this.at]) : null;
    const choosing = this.choosing();
    const empty =
      this.repos === null
        ? "Looking for projects…"
        : choosing !== null
          ? "No machine's name starts with that."
          : this.filter.trim()
            ? "No project matches. Type a path (~/code/app) to open any folder."
            : 'No projects found. Set "roots" in trailhead.json in Herdr\'s folder to the folders that hold them.';
    // The error bar: one line, the most recent problem first, with how many more there are.
    const errors = [this.problem, ...this.problems, ...this.remoteProblems.values()].filter((e) => e !== null);
    // The Machine column shows only once another machine is connected, and not while the list
    // is filtered to one machine or narrowed to one repo (which is on one machine).
    const connected = this.connected();
    const machineColumn = connected && this.machine === null && this.repo === null;
    const errorLine = errors.length > 1 ? `${errors[0]} (and ${errors.length - 1} more)` : (errors[0] ?? "");
    const agentName = base(this.settings.agent[0] ?? "agent");
    const missing = this.missing !== null && this.missing === this.filter.trim();
    const now = Date.now() / 1000;
    const typedNow = this.filter;
    const mac = platform() === "macos";
    const footer = mac
      ? ["Enter go", "⌥Enter new space", `⌘Enter start ${agentName}`]
      : ["Enter go", "Alt+Enter new space", `Ctrl+Enter start ${agentName}`];
    if (connected && this.machine === null) footer.push("@ machine");
    if (this.worktreesOf(rows[this.at])) footer.push(mac ? "⇥ worktrees" : "Tab worktrees");
    if (this.machine !== null || this.repo !== null) footer.push(mac ? "⌫ remove filter" : "Backspace remove filter");
    footer.push("Esc close");
    // The status dot: an open space in its agents' colour (accent with none), a typed folder +,
    // a machine @.
    const dot = (/** @type {Shown} */ r) => {
      if (isMachine(r)) return div().w(12).flex_none().text_color(t.accent).child("@");
      const status = isTyped(r) ? null : (r.space?.status ?? null);
      if (!isTyped(r) && r.space)
        return div()
          .w(12)
          .flex_none()
          .text_color(status ? t[status] : t.accent)
          .child("●");
      return div()
        .w(12)
        .flex_none()
        .text_color(t.dim)
        .child(isTyped(r) ? "+" : "");
    };
    const kindText = (/** @type {Shown} */ r) =>
      isTyped(r) ? (missing ? "no such folder" : "open folder") : r.kind === "space" ? "" : r.kind;
    // The name (a worktree's repo › branch), with the letters that match what you typed in the
    // accent colour.
    const typed = (choosing ?? this.filter.trim()).toLowerCase();
    // In a repo's view a worktree shows only its branch (its folder's name when detached),
    // indented under the repo: the pill already names the repo.
    const sub = (/** @type {Shown} */ r) => this.repo !== null && r.kind === "worktree";
    const shownName = (/** @type {Shown} */ r) => {
      if (isTyped(r) || isMachine(r)) return r.name;
      return sub(r) ? (r.branch ?? base(r.path)) : r.label;
    };
    const name = (/** @type {Shown} */ r) =>
      h_flex()
        .flex_1()
        .min_w(0)
        .overflow_hidden()
        .text_color(t.foreground)
        .children(
          pieces(shownName(r), isTyped(r) ? [] : positions(typed, shownName(r))).map((p) =>
            p.hit
              ? div().flex_none().font_semibold().text_color(t.accent).child(p.text)
              : div().flex_none().child(p.text),
          ),
        );
    // A filter, before the input.
    const pill = (/** @type {string} */ text) =>
      div().flex_none().px(6).py(1).rounded(5).bg(t.hover).text_size(11.5).text_color(t.foreground).child(text);
    // A row's machine: a click on it filters the list to that machine.
    const machineCell = (/** @type {Shown} */ r, /** @type {number} */ i) => {
      const there = isMachine(r) ? null : ((isTyped(r) ? null : r.machine) ?? LOCAL);
      return div()
        .id(`th-machine-${i}`)
        .w(80)
        .flex_none()
        .truncate()
        .text_size(11)
        .text_color(t.muted)
        .when(there !== null, (el) =>
          el
            .cursor_pointer()
            .hover((s) => s.text_color(t.foreground))
            .on_click((_e, cx) => {
              // The row's own click would open the project.
              cx.stop_propagation();
              if (there !== null) this.lockMachine(there, "", cx);
            }),
        )
        .child(there ?? "");
    };
    const row = (/** @type {Shown} */ r, /** @type {number} */ i) =>
      h_flex()
        .id(`th-${i}`)
        .mx(4)
        .px(10)
        .when(sub(r), (el) => el.pl(32))
        .h(34)
        .rounded(7)
        .gap(10)
        .items_center()
        .cursor_pointer()
        .when(i === this.at, (el) => el.bg(t.hover))
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => this.choose(r, cx))
        .child(dot(r))
        .child(name(r))
        .when(machineColumn, (el) => el.child(machineCell(r, i)))
        .child(
          div()
            .w(72)
            .flex_none()
            .text_size(11)
            .text_color(isTyped(r) && missing ? t.blocked : t.muted)
            .child(kindText(r)),
        )
        .child(
          div()
            .w(36)
            .flex_none()
            .text_size(11)
            .text_color(t.dim)
            .child(r.touched === null ? "" : age(now - r.touched)),
        );
    return v_flex()
      .id("trailhead")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(18)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .on_key_down((e, cx) => {
        const k = e.keystroke;
        if (k === "escape") return this.dismiss();
        if (k === "alt-enter") {
          this.enterAt = Date.now();
          const r = rows[this.at];
          cx.stop_propagation();
          this.choose(r, cx, { fresh: true });
          return;
        }
        // Tab on a machine filters the list to it, as Enter and Space do; on a repo with
        // worktrees, or one of them, it narrows the list to that repo and its worktrees. Tab is
        // kept either way, so it never moves the keyboard out of the input.
        const r = rows[this.at];
        if (k === "tab") {
          cx.stop_propagation();
          if (r && isMachine(r)) return this.lockMachine(r.name, "", cx);
          const repo = this.worktreesOf(r);
          if (repo) this.lockRepo(repo, cx);
          return;
        }
        // Backspace in an empty input removes a filter: the repo first, then the machine.
        // "Empty" is the input as last drawn (`typedNow`), so deleting the last letter doesn't
        // remove a filter too.
        if (k === "backspace" && typedNow === "" && (this.repo !== null || this.machine !== null)) {
          if (this.repo !== null) this.repo = null;
          else this.machine = null;
          this.at = 0;
          this.selected = null;
          cx.stop_propagation();
          cx.notify();
          return;
        }
        if (!rows.length) return;
        if (k === "down" || k === "ctrl-n") this.at = (this.at + 1) % rows.length;
        else if (k === "up" || k === "ctrl-p") this.at = (this.at + rows.length - 1) % rows.length;
        else return;
        this.selected = null;
        cx.stop_propagation();
        cx.notify();
      })
      .child(
        h_flex()
          .items_center()
          .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Open a project"))
          .child(
            div()
              .id("trailhead-esc")
              .px(6)
              .py(2)
              .rounded(5)
              .text_size(11)
              .text_color(t.dim)
              .cursor_pointer()
              .hover((s) => s.bg(t.hover).text_color(t.foreground))
              .on_click(() => this.dismiss())
              .child("Esc"),
          ),
      )
      .when(errorLine !== "", (el) =>
        el.child(div().px(2).text_size(11.5).text_color(t.blocked).truncate().child(errorLine)),
      )
      .child(
        h_flex()
          .h(36)
          .flex_none()
          .px(10)
          .gap(8)
          .items_center()
          .rounded(9)
          .border_1()
          .border_color(t.accent)
          .bg(t.background)
          .child(svg("mods/trailhead/search.svg").size(15).text_color(t.dim))
          .when(this.machine !== null, (el) => el.child(pill(`@${this.machine}`)))
          .when(this.repo !== null, (el) => el.child(pill(`${this.repo?.name} ›`)))
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)),
      )
      .child(
        v_flex()
          .id("th-list")
          .mb(6)
          .when(rows.length === 0, (el) => el.child(div().px(14).py(8).text_size(12).text_color(t.dim).child(empty)))
          .children(rows.map(row)),
      )
      .child(div().px(2).text_size(11).text_color(t.dim).child(footer.join(" · ")));
  }
}

// This computer's folders and files, as discover.js reads them.
/** @type {import("./discover.js").Files} */
const FILES = {
  entries: (dir) => readdir(dir, { withFileTypes: true }),
  names: (dir) => readdir(dir),
  read: (path) => readFile(path, "utf8"),
};

/** @param {string} path */
async function isFolder(path) {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

// The theme colours Trailhead draws with. Herdr gives each as a "#rrggbb" string; one that
// is missing or isn't one falls back to grey.
function palette() {
  const t = theme();
  const c = (/** @type {string} */ name) => {
    const v = t[name];
    return v !== undefined && isColor(v) ? v : "#808080";
  };
  return {
    foreground: c("foreground"),
    muted: c("muted"),
    dim: c("dim"),
    accent: c("accent"),
    hover: c("hover"),
    popover: c("popover"),
    background: c("background"),
    working: c("working"),
    blocked: c("blocked"),
    done: c("done"),
    idle: c("idle"),
  };
}

/**
 * @param {string} s
 * @returns {s is Color}
 */
const isColor = (s) => s.startsWith("#");

// The path helpers for this computer's home folder (paths.js), made once.
/** @type {ReturnType<typeof makePaths> | null} */
let pathsMade = null;
function paths() {
  pathsMade ??= makePaths(home());
  return pathsMade;
}
const join = (/** @type {string} */ dir, /** @type {string} */ name) => paths().join(dir, name);
const isPath = (/** @type {string} */ text) => paths().isPath(text);
const expand = (/** @type {string} */ p) => paths().expand(p);
const trim = (/** @type {string} */ p) => paths().trim(p);
const inHome = (/** @type {string} */ p) => paths().inHome(p);
const short = (/** @type {string} */ p) => paths().short(p);
const base = (/** @type {string} */ p) => paths().base(p);

/** @type {ReturnType<typeof preparer> | null} */
let prepareMade = null;
/**
 * A project ready for matching: its key, and its name and shown path in lowercase.
 * @template {Project} T
 * @param {T} p
 */
function prepare(p) {
  prepareMade ??= preparer(short);
  return prepareMade(p);
}

/** @param {string} key */
function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {string} value
 */
function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the next open just starts empty, and the order doesn't remember.
  }
}

/**
 * Puts a row first in the recent picks (see recent.js).
 * @param {Row} r
 */
function remember(r) {
  const row = { key: keyOf(r), pkey: isTyped(r) ? null : r.pkey };
  storageSet(RECENT_KEY, JSON.stringify(withPick(readRecent(storageGet(RECENT_KEY)), row, RECENT_MAX)));
}
