/** A command that exists in a VS Code that has the built-in browser (DEC-020 item 1). */
export const BUILT_IN_BROWSER_PROBE = 'workbench.action.browser.zoomIn';

/** Simple Browser's command, which shows a page in an editor tab (DEC-020 item 1). */
export const SIMPLE_BROWSER_COMMAND = 'simpleBrowser.show';

/** Where a GitHub page is shown: in a tab of the editor, or in the system browser. */
export type PageOpener = 'built-in' | 'system';

/**
 * Chooses how to open a GitHub page (DEC-020 items 1 and 2). The built-in browser is used when this
 * VS Code has it, which is told by one command of the built-in browser and not by a version number;
 * with an older VS Code, Simple Browser would frame the page, which GitHub refuses, so the system
 * browser is used instead.
 *
 * Simple Browser's own command is deliberately not looked for. It belongs to a built-in extension that
 * VS Code starts only when the command is first run, so until then it is missing from the list of
 * commands (seen on VS Code 1.145.2: `simpleBrowser.show` was absent from the list and ran fine). Asking
 * for it would send the first link of a session to the system browser. If running it fails, the caller
 * opens the system browser instead.
 */
export function choosePageOpener(commands: ReadonlySet<string> | readonly string[]): PageOpener {
  const has = (id: string): boolean => (commands instanceof Set ? commands.has(id) : (commands as readonly string[]).includes(id));
  return has(BUILT_IN_BROWSER_PROBE) ? 'built-in' : 'system';
}
