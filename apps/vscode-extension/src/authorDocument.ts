import * as vscode from 'vscode';
import * as path from 'path';
import { readdir, stat, writeFile } from 'fs/promises';
import { ideationDraft, parseArtifact, requirementDraft } from '@ebrain-lab/weaver-markdown';
import { message } from './locale';
import { RequirementCreationLocked, withRequirementCreationLock } from './requirementCreationLock';
import { highestReservedRequirementId, InvalidRequirementIdHistory, requirementIdHistoryPath, reserveRequirementId } from './requirementIdHistory';

/** Find the enclosing checkout, including worktrees whose .git is a file. */
async function repositoryRoot(folder: string): Promise<string | undefined> {
  let current = path.resolve(folder);
  while (true) {
    try {
      await stat(path.join(current, '.git'));
      return current;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/** Include files outside a nested workspace but inside its checkout. */
async function repositoryMarkdown(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const skipped = ['node_modules', '.git', 'dist', 'out', 'examples'].includes(entry.name)
          || (path.basename(directory) === '.claude' && entry.name === 'worktrees');
        if (!skipped) await visit(file);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(file);
    }
  }
  await visit(root);
  return files;
}

async function nextRequirementId(folder: vscode.WorkspaceFolder, repo: string | undefined): Promise<string> {
  const files = await vscode.workspace.findFiles('**/*.md', '**/{node_modules,.git,dist,out,examples,.claude/worktrees}/**');
  const paths = new Map(files.map(uri => [path.resolve(uri.fsPath), uri]));
  // A multi-folder workspace can contain reservations from several repositories.
  // Check all local allocation histories, including checkout roots above nested folders.
  const histories = new Set<string>([path.resolve(repo ?? folder.uri.fsPath)]);
  const repositories = new Set<string>(repo ? [path.resolve(repo)] : []);
  for (const workspace of vscode.workspace.workspaceFolders ?? []) {
    if (workspace.uri.scheme !== 'file') continue;
    const root = await repositoryRoot(workspace.uri.fsPath);
    histories.add(path.resolve(root ?? workspace.uri.fsPath));
    if (root) repositories.add(path.resolve(root));
  }
  for (const root of repositories) {
    for (const file of await repositoryMarkdown(root)) paths.set(path.resolve(file), vscode.Uri.file(file));
  }
  let max = 0n;
  for (const root of histories) {
    const reserved = await highestReservedRequirementId(root);
    if (reserved > max) max = reserved;
  }
  for (const uri of paths.values()) {
    const open = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
    const text = open ? open.getText() : new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    const artifact = parseArtifact(uri.fsPath, text).artifact;
    if (artifact?.kind === 'requirement') {
      const match = /^REQ-(\d+)$/.exec(artifact.id);
      if (match) {
        const value = BigInt(match[1]);
        if (value > max) max = value;
      }
    }
  }
  return `REQ-${String(max + 1n).padStart(3, '0')}`;
}

/** Human-authored files use the normal text editor and never require an external service. */
type AuthorWindow = Pick<typeof vscode.window, 'showErrorMessage' | 'showWorkspaceFolderPick' | 'showInputBox' | 'showSaveDialog' | 'showInformationMessage'>;

export async function createDocument(kind: 'ideation' | 'requirement', window: AuthorWindow = vscode.window): Promise<void> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (!folders.length) {
    void window.showErrorMessage(message('ui.author.no-workspace'));
    return;
  }
  const folder = folders.length === 1 ? folders[0] : await window.showWorkspaceFolderPick();
  if (!folder) return;
  if (folder.uri.scheme !== 'file') {
    void window.showErrorMessage(message('ui.author.local-only'));
    return;
  }
  const title = await window.showInputBox({
    prompt: message('ui.author.title'),
    validateInput: (value) => value.trim() && !/[\r\n]/.test(value) ? undefined : message('ui.author.required'),
  });
  if (!title) return;
  let id = '';
  let repo: string | undefined;
  let criterion = '';
  let outcome = '';
  if (kind === 'requirement') {
    outcome = (await window.showInputBox({ prompt: message('ui.author.outcome'), validateInput: (v) => v.trim() ? undefined : message('ui.author.required') })) ?? '';
    if (!outcome) return;
    criterion = (await window.showInputBox({ prompt: message('ui.author.criterion'), validateInput: (v) => v.trim() ? undefined : message('ui.author.required') })) ?? '';
    if (!criterion) return;
    try {
      repo = await repositoryRoot(folder.uri.fsPath);
      id = await nextRequirementId(folder, repo);
    } catch (error) {
      void window.showErrorMessage(error instanceof InvalidRequirementIdHistory ? message('ui.author.invalid-id-history', { path: error.historyFile }) : message('ui.author.failed', { detail: error instanceof Error ? error.message : String(error) }));
      return;
    }
  }
  const suggested = kind === 'requirement' ? `${id}.md` : 'ideation.md';
  const target = await window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(folder.uri, suggested),
    filters: { Markdown: ['md'] },
    saveLabel: message('ui.author.choose'),
  });
  if (!target) return;
  const relative = path.relative(folder.uri.fsPath, target.fsPath);
  if (target.scheme !== 'file' || !relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !target.fsPath.toLowerCase().endsWith('.md')) {
    void window.showErrorMessage(message('ui.author.destination'));
    return;
  }
  const content = kind === 'requirement'
    ? requirementDraft(id, title, outcome, criterion)
    : ideationDraft(title);
  const confirm = message('ui.author.create');
  const review = kind === 'requirement'
    ? message('ui.author.review-requirement', { path: target.fsPath, history: requirementIdHistoryPath(repo ?? folder.uri.fsPath) })
    : message('ui.author.review', { path: target.fsPath });
  const choice = await window.showInformationMessage(review, { modal: true, detail: content }, confirm);
  if (choice !== confirm) return;
  try {
    const create = async () => {
      if (kind === 'requirement') {
        if (await repositoryRoot(folder.uri.fsPath) !== repo || await nextRequirementId(folder, repo) !== id) {
          void window.showErrorMessage(message('ui.author.id-changed'));
          return false;
        }
        // A failed or interrupted file creation may consume an ID; never reuse it.
        await reserveRequirementId(repo ?? folder.uri.fsPath, id);
      }
      // Exclusive creation protects existing files, including a file created while the dialog was open.
      await writeFile(target.fsPath, content, { encoding: 'utf8', flag: 'wx' });
      return true;
    };
    const created = kind === 'requirement' ? await withRequirementCreationLock(create) : await create();
    if (!created) return;
    if (kind === 'ideation') await vscode.commands.executeCommand('vscode.open', target);
    else await vscode.commands.executeCommand('vscode.openWith', target, 'default');
  } catch (error) {
    if (error instanceof InvalidRequirementIdHistory) {
      void window.showErrorMessage(message('ui.author.invalid-id-history', { path: error.historyFile }));
      return;
    }
    if (error instanceof RequirementCreationLocked) {
      void window.showErrorMessage(message('ui.author.creation-locked', { path: error.lockPath }));
      return;
    }
    void window.showErrorMessage(message('ui.author.failed', { detail: error instanceof Error ? error.message : String(error) }));
  }
}

/** Inserts a normal relative Markdown link as an unsaved edit in the active requirement. */
export async function linkIdeation(): Promise<void> {
  const document = vscode.window.activeTextEditor?.document;
  if (!document || document.uri.scheme !== 'file' || parseArtifact(document.uri.fsPath, document.getText()).artifact?.kind !== 'requirement') {
    void vscode.window.showInformationMessage(message('ui.author.open-source'));
    return;
  }
  const selected = await vscode.window.showOpenDialog({
    canSelectMany: false,
    defaultUri: vscode.Uri.file(path.dirname(document.uri.fsPath)),
    filters: { Markdown: ['md'] },
    openLabel: message('ui.author.link'),
  });
  const target = selected?.[0];
  if (!target || target.scheme !== 'file') return;
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder || vscode.workspace.getWorkspaceFolder(target)?.uri.toString() !== folder.uri.toString() || target.toString() === document.uri.toString()) {
    void vscode.window.showErrorMessage(message('ui.author.same-workspace'));
    return;
  }
  const relative = path.relative(path.dirname(document.uri.fsPath), target.fsPath).split(path.sep).map(encodeURIComponent).join('/');
  const end = document.positionAt(document.getText().length);
  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, end, `\n\n[${message('ui.author.ideation')}](${relative})\n`);
  await vscode.workspace.applyEdit(edit);
}
