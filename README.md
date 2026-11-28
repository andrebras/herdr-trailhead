# Trailhead

[![CI](https://github.com/andrebras/herdr-trailhead/actions/workflows/ci.yml/badge.svg)](https://github.com/andrebras/herdr-trailhead/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**Cmd+O, a few letters, Enter: you are in that project's space.** Trailhead is a project picker for the [Herdr](https://herdr.dev) desktop app. It finds your git repos and worktrees on its own, and takes you to the project's open space, or makes one in its folder.

<p align="center">
  <img src="preview.png" width="640" alt="Trailhead's popup: a search field over a list of projects. acme-web, the project used before, is first and selected. Worktrees show their repo and branch, such as acme-web › fix-login and billing-api › invoice-pdf. Open spaces have a dot, and each row shows its kind (repo, worktree or folder) and how long ago it last changed. The footer lists the keys, including Tab for worktrees.">
</p>

## Why Trailhead

- **It finds your projects, with nothing to install.** It searches your code folders for git repos and worktrees by itself. [zoxide](https://github.com/ajeetdsouza/zoxide), a tool that ranks the folders you visit, is optional and only sharpens the order.
- **The list is there at once.** The list from your last open draws in the popup's first frame. Then the folders are read again, and rows update in place without moving your selection.
- **It never closes anything.** Enter goes to the project's open space, or makes a new one. Trailhead never asks Herdr to close a space.
- **Cmd+O, Enter jumps back.** With nothing typed, the project you were in before is first and selected.
- **`@` shows one machine's projects.** Herdr can connect to other machines. Trailhead lists their projects too, and `@` narrows the list to one of them.
- **Worktrees show their branch.** A git worktree is a second folder of the same repo, checked out on another branch. Trailhead shows it as `acme-web › fix-login`, and typing part of the branch finds it.
- **Cmd+Enter starts your agent there.** It opens the project and runs `claude`, or the coding agent you choose, in it.

Each row also shows its space's agent status as a coloured dot, its kind and how long ago it last changed.

## Worktrees by branch

Tab on a repo that has worktrees, or on one of its worktrees, shows only that repo and its worktrees. The repo comes first, then each worktree by its branch. On this computer, worktrees inside the repo or in hidden folders, such as `.claude/worktrees/`, are listed too, from git's own record of them. Backspace in an empty search removes the repo filter.

<p align="center">
  <img src="preview-worktrees.png" width="640" alt="Trailhead narrowed to one repo: an acme-web › pill in the search field, then the acme-web repo, and under it its worktrees fix-login, new-checkout and dark-mode, each with its age.">
</p>

## Install

Give the coding agent you run in Herdr this line:

```text
Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/andrebras/herdr-trailhead
```

Or by hand:

```sh
git clone https://github.com/andrebras/herdr-trailhead.git
cp -R herdr-trailhead/mods/trailhead ~/.config/herdr-app/mods/
herdr-app check ~/.config/herdr-app/mods/trailhead
```

Then bind a key in the `global` section of `~/.config/herdr-app/keys.json`. Herdr's default keys leave both of these free:

```text
"cmd-o": "mod.open:trailhead"        macOS
"ctrl-alt-o": "mod.open:trailhead"   Linux and Windows
```

Herdr's command palette has it too, as "Open a project". If you set `HERDR_APP_HOME`, use that folder instead of `~/.config/herdr-app`. To update, replace `mods/trailhead` with a fresh copy; your settings live outside it.

## Keys

| Key                                             | What it does                                                    |
| ----------------------------------------------- | --------------------------------------------------------------- |
| Enter, or a click                               | Go to the project's space, or make one in its folder            |
| Alt+Enter or Shift+Enter                        | Make a new space there, even if one is open                     |
| Cmd+Enter (Ctrl+Enter on Linux/Windows)         | Go there and start your agent, in a new tab or a new space      |
| ↑ ↓, Ctrl+P / Ctrl+N                            | Move the selection                                              |
| Type a path, such as `~/code/app`               | List that folder first, so Enter opens a space there            |
| `@`, then Space, Tab or Enter on a machine      | Show only that machine's projects (`@dev` narrows the machines) |
| A click on a row's machine                      | Show only that machine's projects                               |
| Tab on a repo with worktrees, or on one of them | Show only that repo and its worktrees                           |
| Backspace in an empty search                    | Remove the repo filter, then the machine filter                 |
| Esc                                             | Close                                                           |

The popup's bottom line shows these keys for your platform. `@` and the Machine column work only while another machine is connected; with none, `@` is just a letter. The Tab hint shows only when the selected row has worktrees.

## Settings

Settings live in `~/.config/herdr-app/trailhead.json`, outside the mod's folder, so updates never reset them. Every key is optional. Trailhead reads the file each time it opens.

```json
{
  "roots": ["~/code", "~/work"],
  "depth": 3,
  "folders": ["~/notes"],
  "agent": ["claude", "--continue"],
  "zoxide": "auto"
}
```

| Setting   | Default                   | What it does                                                               |
| --------- | ------------------------- | -------------------------------------------------------------------------- |
| `roots`   | the code folders you have | Folders searched for git repos and worktrees                               |
| `depth`   | `3`                       | How many levels below each root to search, from 1 to 6                     |
| `folders` | `[]`                      | Folders listed as they are, git or not                                     |
| `agent`   | `["claude"]`              | What Cmd+Enter starts, as a list: `["codex"]`, `["~/bin/start-work"]`      |
| `zoxide`  | `"auto"`                  | `"auto"` uses zoxide's ranking when it is installed; `"off"` never runs it |

Without `roots`, Trailhead searches whichever of these exist: `~/code`, `~/projects`, `~/src`, `~/dev`, `~/Developer`, `~/work`, `~/git`, `~/repos` and `~/Lab` (and `~/Code`, `~/Projects`). A bad value, or a root you set that is missing or can't be read, shows as one red line at the top of the popup; a bad value falls back to its default.

## How it compares

Several pickers exist for Herdr, and each suits a different habit:

- [herdr-app-navigator](https://github.com/alizdavoodi/herdr-app-navigator) is a desktop mod that lists open spaces, agents and zoxide's folders, on this computer and on connected machines. Folders come from zoxide, so it needs zoxide on each machine you want listed.
- [project-finder](https://github.com/mike-bronner/herdr-plugin-project-finder) lists git repos and worktrees under one root folder, with a tick on each open one. Enter makes the ticked rows the open set, so it also closes the open projects you untick.
- [Sesh for Herdr](https://github.com/fullerzz/herdr-plugin-sesh) lists open spaces, sessions you describe in a TOML file, and zoxide's folders, with a live preview of each terminal. Its desktop mod needs its `herdr-sesh` program built and on your `PATH`.
- [herdr-navigator](https://github.com/thanhdat77/herdr-navigator) searches workspaces, agents, projects, sessions and more. It is a plugin for Herdr in the terminal, not a mod for the desktop app.

Trailhead is for finding projects on disk with nothing else to set up, and opening them without ever closing anything.

## How it works

- **Finding.** It walks each root up to `depth` levels. A folder with a `.git` folder is a repo; one with a `.git` file is a worktree. It skips hidden folders and `node_modules`, never looks inside a repo, and stops after 5,000 folders. Then it reads git's own list of each repo's worktrees, which also finds those inside a repo or in a hidden folder.
- **Last change.** The time of the last entry in the repo's reflog, git's log of where its branches pointed: a commit, checkout or pull.
- **Opening.** The list from last time draws in the first frame. Then the folders are read again, and rows update in place without moving your selection.
- **Order.** With nothing typed: the previous project, your open spaces, recent picks, then the rest by last change, and the current space last. Typed: a fuzzy match on the name, then on the path, with open spaces, recent picks and zoxide breaking ties. It shows the best 12 rows.
- **Other machines.** Through Herdr, it runs one small `sh` script on each connected machine, with the same roots and depth and a 2-second limit. Missing roots are skipped quietly there. Their rows show no age. They hide while the machine can't be reached, and leave the list when you remove it from Herdr.

[RECIPE.md](RECIPE.md) has the full rules.

## What it reads and runs

- **Reads:** `trailhead.json` in Herdr's folder, the folder names under your roots, the `.git` entries and reflogs of the repos it finds, and the `HEAD` file that names each worktree's branch. Herdr lets mods read only inside your home folder.
- **Runs:** `zoxide query -ls` once per open, when zoxide is installed. On Cmd+Enter, `command -v` (`where` on Windows) to check that the agent is installed. On each other machine, the `sh` script above.
- **Asks Herdr to:** select a space, make a space or add a tab. Nothing else, and never to close anything.
- **Stores:** your recent picks and the last list it found, in the mod's storage in Herdr's folder. It makes no network requests.

## More

- [RECIPE.md](RECIPE.md): the brief to rebuild Trailhead from scratch.
- [CHANGELOG.md](CHANGELOG.md): what changed in each version.
- [CONTRIBUTING.md](CONTRIBUTING.md): set up, run the checks, send a change.
- [SECURITY.md](SECURITY.md): report a vulnerability privately.
- [Apache License 2.0](LICENSE).
