# Security policy

## Supported versions

Only the latest release of Trailhead gets security fixes. If you use an older copy, update to the latest release first and check whether the problem is still there.

## Report a vulnerability

Please report security problems privately. Do not open a public issue, pull request or discussion about them, because that shows the problem to everyone before a fix exists.

To report one:

1. Go to the [Security tab](https://github.com/andrebras/herdr-trailhead/security) of this repository.
2. Click **Report a vulnerability**. This opens a private report that only the maintainers can see. GitHub calls this "private vulnerability reporting".
3. Describe the problem, the steps to reproduce it, what an attacker could do with it, and the Trailhead and Herdr versions you used.

Please do not talk about the problem in public until a fix is released.

## What is in scope

Trailhead is a mod (a small plugin) for the Herdr desktop app. Reports are welcome on anything that would let it do more than it should, for example:

- reading files it does not need, or files outside your home folder;
- showing or leaking file or folder contents beyond the names and paths it lists;
- running programs, or making network requests;
- opening or switching to a space in a folder other than the one you picked;
- harm caused by a crafted `projects.json`, folder name, `.git` file or reflog;
- exposing the list of recent picks it stores in the mod's local storage.

What Trailhead does, by design:

- It reads `projects.json` in Herdr's folder, the folder names under the roots it lists, and the `.git` entries and reflogs (git's log of commits, checkouts and pulls) of the repositories it finds. Herdr only lets mods read files inside your home folder.
- It runs no programs. It asks Herdr only to select a space or make a new one.
- It stores the last 50 projects you picked in the mod's local storage, which Herdr keeps in its own folder.

Problems in Herdr itself, such as the limits Herdr puts on what mods can read, belong to the Herdr project. Please report those to Herdr.
