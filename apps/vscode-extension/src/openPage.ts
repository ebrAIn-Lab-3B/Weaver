import * as vscode from 'vscode';
import { choosePageOpener, SIMPLE_BROWSER_COMMAND, type PageOpener } from '@ebrain-lab/weaver-markdown';
import { log } from './log';

/**
 * What this VS Code can do. Only a yes is kept: once the built-in browser is there it stays there, but a
 * no is asked again at the next link, so an answer given before the browser was ready is never kept.
 */
let builtIn = false;

async function openerOfThisVsCode(): Promise<PageOpener> {
  if (!builtIn) {
    try {
      builtIn = choosePageOpener(await vscode.commands.getCommands(true)) === 'built-in';
    } catch {
      // Without the list there is no way to tell, so the system browser is used this time.
    }
  }
  return builtIn ? 'built-in' : 'system';
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
  const opener = await openerOfThisVsCode();
  if (opener === 'built-in') {
    try {
      await vscode.commands.executeCommand(SIMPLE_BROWSER_COMMAND, url);
      log(`open page in the built-in browser: ${url}`);
      follower?.watch(url);
      return;
    } catch (error) {
      // Fall through to the system browser, and say why in the log.
      log(`the built-in browser could not show ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    log(`open page in the system browser (this VS Code has no built-in browser): ${url}`);
  }
  await openInSystemBrowser(url);
  follower?.watch(url);
}

/** Follows the pull requests and Issues whose pages are opened (DEC-020 item 6). Set once, when the extension starts. */
let follower: { watch(url: string): void } | undefined;

export function followOpenedPages(watcher: { watch(url: string): void } | undefined): void {
  follower = watcher;
}
