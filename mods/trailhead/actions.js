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

/**
 * How to check that a program is installed, run through `exec`: `command -v` in sh, or
 * `where` on Windows.
 * @param {string} program
 * @param {boolean} windows
 * @returns {{ command: string, args: string[] }}
 */
export function installedCheck(program, windows) {
  if (windows) return { command: "where", args: [program] };
  return { command: "sh", args: ["-c", 'command -v "$1" >/dev/null 2>&1', "sh", program] };
}
