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
// On this computer it reads folders itself, skipping hidden folders and node_modules, and only
// in your home folder, where mods may read. On other machines it runs a small sh script
// (remote.js), as mods can't list folders there.
//
// Speed: the list from last time is kept in the mod's storage and drawn in the first frame;
// the folders are read again after that, and the rows update in place without moving the
// selection. Programs it runs: that sh script on each other machine, `zoxide query -ls` when
// zoxide is installed (its ranking breaks ties; "zoxide": "off" stops it), and, on Cmd+Enter,
// a check that the agent is installed.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { readFile, readdir } from "fs/promises";
import { platform } from "os";
import { spaces, panes, run, theme, props, closeOverlay, home, appHome, exec, checking, machines } from "herdr";
import { makePaths } from "./paths.js";
import {
  rankIndex,
  bestIn,
  ordered,
  age,
  reflogTime,
  positions,
  pieces,
  uniqueNames,
  worktreeRepo,
  zoxideBonus,
  keyOf,
} from "./match.js";
import { keptText, readKept } from "./kept.js";
import { readSettings, presentRoots, DEFAULTS } from "./settings.js";
import { command, installedCheck, checkedProgram } from "./actions.js";
import { findScript, parseFound, scanProblem } from "./remote.js";
import { openSpaces, spaceFor, buildRows, onListedMachines } from "./spaces.js";
import { projectKey } from "./keys.js";

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

export default class Trailhead extends View {
  init(_props, cx) {
    this.filter = "";
    this.at = 0;
    this.selected = null; // the selected row's key, so it stays selected when the list updates
    // The list from last time draws in the first frame; nothing is read from disk before it.
    // Projects of a machine that was removed from Herdr are dropped.
    const listed = readKept(storageGet(KEPT_KEY));
    const kept = listed ? onListedMachines(listed, machines()) : null;
    this.repos = kept ? kept.map(prepare) : null; // [{ path, kind, logs, name, key, lname, lpath }]
    this.touched = new Map(); // project key → seconds since 1970 of its last commit, checkout or pull
    for (const r of kept ?? [])
      if (r.touched !== null && r.touched !== undefined) this.touched.set(projectKey(r.machine, r.path), r.touched);
    this.zoxide = new Map(); // path → a small ranking bonus, when zoxide is installed
    this.settings = DEFAULTS;
    this.problems = []; // what's wrong with the settings or the roots, shown in the error bar
    this.remoteProblems = new Map(); // machine → why its projects couldn't be listed
    this.problem = null; // what went wrong with the last pick (a missing agent program)
    this.enterAt = 0; // when Alt+Enter was handled, so the input's own Enter doesn't repeat it
    this.version = 0; // bumps when what the rows are built from changes
    // The space you are in now goes first in the recent picks, so that with nothing typed
    // the project you were in before is row 1 and Enter jumps back to it.
    const here = this.allRows().find((r) => r.space?.active);
    this.current = here ? keyOf(here) : null;
    if (here) remember(here);
    this.recent = readRecent();
    this.input = InputState.new({ placeholder: "Open a project…" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      this.problem = null;
      this.at = 0;
      this.selected = null;
      cx.notify();
    });
    // Enter goes there; Cmd+Enter (Ctrl+Enter on Linux and Windows) starts the agent too;
    // Shift+Enter, like Alt+Enter, makes a new space even if one is open.
    this.input.on("submit", (e, cx) => {
      if (Date.now() - this.enterAt < 300) return;
      const how = { agent: Boolean(e.secondary), fresh: Boolean(e.shift) };
      cx.spawn((cx) => this.go(this.rows()[this.at], cx, how));
    });
    this.input.focus();
    // Popups take the keyboard a moment after they open; ask again then. Not while
    // `herdr-app check` loads the mod, which reloads it and would strand the timer.
    if (!checking()) cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
    // Look for changes after the first draw: the folders, then when each repo last changed.
    cx.spawn(async (cx) => {
      const { settings, problems, defaultRoots } = await loadSettings();
      this.settings = settings;
      if (settings.zoxide !== "off" && !checking()) cx.spawn((cx) => this.loadZoxide(cx));
      // Every other machine is searched at the same time, each on its own, so a slow one
      // never holds up this computer's rows or the others'.
      for (const m of machines()) {
        if (m.name && m.layout !== "unavailable" && !checking())
          cx.spawn((cx) => this.scanMachine(m.name, settings, defaultRoots, cx));
      }
      const { found, unreadable } = await findProjects(settings, defaultRoots);
      this.problems = [...problems, ...unreadable];
      // Named after their folder; a worktree after its repo too ("acme/login"); and where two
      // names clash, after as much of the path as tells them apart.
      const label = (r) => (r.repo ? `${base(r.repo)}/${base(r.path)}` : base(r.path));
      const names = uniqueNames(found.map((r) => ({ path: r.path, label: label(r) })));
      const others = onListedMachines(this.repos ?? [], machines()).filter((r) => r.machine);
      this.repos = [...found.map((r, i) => prepare({ ...r, name: names[i] })), ...others];
      this.version++;
      cx.notify();
      for (const r of this.repos) {
        if (r.machine) continue;
        const t = r.logs ? await lastChange(r.logs) : null;
        if (t !== null) this.touched.set(r.key, t);
      }
      this.version++;
      cx.notify();
      storageSet(KEPT_KEY, keptText(this.repos, this.touched));
    });
  }

  // The projects on another machine: one sh script run there, with a time limit. These rows
  // show no age: the script doesn't read each repo's reflog, to stay within that limit.
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
    const names = uniqueNames(found.map((p) => ({ path: p.path, label: base(p.path) })));
    const rows = found.map((p, i) => prepare({ ...p, name: names[i], machine: name, home: there, logs: null }));
    this.repos = [...(this.repos ?? []).filter((r) => r.machine !== name), ...rows];
    this.version++;
    cx.notify();
    storageSet(KEPT_KEY, keptText(this.repos, this.touched));
  }

  // zoxide's ranking, when it is installed; without it nothing changes.
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

  close() {
    closeOverlay(props().overlay);
  }

  // The rows to show, worked out once per list and query: a render, a key and Enter all ask.
  rows() {
    const rows = this.allRows();
    const built = this.built;
    if (built.shown?.filter !== this.filter) built.shown = { filter: this.filter, rows: this.pick(rows, built) };
    return built.shown.rows;
  }

  // With nothing typed, in the order `ordered` explains (the previous project first); typed,
  // the best matches first. The ranking index is built on the first key, once per list.
  pick(rows, built) {
    const typed = this.filter.trim();
    const f = typed.toLowerCase();
    if (!f) return ordered(rows, this.recent, this.current, SHOWN);
    // A typed path: that folder first, then what is inside it.
    if (isPath(typed)) {
      const path = trim(expand(typed));
      const key = (p) => p.toLowerCase();
      const same = rows.find((r) => key(r.path) === key(path));
      const inside = rows.filter((r) => r !== same && key(r.path).startsWith(key(join(path, ""))));
      const first = same ?? { kind: "typed", name: short(path), path, touched: null };
      return [first, ...inside].slice(0, SHOWN);
    }
    // The current space was only saved for jumping back; it gets no recent-pick bonus.
    built.index ??= rankIndex(
      rows,
      short,
      this.recent.filter((k) => k !== this.current),
      this.zoxide,
    );
    return bestIn(built.index, f, SHOWN);
  }

  // Every row, built again only when the projects, the spaces or the machines change, not on
  // each key.
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

  // Go to the row's project as `how` says: { fresh } for a new space even if one is open,
  // { agent } to start the agent there too.
  async go(r, cx, how = {}) {
    if (!r) return;
    const path = r.path;
    if (r.kind === "typed" && inHome(path) && !(await isFolder(path))) {
      // A typed folder opens when it exists; otherwise the popup says so and stays. Mods may
      // only read in the home folder, so a folder elsewhere opens unchecked, and Herdr says
      // so if it isn't there.
      this.missing = this.filter.trim();
      cx.notify();
      return;
    }
    const agent = how.agent ? await this.agentArgv(this.settings.agent, r.machine ?? null, cx) : null;
    if (how.agent && !agent) return;
    remember(r);
    this.close();
    const project = { path, name: r.kind === "typed" ? base(path) : r.name, machine: r.machine ?? null };
    const space = r.space ?? spaceFor(path, openSpaces(spaces(), panes()), r.machine ?? null, paths().sep);
    const c = command(project, space ?? null, { fresh: how.fresh, agent });
    run(c.name, c.args);
  }

  // The agent's command as it should start, with a leading ~ expanded, or null when its
  // program isn't installed: then the error bar says so and the popup stays. The check runs
  // where the agent will: sh, or `where` on Windows. Herdr doesn't say which system another
  // machine runs, so there sh is tried first and `where` when sh can't start, as Herdr's own
  // agent check does. When it can't be checked at all, it is started anyway and the terminal
  // shows any error.
  async agentArgv(agent, machine, cx) {
    const [first, ...rest] = agent;
    let windows = !machine && platform() === "windows";
    const program = windows ? expand(first) : first;
    let out;
    for (;;) {
      const check = installedCheck(program, windows);
      if (!check) return [program, ...rest];
      try {
        out = await exec(check.command, check.args, { on: machine, timeout: CHECK_MS });
        break;
      } catch (e) {
        if (windows || !machine || !/cannot start sh/.test(String(e))) return [program, ...rest];
        windows = true;
      }
    }
    const started = checkedProgram(program, windows, out);
    if (started) return [started, ...rest];
    const where = machine ? `on ${machine}` : "on this computer";
    this.problem = `${first} isn't installed ${where}. Change "agent" in trailhead.json in Herdr's folder.`;
    cx.notify();
    return null;
  }

  render() {
    const t = theme();
    const rows = this.rows();
    // Keep the selected row selected when the list updates under it.
    const was = this.selected ? rows.findIndex((r) => keyOf(r) === this.selected) : -1;
    if (was >= 0) this.at = was;
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    this.selected = rows[this.at] ? keyOf(rows[this.at]) : null;
    const empty =
      this.repos === null
        ? "Looking for projects…"
        : this.filter.trim()
          ? "No project matches. Type a path (~/code/app) to open any folder."
          : 'No projects found. Set "roots" in trailhead.json in Herdr\'s folder to the folders that hold them.';
    // The error bar: one line, the most recent problem first, with how many more there are.
    const errors = [this.problem, ...this.problems, ...this.remoteProblems.values()].filter(Boolean);
    // The Machine column shows only once another machine is connected.
    const connected = machines().some((m) => m.name);
    const errorLine = errors.length > 1 ? `${errors[0]} (and ${errors.length - 1} more)` : errors[0];
    const agentName = base(this.settings.agent[0] ?? "agent");
    const missing = this.missing !== undefined && this.missing === this.filter.trim();
    const now = Date.now() / 1000;
    const statusColor = { working: t.working, blocked: t.blocked, done: t.done, idle: t.idle };
    // The status dot: an open space in its agents' colour (accent with none), a typed folder +.
    const dot = (r) =>
      r.space
        ? div()
            .w(12)
            .flex_none()
            .text_color(statusColor[r.space.status] ?? t.accent)
            .child("●")
        : div()
            .w(12)
            .flex_none()
            .text_color(t.dim)
            .child(r.kind === "typed" ? "+" : "");
    const kindText = (r) =>
      r.kind === "typed" ? (missing ? "no such folder" : "open folder") : r.kind === "space" ? "" : r.kind;
    // The name, with the letters that match what you typed in the accent colour.
    const typed = this.filter.trim().toLowerCase();
    const name = (r) =>
      h_flex()
        .flex_1()
        .min_w(0)
        .overflow_hidden()
        .text_color(t.foreground)
        .children(
          pieces(r.name, r.kind === "typed" ? [] : positions(typed, r.name)).map((p) =>
            p.hit
              ? div().flex_none().font_semibold().text_color(t.accent).child(p.text)
              : div().flex_none().child(p.text),
          ),
        );
    const row = (r, i) =>
      h_flex()
        .id(`th-${i}`)
        .mx(4)
        .px(10)
        .h(34)
        .rounded(7)
        .gap(10)
        .items_center()
        .cursor_pointer()
        .when(i === this.at, (el) => el.bg(t.hover))
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => cx.spawn((cx) => this.go(r, cx)))
        .child(dot(r))
        .child(name(r))
        .when(connected, (el) =>
          el.child(
            div()
              .w(80)
              .flex_none()
              .truncate()
              .text_size(11)
              .text_color(t.muted)
              .child(r.machine ?? "local"),
          ),
        )
        .child(
          div()
            .w(72)
            .flex_none()
            .text_size(11)
            .text_color(r.kind === "typed" && missing ? t.blocked : t.muted)
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
        if (k === "escape") return this.close();
        if (k === "alt-enter") {
          this.enterAt = Date.now();
          const r = rows[this.at];
          cx.stop_propagation();
          return cx.spawn((cx) => this.go(r, cx, { fresh: true }));
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
              .on_click(() => this.close())
              .child("Esc"),
          ),
      )
      .when(Boolean(errorLine), (el) =>
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
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)),
      )
      .child(
        v_flex()
          .id("th-list")
          .mb(6)
          .when(rows.length === 0, (el) => el.child(div().px(14).py(8).text_size(12).text_color(t.dim).child(empty)))
          .children(rows.map(row)),
      )
      .child(
        div()
          .px(2)
          .text_size(11)
          .text_color(t.dim)
          .child(
            platform() === "macos"
              ? `Enter go · ⌥Enter new space · ⌘Enter start ${agentName} · Esc close`
              : `Enter go · Alt+Enter new space · Ctrl+Enter start ${agentName} · Esc close`,
          ),
      );
  }
}

// The settings: trailhead.json, then projects.json, both in Herdr's folder.
async function loadSettings() {
  const text = async (path) => {
    try {
      return await readFile(path, "utf8");
    } catch {
      return null;
    }
  };
  return readSettings(await text(join(appHome(), "trailhead.json")), await text(join(appHome(), "projects.json")));
}

// Every repo under the roots, plus the listed folders, each as { path, kind, logs, repo },
// and the roots that couldn't be read:
// kind "repo" (a .git folder), "worktree" (a .git file pointing at its repo's) or
// "folder"; logs is the reflog that says when it last changed; repo, a worktree's repo. A repo's own folders
// aren't searched, so a submodule or a vendored checkout inside it is left out.
// `defaultRoots`: the roots are the defaults, so only those in the home folder are searched,
// and none is reported missing.
async function findProjects({ roots, depth, folders }, defaultRoots) {
  const found = [];
  const unreadable = []; // roots that couldn't be read, in words for the error bar
  let budget = MAX_FOLDERS;
  // `left`: how many more levels below this folder may be searched.
  const walk = async (dir, left, isRoot) => {
    if (budget-- <= 0) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
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
          : await worktree(dir),
      );
      return;
    }
    if (left <= 0) return;
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules" || !e.isDirectory()) continue;
      await walk(join(dir, e.name), left - 1, false);
    }
  };
  const searched = defaultRoots ? presentRoots(roots, await folderNames(home())) : roots;
  for (const root of searched) await walk(trim(expand(root)), depth, true);
  found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const seen = new Set(found.map((r) => r.path));
  for (const f of folders) {
    const path = trim(expand(f));
    if (seen.has(path)) continue;
    if (!inHome(path) || (await isFolder(path))) found.push({ path, kind: "folder", logs: null });
    seen.add(path);
  }
  return { found, unreadable };
}

// A worktree's .git file says "gitdir: <its folder in the repo's .git>", where its reflog is.
async function worktree(dir) {
  try {
    const text = await readFile(join(dir, ".git"), "utf8");
    const gitdir = /^gitdir:\s*(.+?)\s*$/m.exec(text)?.[1];
    const abs = gitdir && (isPath(gitdir) ? gitdir : join(dir, gitdir));
    const repo = abs ? worktreeRepo(abs) : null;
    return { path: dir, kind: "worktree", repo, logs: abs ? join(join(abs, "logs"), "HEAD") : null };
  } catch {
    return { path: dir, kind: "worktree", logs: null };
  }
}

// Seconds since 1970 of the reflog's last entry, or null when there is none to read.
async function lastChange(logs) {
  try {
    return reflogTime(await readFile(logs, "utf8"));
  } catch {
    return null;
  }
}

// The names in a folder, or none when it can't be read.
async function folderNames(path) {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

async function isFolder(path) {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

// The path helpers for this computer's home folder (paths.js).
function paths() {
  return makePaths(home());
}
const join = (dir, name) => paths().join(dir, name);
const isPath = (text) => paths().isPath(text);
const expand = (p) => paths().expand(p);
const trim = (p) => paths().trim(p);
const inHome = (p) => paths().inHome(p);
const short = (p) => paths().short(p);
const base = (p) => paths().base(p);

// A row ready for matching: its key, and its name and shown path in lowercase.
function prepare(r) {
  const key = projectKey(r.machine, r.path);
  const shown = r.machine ? shortOn(r.path, r.home ?? null) : short(r.path);
  return { ...r, key, lname: r.name.toLowerCase(), lpath: shown.toLowerCase() };
}

// A path on another machine with its home shown as ~.
function shortOn(path, there) {
  if (!there) return path;
  return path === there ? "~" : path.startsWith(`${there}/`) ? `~/${path.slice(there.length + 1)}` : path;
}

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the next open just starts empty.
  }
}

function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

// Puts a row first in the recent picks: its key, then for a space its project's key, so the
// project stays recent after the space closes.
function remember(r) {
  const keys = [keyOf(r), r.pkey].filter((k, i, all) => k && all.indexOf(k) === i);
  const list = [...keys, ...readRecent().filter((p) => !keys.includes(p))].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable: the order just doesn't remember.
  }
}
