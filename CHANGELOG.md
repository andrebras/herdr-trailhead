# Changelog

All notable changes to Trailhead are listed in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-11-27

The first release.

### Added

- Cmd+O opens a popup that lists the git repos and worktrees under your code folders, the folders you list, and your open spaces. Enter goes to the project's space, or makes one in its folder.
- Jump back: with nothing typed, the project you were in before is first and selected, so Cmd+O then Enter takes you back.
- With nothing typed, open spaces and recent picks come first, then the rest by last change, newest first.
- Fuzzy matching on names and paths, with the matched letters highlighted. Open spaces, spaces where an agent is blocked, recent picks and, when installed, zoxide's ranking break ties.
- Each row shows its space's agent status as a coloured dot, its kind (repo, worktree or folder) and how long ago it last changed.
- When two projects share a folder name, each shows as much of its path as tells them apart, such as `work/api` and `home/api`.
- Alt+Enter (or Shift+Enter) makes a new space even if one is open.
- Cmd+Enter (Ctrl+Enter on Linux and Windows) also starts your agent there: `claude`, or the `agent` setting. `~` in it means the home folder.
- Type a path, such as `~/code/app`, to open any folder.
- Projects on the other machines Herdr is connected to, in a Machine column. A machine's projects hide while it can't be reached, and leave the list when you remove it from Herdr.
- The last list shows as soon as the popup opens, then updates in place without moving your selection.
- Settings in `trailhead.json` in Herdr's folder, so updating the mod never resets them: `roots`, `depth`, `folders`, `agent` and `zoxide`.
- Without `roots`, the usual code folders you have are searched, such as `~/code` or `~/projects`, and the ones you don't have are skipped quietly.
- One red line at the top of the popup for a bad setting, a root it can't read, another machine it couldn't search, or an agent that isn't installed.

[Unreleased]: https://github.com/andrebras/herdr-trailhead/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/andrebras/herdr-trailhead/releases/tag/v0.1.0
