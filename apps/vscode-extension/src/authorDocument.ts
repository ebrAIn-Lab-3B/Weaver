import * as vscode from 'vscode';
import * as path from 'path';
import { writeFile } from 'fs/promises';
import { ideationDraft, parseArtifact, requirementDraft } from '@ebrain-lab/weaver-markdown';
import { message } from './locale';

async function nextRequirementId(): Promise<string> {
  const files = await vscode.workspace.findFiles('**/*.md', '**/{node_modules,.git,dist,out}/**');
  let max = 0;
  for (const uri of files) {
    const open = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
    const text = open ? open.getText() : new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    const artifact = parseArtifact(uri.fsPath, text).artifact;
    if (artifact?.kind === 'requirement') {
      const match = /^REQ-(\d+)$/.exec(artifact.id);
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  return `REQ-${String(max + 1).padStart(3, '0')}`;
}

/** Human-authored files use the normal text editor and never require an external service. */
export async function createDocument(kind: 'ideation' | 'requirement'): Promise<void> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (!folders.length) {
    void vscode.window.showErrorMessage(message('ui.author.no-workspace'));
    return;
  }
  const folder = folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick();
  if (!folder) return;
  if (folder.uri.scheme !== 'file') {
    void vscode.window.showErrorMessage(message('ui.author.local-only'));
    return;
  }
  const title = await vscode.window.showInputBox({
    prompt: message('ui.author.title'),
    validateInput: (value) => value.trim() && !/[\r\n]/.test(value) ? undefined : message('ui.author.required'),
  });
  if (!title) return;
  let id = '';
  let criterion = '';
  let outcome = '';
  if (kind === 'requirement') {
    outcome = (await vscode.window.showInputBox({ prompt: message('ui.author.outcome'), validateInput: (v) => v.trim() ? undefined : message('ui.author.required') })) ?? '';
    if (!outcome) return;
    criterion = (await vscode.window.showInputBox({ prompt: message('ui.author.criterion'), validateInput: (v) => v.trim() ? undefined : message('ui.author.required') })) ?? '';
    if (!criterion) return;
    try {
      id = await nextRequirementId();
    } catch (error) {
      void vscode.window.showErrorMessage(message('ui.author.failed', { detail: error instanceof Error ? error.message : String(error) }));
      return;
    }
  }
  const suggested = kind === 'requirement' ? `${id}.md` : 'ideation.md';
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(folder.uri, suggested),
    filters: { Markdown: ['md'] },
    saveLabel: message('ui.author.choose'),
  });
  if (!target) return;
  const relative = path.relative(folder.uri.fsPath, target.fsPath);
  if (target.scheme !== 'file' || !relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !target.fsPath.toLowerCase().endsWith('.md')) {
    void vscode.window.showErrorMessage(message('ui.author.destination'));
    return;
  }
  const content = kind === 'requirement'
    ? requirementDraft(id, title, outcome, criterion)
    : ideationDraft(title);
  const confirm = message('ui.author.create');
  const choice = await vscode.window.showInformationMessage(message('ui.author.review', { path: target.fsPath }), { modal: true, detail: content }, confirm);
  if (choice !== confirm) return;
  try {
    if (kind === 'requirement' && await nextRequirementId() !== id) {
      void vscode.window.showErrorMessage(message('ui.author.id-changed'));
      return;
    }
    // Exclusive creation protects existing files, including a file created while the dialog was open.
    await writeFile(target.fsPath, content, { encoding: 'utf8', flag: 'wx' });
    if (kind === 'ideation') await vscode.commands.executeCommand('vscode.open', target);
    else await vscode.commands.executeCommand('vscode.openWith', target, 'default');
  } catch (error) {
    void vscode.window.showErrorMessage(message('ui.author.failed', { detail: error instanceof Error ? error.message : String(error) }));
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
