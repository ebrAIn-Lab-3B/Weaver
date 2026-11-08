/** A command that exists in a VS Code that has the built-in browser (DEC-020 item 1). */
export const BUILT_IN_BROWSER_PROBE = 'workbench.action.browser.zoomIn';

/** Simple Browser's command, which shows a page in an editor tab (DEC-020 item 1). */
export const SIMPLE_BROWSER_COMMAND = 'simpleBrowser.show';

/** Where a GitHub page is shown: in a tab of the editor, or in the system browser. */
export type PageOpener = 'built-in' | 'system';

/**
 * Chooses how to open a GitHub page (DEC-020 items 1 and 2). The built-in browser is used when this
 * VS Code has it, which is told by its commands and not by a version number; with an older VS Code,
 * Simple Browser would frame the page, which GitHub refuses, so the system browser is used instead.
 */
export function choosePageOpener(commands: ReadonlySet<string> | readonly string[]): PageOpener {
  const has = (id: string): boolean => (commands instanceof Set ? commands.has(id) : (commands as readonly string[]).includes(id));
  return has(BUILT_IN_BROWSER_PROBE) && has(SIMPLE_BROWSER_COMMAND) ? 'built-in' : 'system';
}
