// Open a project: the git repos under your folders, as tmux-sessionizer lists them. Type
// to filter, ↑/↓ and Enter: go to the project's space, or make one there named after the
// folder. Open spaces come first. A typed path to a folder (~/code/foo) opens that folder
// when nothing matches; nothing else happens then. It never makes folders.
//
// Where it looks: projects.json in Herdr's folder,
//   { "roots": ["~/Lab"], "depth": 3, "folders": ["~/notes"] }
// roots are searched for repos `depth` folders down; folders are listed as they are.
// Without the file: ~/Lab, 3 deep. It looks again each time it opens. It reads folders
// itself (no `find`, so it works the same on every system), skipping hidden folders and
// node_modules, and only in your home folder, where mods may read.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { readFile, readdir, exists } from "fs/promises";
import { spaces, panes, run, theme, props, closeOverlay, home, appHome } from "herdr";

const DEFAULTS = { roots: ["~/Lab"], depth: 3, folders: [] };
// How many matches show: the best ones, as a fuzzy finder does.
const SHOWN = 12;
// At most this many folders are looked at per search, so a huge root can't stall it.
const MAX_FOLDERS = 5000;

export default class Projects extends View {
  init(_props, cx) {
    this.filter = "";
    this.at = 0;
    this.repos = null; // absolute paths, once found
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
      this.repos = await findProjects(await config());
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  // Open spaces on this computer, then the projects without one, best matches first.
  rows() {
    const local = localSpaces();
    const rows = local.map(({ space, folders }) => ({ kind: "space", space, name: space.name, path: folders[0] ?? "" }));
    for (const path of this.repos ?? []) {
      if (!spaceFor(path, local)) rows.push({ kind: "project", name: base(path), path });
    }
    const typed = this.filter.trim();
    const f = typed.toLowerCase();
    if (!f) return rows.slice(0, SHOWN);
    // A typed path: that folder first, then what is inside it.
    if (isPath(typed)) {
      const path = trim(expand(typed));
      const key = (p) => p.toLowerCase();
      const same = rows.find((r) => key(r.path) === key(path));
      const inside = rows.filter((r) => r !== same && key(r.path).startsWith(key(join(path, ""))));
      const first = same ?? { kind: "folder", name: base(path), path };
      return [first, ...inside].slice(0, SHOWN);
    }
    return rows
      .map((r) => ({ r, s: score(f, r.name.toLowerCase(), short(r.path).toLowerCase()) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, SHOWN)
      .map((x) => x.r);
  }

  async go(r, cx) {
    if (!r) return;
    if (r.kind === "folder") return this.openTyped(r.path, cx);
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
    const glyph = { space: "●", project: "○", folder: "+" };
    const note = (r) =>
      r.kind === "space" ? "open" : r.kind === "folder" ? (missing ? "no such folder" : "open this folder") : null;
    const row = (r, i) =>
      h_flex()
        .id(`pj-${i}`)
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
        .child(div().w(12).flex_none().text_color(r.kind === "space" ? t.accent : t.dim).child(glyph[r.kind]))
        .child(div().flex_none().max_w(220).truncate().text_color(t.foreground).child(r.name))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(short(r.path)))
        .when(Boolean(note(r)), (el) =>
          el.child(
            div()
              .flex_none()
              .text_size(11)
              .text_color(r.kind === "folder" && missing ? t.blocked : t.muted)
              .child(note(r)),
          ),
        );
    return v_flex()
      .id("projects")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(18)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        if (!rows.length) return;
        if (k === "down") this.at = (this.at + 1) % rows.length;
        else if (k === "up") this.at = (this.at + rows.length - 1) % rows.length;
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
              .id("projects-esc")
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
          .id("pj-list")
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

// Every repo (a folder with .git, a worktree's .git file included) under the roots,
// plus the listed folders. A repo's own folders aren't searched, so a submodule or a
// vendored checkout inside it is left out.
async function findProjects({ roots, depth, folders }) {
  const found = [];
  let budget = MAX_FOLDERS;
  const walk = async (dir, left) => {
    if (budget-- <= 0) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // gone, unreadable, or outside the home folder
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules" || !e.isDirectory()) continue;
      if (budget-- <= 0) return;
      const sub = join(dir, e.name);
      if (await exists(join(sub, ".git")).catch(() => false)) found.push(sub);
      else if (left > 1) await walk(sub, left - 1);
    }
  };
  for (const root of roots) await walk(trim(expand(root)), depth);
  const listed = [];
  for (const f of folders) {
    const path = trim(expand(f));
    if (!inHome(path) || (await isFolder(path))) listed.push(path);
  }
  return [...new Set([...found.sort(), ...listed])];
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

// Higher is better, 0 is no match: the name starting with it, then containing it, then
// its letters in order in the name or the path (a fuzzy match, as fzf does).
function score(f, name, path) {
  if (name.startsWith(f)) return 400 - name.length;
  if (name.includes(f)) return 300 - name.length;
  if (inOrder(f, name)) return 200 - name.length;
  if (path.includes(f)) return Math.max(101, 150 - path.length / 10);
  if (inOrder(f, path)) return Math.max(1, 100 - path.length / 10);
  return 0;
}

function inOrder(f, text) {
  let i = 0;
  for (const c of text) if (c === f[i]) i++;
  return i === f.length;
}

// Paths use the system's separator: "\\" on Windows, where home() has one.
function sep() {
  return home().includes("\\") ? "\\" : "/";
}

function join(dir, name) {
  return dir.endsWith(sep()) ? `${dir}${name}` : `${dir}${sep()}${name}`;
}

// A typed path: ~, /, \\ or a drive (C:\\).
function isPath(text) {
  return /^(~|[/\\]|[A-Za-z]:[/\\])/.test(text);
}

function expand(p) {
  if (p === "~") return home();
  return /^~[/\\]/.test(p) ? `${home()}${sep()}${p.slice(2)}` : p;
}

// Without a trailing separator, except for a root such as / or C:\\.
function trim(p) {
  const t = p.replace(/[/\\]+$/, "");
  return t === "" ? p.slice(0, 1) : /^[A-Za-z]:$/.test(t) ? `${t}${sep()}` : t;
}

function inHome(p) {
  const h = home();
  return p === h || p.startsWith(join(h, ""));
}

function short(p) {
  const h = home();
  return p === h ? "~" : p.startsWith(`${h}${sep()}`) ? `~${sep()}${p.slice(h.length + 1)}` : p;
}

function base(p) {
  return p.split(/[/\\]/).filter(Boolean).pop() ?? p;
}
