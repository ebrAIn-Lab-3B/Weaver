import * as vscode from 'vscode';
import { choosePageOpener, SIMPLE_BROWSER_COMMAND, type PageOpener } from '@palab/weaver-markdown';

/** What this VS Code can do, asked once: the commands do not change while the window is open. */
let opener: Promise<PageOpener> | undefined;

function openerOfThisVsCode(): Promise<PageOpener> {
  opener ??= Promise.resolve(vscode.commands.getCommands(true)).then(
    (commands) => choosePageOpener(commands),
    () => 'system' as const,
  );
  return opener;
}

/** Opens a page in the system browser. This is the one explicit way to leave VS Code (DEC-020 item 3). */
export async function openInSystemBrowser(url: string): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(url));
}

/**
 * Opens a GitHub page the way DEC-020 says: in a tab of the editor, through Simple Browser, when this
 * VS Code has the built-in browser; otherwise in the system browser. The person signs in on the page
 * itself; Weaver puts no token in it and reads nothing from it. If the tab cannot be opened, the page
 * is opened in the system browser instead, so a link never does nothing.
 */
export async function openPage(url: string): Promise<void> {
  if ((await openerOfThisVsCode()) === 'built-in') {
    try {
      await vscode.commands.executeCommand(SIMPLE_BROWSER_COMMAND, url);
      return;
    } catch {
      // Fall through to the system browser.
    }
  }
  await openInSystemBrowser(url);
}
