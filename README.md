# Trailhead

[![CI](https://github.com/andrebras/herdr-trailhead/actions/workflows/ci.yml/badge.svg)](https://github.com/andrebras/herdr-trailhead/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

A project picker for the [Herdr](https://herdr.dev) desktop app: press Cmd+O, type a few letters of a project, press Enter, and you are in it.

Trailhead is a mod, a small plugin that runs inside Herdr. In Herdr, a "space" is a place to work: a set of tabs that hold terminals and coding agents, listed in the sidebar. A project's space is one that was made in the project's folder, or that has a terminal in it. Trailhead goes to that space when one is open, and makes a new space in the project's folder when none is.

## Contents

- [What it does](#what-it-does)
- [Install](#install)
- [Usage](#usage)
- [Settings](#settings)
- [Privacy and permissions](#privacy-and-permissions)
- [Roadmap](#roadmap)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## What it does

Trailhead opens a popup with a search field and a list of projects. A project is a git repository (a "repo") that Trailhead finds under your folders, or a folder you list yourself.

Rows look like this:

```text
●  acme-web         ~/code/acme-web          repo       2h
●  notes            ~/notes                  folder
   acme-web-login   ~/code/acme-web-login    worktree   3d
```

From left to right, a row shows:

- **A status dot**, on projects that have an open space. Its colour is the status of the agents in that space, in Herdr's own colours: working, blocked, done or idle. A space with no agent status shows the accent colour.
- **The name**: the space's name, or the project folder's name.
- **The path**, with `~` for your home folder.
- **The kind**: `repo` (a git repository), `worktree` (a git worktree: a second checkout of a repository, in its own folder, usually on another branch) or `folder` (a folder you listed in the settings). An open space that is not one of your projects shows no kind.
- **The last change**: how long ago the project last changed, as `now`, `5m`, `3h`, `2d`, `3w`, `4mo` or `2y`. Trailhead reads this from git's reflog, the log git keeps in each repository of every commit, checkout and pull. Rows without git show nothing here.

With nothing typed, the list shows your open spaces first, in the sidebar's order. Then come the projects you picked most recently, newest first. Then come the rest, by name.

When you type, Trailhead matches your letters fuzzily. A name that starts with what you typed comes first. Then a name that contains it. Then a name that has your letters in the same order with others in between (`aw` finds `acme-web`). Last come matches in the path. Among similar matches, open spaces and recent picks come first. The list shows the best 12 rows.

You can also type a path, such as `~/code/acme-web`. The folder you typed comes first, then the projects inside it.

Trailhead never creates folders and never closes a space. It only lists the spaces on this computer.

## Install

You need the Herdr desktop app. Herdr keeps its files in `~/.config/herdr-app`, or in the folder named by `HERDR_APP_HOME` if you set it. Use that folder wherever this guide says `~/.config/herdr-app`.

### With your agent

Herdr lets the coding agents you run in it install mods. Give your agent this line:

```text
Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/andrebras/herdr-trailhead
```

Herdr's guide tells the agent to read every file first, copy the mod folder, merge the key binding into your `keys.json` (asking before it replaces a key you already use), and check that the mod loads.

### By hand

1. Make sure `~/.config/herdr-app/mods/trailhead` does not exist yet.
2. Copy the mod into Herdr's folder:

   ```sh
   git clone https://github.com/andrebras/herdr-trailhead.git
   cp -R herdr-trailhead/mods/trailhead ~/.config/herdr-app/mods/trailhead
   ```

   Keep the folder name `trailhead`: the mod finds its own icon by that name.

3. Check that it loads:

   ```sh
   herdr-app check ~/.config/herdr-app/mods/trailhead
   ```

   It prints `check passed:` followed by the mod's path.

4. Bind a key to it. This repository's `keys.json` holds one binding. Add it to the `global` section of `~/.config/herdr-app/keys.json`:

   ```json
   "cmd-o": "mod.open:trailhead"
   ```

   Herdr's default keys leave Cmd+O free on macOS. If you already bound it to something else, replace that line or give Trailhead another key.

   On Linux and Windows, use a key with Ctrl instead, such as `"ctrl-alt-o"`, which Herdr's default keys leave free.

> [!NOTE]
> Herdr upgrades your `keys.json` to new default shortcuts only while you have never edited it. Once you edit it, add new default shortcuts from Herdr updates by hand.

You can also open Trailhead from Herdr's command palette: search for `trailhead`. Its entry is titled "Open a project".

To update Trailhead, delete `~/.config/herdr-app/mods/trailhead`, then copy the folder again as in step 2. To remove it, delete `~/.config/herdr-app/mods/trailhead` and its key binding.

## Usage

| Key               | What it does                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Cmd+O             | Opens Trailhead (with the binding above).                                                |
| Typing            | Filters the list.                                                                        |
| ↑ / ↓             | Moves the selection. It wraps around at both ends.                                       |
| Enter, or a click | Goes to the project's space, or makes a new space in its folder, named after the folder. |
| Esc               | Closes Trailhead.                                                                        |

To open any folder, type its path. It must start with `~`, `/`, or a drive such as `C:\`. Enter opens a space there. If the folder is in your home folder and does not exist, the row says "no such folder" and the popup stays open. Herdr only lets mods read inside your home folder, so a folder elsewhere opens without a check, and Herdr tells you if it is not there.

## Settings

Trailhead reads `projects.json` in Herdr's folder (`~/.config/herdr-app/projects.json`). Trailhead reads the file again each time it opens, so a change shows the next time you open it.

```json
{
  "roots": ["~/code"],
  "depth": 3,
  "folders": ["~/notes"]
}
```

| Setting   | Default     | What it does                                                                                              |
| --------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `roots`   | `["~/Lab"]` | The folders searched for git repositories. A root itself is never listed, only the repositories under it. |
| `depth`   | `3`         | How many folder levels below each root to search. A whole number from 1 to 6; any other value means 3.    |
| `folders` | `[]`        | Folders listed as they are, with the kind `folder`, git or not.                                           |

Without the file, or with a file that is not valid JSON, Trailhead uses the defaults.

While it searches, Trailhead:

- skips hidden folders (names that start with `.`) and `node_modules`;
- does not search inside a repository, so submodules and other repositories copied inside it are left out;
- looks at no more than 5,000 folders, so a very large root cannot stall it.

## Privacy and permissions

- **Files it reads:** `projects.json`, the folder names under your roots, and the `.git` entries and reflogs of the repositories it finds. Herdr only lets mods read files inside your home folder. A root outside it finds nothing. A listed folder or typed path outside it is shown or opened without being checked.
- **Programs it runs:** none. It asks Herdr to select a space (`space.select`) or make one (`space.new`), and nothing else.
- **Network:** it makes no network requests.
- **What it stores:** the last 50 projects you picked, so it can list them first. They are kept in the mod's local storage, which Herdr saves under `~/.config/herdr-app/data/trailhead/`.

## Roadmap

These are planned, not built yet:

- Projects and spaces on other machines connected to Herdr.
- Cmd+Enter to start an agent in the chosen project.
- Alt+Enter for an extra action on the chosen project.
- A listing in the [Herdr mods gallery](https://herdr.dev/mods).

## Development

You need Node.js 22.13 or newer. The exact version is pinned in `.tool-versions`, which version managers such as asdf and mise read.

```sh
npm ci              # install the development tools
npm test            # run the unit tests
npm run lint        # check the code for common mistakes
npm run format      # format the code (npm run format:check only checks it)
npm run typecheck   # check the types
bin/ci              # run every check
```

The unit tests cover the parts that do not need Herdr: matching and ordering (`mods/trailhead/match.js`) and path handling (`mods/trailhead/paths.js`).

When Herdr is installed, `bin/ci` also runs `herdr-app check` on `mods/trailhead`. That check loads the mod in Herdr, with a temporary Herdr folder so your own setup is not touched. GitHub's CI (continuous integration: the checks that run on every pull request) cannot run it, because Herdr is not installed there. Run `bin/ci` on your own computer before you open a pull request.

## Contributing

Bug reports, ideas and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. To report a security problem, follow [SECURITY.md](SECURITY.md). Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## License

[Apache License 2.0](LICENSE).
