# Contributing to Trailhead

Thank you for helping. This guide explains how to set up the project, which checks a change must pass, and how to send it.

To report a security problem, do not open an issue: follow [SECURITY.md](SECURITY.md).

## Report a bug or ask for a feature

Open an issue and pick the bug report or the feature request form. Search the existing issues first, in case someone has reported it already. For anything bigger than a small fix, open an issue before you write code, so we can agree on the approach.

## Set up

You need:

- [Node.js](https://nodejs.org) 22.13 or newer. The exact version is pinned in `.tool-versions`, which version managers such as asdf and mise read.
- The [Herdr](https://herdr.dev) desktop app, to try the mod and to run `herdr-app check`. The unit tests run without it.

Then:

```sh
git clone https://github.com/andrebras/herdr-trailhead.git
cd herdr-trailhead
npm ci
```

`npm ci` installs the exact versions of the development tools listed in `package-lock.json`.

To try your change in Herdr, copy `mods/trailhead` into `~/.config/herdr-app/mods/` as the [README](README.md#install) explains. Herdr reloads a mod when one of its files is saved.

## Checks

| Command                | What it does                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm test`             | Runs the unit tests.                                                                                        |
| `npm run lint`         | Checks the code for common mistakes.                                                                        |
| `npm run format`       | Formats the code, Markdown files included.                                                                  |
| `npm run format:check` | Checks the formatting without changing anything.                                                            |
| `npm run typecheck`    | Checks the types; `main.js` too when Herdr is installed.                                                    |
| `bin/bench-herdr`      | Times the ranking inside Herdr with 5,000 projects; each case must take under 16 ms. Skipped without Herdr. |
| `bin/ci`               | Runs everything above, and loads the mod with `herdr-app check` when Herdr is installed.                    |

`herdr-app check` loads the mod in Herdr and reports any error. `bin/ci` runs it with a temporary Herdr folder, so your own setup is not touched.

GitHub's CI cannot run `herdr-app check`, because Herdr is not installed there. Run `bin/ci` on your own computer, and make sure it passes, before you open a pull request.

## Tests

`mods/trailhead/main.js` holds the view and everything that talks to Herdr. The other modules there import nothing from Herdr, so Node.js can test them: matching and order (`match.js`), paths (`paths.js`), settings (`settings.js`), the list kept between opens (`kept.js`), the commands each key sends (`actions.js`), the search on other machines (`remote.js`), open spaces and rows (`spaces.js`) and row keys (`keys.js`). Their tests are in `tests/`.

When you change one of these modules, add or update a test in the same pull request. A bug fix comes with a test that fails without the fix.

## Send a change

1. Create a branch from `main`. Never push to `main` directly: every change goes through a pull request.
2. Make your change, with tests where they apply.
3. Run `bin/ci` and fix anything it reports.
4. Update the [README](README.md) when you change what a person sees or can do, and [RECIPE.md](RECIPE.md) when you change how the popup looks or behaves. Add a line to the `Unreleased` section of the [changelog](CHANGELOG.md) when the change is one people will notice.
5. Push your branch and open a pull request. Fill in the template: what the change is, why, what changed, how you tested it, and what the reviewer should look at.

Keep pull requests small: one change each. A small pull request is easier to review and quicker to merge. Split a large change into several pull requests that each work on their own.

## Commit messages

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): a type, a colon, and a short description. Write them in lowercase, on a single line, with no body and no trailers.

```text
feat: show how many projects match
fix: keep the selection on the last row after a filter
docs: explain the depth setting
test: cover paths on windows drives
```

Common types are `feat` (a new feature), `fix` (a bug fix), `docs` (documentation only), `test` (tests only), `refactor` (a code change that changes no behaviour) and `chore` (tooling and upkeep). Make each commit one change.

## Screenshots

A screenshot helps when a change alters what the popup shows. Use invented project names and paths in it, such as `acme-web` or `~/code/notes`, never your real projects, folders or user name.

To make `preview.png` again, run Herdr on a scratch setup so your own stays untouched:

1. Make a scratch home with a few invented git repos, such as `/private/tmp/thp/home/code/acme-web`. Use a real path, not a symlink (on macOS `/tmp` is one), or open spaces won't match their projects. Keep it short: Herdr's socket path must stay under 104 bytes.
2. Put Herdr's folder inside that home (`/private/tmp/thp/home/.config/herdr-app`), because mods read only inside the home folder. Copy `mods/trailhead` into it, with a `trailhead.json` whose `roots` point at the repos, and a `shared.json` of `{"frame.welcomed": "skipped"}` so the first-run welcome stays closed.
3. Start the window with `HOME`, `HERDR_APP_HOME`, `XDG_STATE_HOME` and `HC_SESSION` all set for the scratch setup, so it also gets its own herdr-core.
4. Open the popup with `herdr-app do mod.open '{"name":"trailhead"}'`, save the window with `herdr-app shot`, and crop the PNG to the popup. Quit with `herdr-app do app.quit`, with the same variables set.

## License

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE), the same license as the project.
