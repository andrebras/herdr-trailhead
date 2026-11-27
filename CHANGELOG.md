# Changelog

All notable changes to Trailhead are listed in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Other machines: projects on every machine Herdr is connected to, searched at the same time with a 2-second limit each, with a Machine column.
- Alt+Enter (or Shift+Enter) makes a new space even if one is open; Cmd+Enter (Ctrl+Enter on Linux and Windows) also starts your agent, `claude` unless the `agent` setting says otherwise.
- An error line at the top of the popup for bad settings, roots it can't read and a missing agent program.
- Settings live in the mod's own `mod.json`; `projects.json` still works for the ones it doesn't set.
- Opens instantly: the last list shows in the first frame, then updates in place without moving your selection.
- Ranking: an open space where an agent is blocked comes before other open spaces, and zoxide's ranking breaks ties when zoxide is installed.
- A project picker: Cmd+O opens a popup that lists your open spaces and the git repositories under your folders. Enter goes to the project's space, or makes a new space in its folder.
- Fuzzy matching: type a few letters of a project's name or path to find it.
- Typed paths, such as `~/code/acme-web`, open any folder.
- Settings: the folders to search (`roots`), how deep to search them (`depth`), and folders to list as they are (`folders`).
- A status dot on each open space, in the colour of its agents' status: working, blocked, done or idle.
- A kind column: repo, worktree or folder.
- A last-change column: how long ago each repository last had a commit, checkout or pull, read from git's reflog.
- Recent picks: with nothing typed, the projects you picked last come right after your open spaces.
- Unit tests for matching and path handling, and CI (continuous integration) that runs them on every pull request.

[Unreleased]: https://github.com/andrebras/herdr-trailhead/commits/main
