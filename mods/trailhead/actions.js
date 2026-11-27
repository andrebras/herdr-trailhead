// What Enter, Alt+Enter and Cmd+Enter ask Herdr to do. Knows nothing about Herdr, so tests
// can run it under node.

/**
 * The command for a chosen project:
 * - Enter: go to its space, or make one there;
 * - Alt+Enter (`fresh`): make a new space there even if one is open;
 * - Cmd+Enter (`agent`): as Enter, and start the agent there: in a new tab of an open space,
 *   or as the first terminal of a new one.
 * @param {{ path: string, name: string, machine?: string | null }} project
 * @param {{ id: string } | null} space its open space, if any
 * @param {{ fresh?: boolean, agent?: string[] | null }} how
 * @returns {{ name: string, args: Record<string, unknown> }}
 */
export function command(project, space, how) {
  const argv = how.agent && how.agent.length > 0 ? { argv: how.agent } : {};
  if (space && !how.fresh) {
    if (argv.argv) return { name: "tab.new", args: { space: space.id, folder: project.path, ...argv } };
    return { name: "space.select", args: { id: space.id } };
  }
  const machine = project.machine ? { machine: project.machine } : {};
  return { name: "space.new", args: { folder: project.path, name: project.name, ...argv, ...machine } };
}

// sh's `command -v` finds a program on PATH or by its path. A leading ~ is expanded to that
// machine's home first (Herdr starts the agent without a shell that would expand it), and the
// program is printed back as it should be started.
const SH_CHECK =
  'p=$1; case $p in "~") p=$HOME ;; "~/"*) p=$HOME/${p#"~/"} ;; esac; command -v "$p" >/dev/null 2>&1 && printf %s "$p"';

/**
 * How to check that the agent program is installed, run through `exec` on the machine it
 * starts on: sh, or `where` on Windows. Null when it can't be checked (a path on Windows, which
 * `where` doesn't take): it is then started anyway and the terminal shows any error.
 * @param {string} program
 * @param {boolean} windows
 * @returns {{ command: string, args: string[] } | null}
 */
export function installedCheck(program, windows) {
  if (!windows) return { command: "sh", args: ["-c", SH_CHECK, "sh", program] };
  return /[/\\]/.test(program) ? null : { command: "where", args: [program] };
}

/**
 * The program to start, from what the check printed, or null when it isn't installed.
 * @param {string} program
 * @param {boolean} windows
 * @param {{ code: number, stdout: string }} out
 * @returns {string | null}
 */
export function checkedProgram(program, windows, out) {
  if (out.code !== 0) return null;
  return windows ? program : out.stdout || program;
}
