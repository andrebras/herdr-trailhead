// Trailhead: open a project, or get back to it. The git repos under your folders, as
// tmux-sessionizer lists them. Type to filter, ↑/↓ (or Ctrl+P/N) and Enter: go to the project's space,
// or make one there named after the folder. With nothing typed: open spaces, then your
// recent picks, then the rest by name. Each row shows its space's agent status, its kind
// (repo, worktree, folder) and when it last changed (its reflog's last entry: a commit,
// checkout or pull). A typed path to a folder (~/code/foo) opens that folder. It never
// makes folders and never closes a space.
//
// Where it looks: projects.json in Herdr's folder,
//   { "roots": ["~/Lab"], "depth": 3, "folders": ["~/notes"] }
// roots are searched for repos `depth` folders down; folders are listed as they are.
// Without the file: ~/Lab, 3 deep. It looks again each time it opens. It reads folders
// itself (no `find`, so it works the same on every system), skipping hidden folders and
// node_modules, and only in your home folder, where mods may read. It runs no programs.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { readFile, readdir } from "fs/promises";
import { spaces, panes, run, theme, props, closeOverlay, home, appHome } from "herdr";
import { makePaths } from "./paths.js";
import { best, ordered, age, reflogTime, positions, pieces, uniqueNames, worktreeRepo } from "./match.js";

const DEFAULTS = { roots: ["~/Lab"], depth: 3, folders: [] };
// How many matches show: the best ones, as a fuzzy finder does.
const SHOWN = 12;
// At most this many folders are looked at per search, so a huge root can't stall it.
const MAX_FOLDERS = 5000;
// The projects you picked last, newest first, kept in this mod's storage.
const RECENT_KEY = "trailhead.recent";
const RECENT_MAX = 50;

export default class Trailhead extends View {
  init(_props, cx) {
    this.filter = "";
    this.at = 0;
    this.repos = null; // [{ path, kind, logs, name }], once found
    this.touched = new Map(); // path → seconds since 1970 of its last commit, checkout or pull
    this.recent = readRecent();
    this.input = InputState.new({ placeholder: "Open a project…" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      this.at = 0;
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => cx.spawn((cx) => this.go(this.rows()[this.at], cx)));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => {
      const found = await findProjects(await config());
      // Named after their folder; a worktree after its repo too ("acme/login"); and where two
      // names clash, after as much of the path as tells them apart.
      const label = (r) => (r.repo ? `${base(r.repo)}/${base(r.path)}` : base(r.path));
      const names = uniqueNames(found.map((r) => ({ path: r.path, label: label(r) })));
      this.repos = found.map((r, i) => ({ ...r, name: names[i] }));
      cx.notify();
      // When each repo last changed, read after the list shows so it never waits on this.
      for (const r of this.repos) {
        const t = r.logs ? await lastChange(r.logs) : null;
        if (t !== null) this.touched.set(r.path, t);
      }
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  // Open spaces on this computer, then the projects without one. With nothing typed:
  // open spaces, then your recent picks, then the rest by name. Typed: best matches first.
  rows() {
    const local = localSpaces();
    const repos = this.repos ?? [];
    const kindOf = new Map(repos.map((r) => [r.path, r.kind]));
    const row = (r) => ({ ...r, touched: this.touched.get(r.path) ?? null });
    const rows = local.map(({ space, folders }) => {
      const path = space.folder && kindOf.has(space.folder) ? space.folder : (folders[0] ?? "");
      return row({ kind: kindOf.get(path) ?? "space", space, name: space.name, path });
    });
    for (const r of repos) {
      if (!spaceFor(r.path, local)) rows.push(row({ kind: r.kind, name: r.name, path: r.path }));
    }
    const typed = this.filter.trim();
    const f = typed.toLowerCase();
    if (!f) return ordered(rows, this.recent).slice(0, SHOWN);
    // A typed path: that folder first, then what is inside it.
    if (isPath(typed)) {
      const path = trim(expand(typed));
      const key = (p) => p.toLowerCase();
      const same = rows.find((r) => key(r.path) === key(path));
      const inside = rows.filter((r) => r !== same && key(r.path).startsWith(key(join(path, ""))));
      const first = same ?? { kind: "typed", name: short(path), path, touched: null };
      return [first, ...inside].slice(0, SHOWN);
    }
    return best(rows, f, SHOWN, short, this.recent);
  }

  async go(r, cx) {
    if (!r) return;
    if (r.kind === "typed") return this.openTyped(r.path, cx);
    remember(r.path);
    this.close();
    if (r.kind === "space") return run("space.select", { id: r.space.id });
    const there = spaceFor(r.path, localSpaces());
    if (there) run("space.select", { id: there.id });
    else run("space.new", { folder: r.path, name: r.name });
  }

  // A typed folder opens when it exists; otherwise the popup says so and stays. Mods may
  // only read in the home folder, so a folder elsewhere opens unchecked, and Herdr says
  // so if it isn't there.
  async openTyped(path, cx) {
    if (inHome(path) && !(await isFolder(path))) {
      this.missing = this.filter.trim();
      cx.notify();
      return;
    }
    remember(path);
    this.close();
    const there = spaceFor(path, localSpaces());
    if (there) run("space.select", { id: there.id });
    else run("space.new", { folder: path, name: base(path) });
  }

  render() {
    const t = theme();
    const rows = this.rows();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    const empty =
      this.repos === null
        ? "Looking for projects…"
        : this.filter.trim()
          ? "No project matches. Type a path (~/code/app) to open any folder."
          : "No projects found. List your folders in projects.json in Herdr's folder.";
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
        if (!rows.length) return;
        if (k === "down" || k === "ctrl-n") this.at = (this.at + 1) % rows.length;
        else if (k === "up" || k === "ctrl-p") this.at = (this.at + rows.length - 1) % rows.length;
        else return;
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
      );
  }
}

// projects.json, or the defaults; a broken file is the defaults too.
async function config() {
  try {
    const c = JSON.parse(await readFile(`${appHome()}/projects.json`, "utf8"));
    const list = (v, d) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : d);
    const depth = Number.isInteger(c?.depth) && c.depth >= 1 && c.depth <= 6 ? c.depth : DEFAULTS.depth;
    return { roots: list(c?.roots, DEFAULTS.roots), depth, folders: list(c?.folders, []) };
  } catch {
    return DEFAULTS;
  }
}

// Every repo under the roots, plus the listed folders, each as { path, kind, logs, repo }:
// kind "repo" (a .git folder), "worktree" (a .git file pointing at its repo's) or
// "folder"; logs is the reflog that says when it last changed; repo, a worktree's repo. A repo's own folders
// aren't searched, so a submodule or a vendored checkout inside it is left out.
async function findProjects({ roots, depth, folders }) {
  const found = [];
  let budget = MAX_FOLDERS;
  // `left`: how many more levels below this folder may be searched.
  const walk = async (dir, left, isRoot) => {
    if (budget-- <= 0) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // gone, unreadable, or outside the home folder
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
  for (const root of roots) await walk(trim(expand(root)), depth, true);
  found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const seen = new Set(found.map((r) => r.path));
  for (const f of folders) {
    const path = trim(expand(f));
    if (seen.has(path)) continue;
    if (!inHome(path) || (await isFolder(path))) found.push({ path, kind: "folder", logs: null });
    seen.add(path);
  }
  return found;
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

async function isFolder(path) {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

// The spaces on this computer, each with its folders: where it is now first (its shown
// tab's focused terminal, else its first), then its other terminals' folders, then where
// it was made. Read once per list, not once per project.
function localSpaces() {
  const all = panes();
  return spaces()
    .filter((s) => !s.machine)
    .map((space) => {
      const shown = space.tabs.find((t) => t.active) ?? space.tabs[0];
      const tabs = new Set(space.tabs.map((t) => t.id));
      const mine = all.filter((p) => tabs.has(p.tab) && p.cwd);
      const here = mine.filter((p) => p.tab === shown?.id);
      const now = (here.find((p) => p.focused) ?? here[0])?.cwd;
      const folders = [now, ...mine.map((p) => p.cwd), space.folder].filter(Boolean);
      return { space, folders: [...new Set(folders)] };
    });
}

// The space on this computer for a folder: made there, else one with a terminal in it.
function spaceFor(path, local) {
  const made = local.find(({ space }) => space.folder === path);
  if (made) return made.space;
  const inside = (cwd) => cwd === path || cwd.startsWith(join(path, ""));
  return local.find(({ folders }) => folders.some(inside))?.space;
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

function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

// Puts a path first in the recent picks.
function remember(path) {
  const list = [path, ...readRecent().filter((p) => p !== path)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable: the order just doesn't remember.
  }
}
