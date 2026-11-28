# Security policy

## Supported versions

Only the newest version gets security fixes: the latest release, and the latest commit on `main` until a release follows it. If you use an older copy, update first and check whether the problem is still there.

## Report a vulnerability

Please report security problems privately. Do not open a public issue, pull request or discussion about them, because that shows the problem to everyone before a fix exists.

1. Go to the [Security tab](https://github.com/andrebras/herdr-trailhead/security) of this repository.
2. Click **Report a vulnerability**. This opens a private report that only the maintainers can see.
3. Describe the problem, the steps to reproduce it, what an attacker could do with it, and the Trailhead and Herdr versions you used.

Please do not talk about the problem in public until a fix is released.

## What is in scope

Trailhead is a mod for the Herdr desktop app. Reports are welcome on anything that lets it do more than it should, for example:

- reading files it does not need;
- showing or leaking file contents beyond the names and paths it lists;
- running programs other than those listed below, or making network requests;
- opening or switching to a space in a folder or on a machine other than the one you picked;
- harm caused by a crafted settings file, folder name, `.git` file or reflog, here or on another machine;
- exposing what it stores.

What Trailhead does, by design:

- **Reads** `trailhead.json` in Herdr's folder, the folder names under the roots, and the `.git` entries and reflogs of the repos it finds. Herdr lets mods read only inside your home folder.
- **Runs** `zoxide query -ls` when zoxide is installed; on Cmd+Enter, `command -v` (or `where` on Windows) to check that the agent program is installed; and on each other machine Herdr is connected to, a small `sh` script that lists the repos under the roots. The roots are quoted before they go into that script.
- **Asks Herdr** only to select a space, make a new one or add a tab.
- **Stores** two things in the mod's local storage, which Herdr keeps in its own folder: the projects and spaces you picked recently, and the last list it found (each project's path, name, kind, machine, reflog path and age).

Problems in Herdr itself, such as the limits Herdr puts on what mods can read, belong to the Herdr project. Please report those to Herdr.
