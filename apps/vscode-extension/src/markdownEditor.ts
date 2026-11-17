import * as vscode from 'vscode';
import * as path from 'path';
import { renderMarkdown } from './renderMarkdown';
import { message } from './locale';
import { escapeHtml } from './requirementHtml';

/** A read-only rendered surface; all edits go through VS Code's normal text document. */
export function attachMarkdownEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel, context: vscode.ExtensionContext): void {
  const localRoots = [context.extensionUri, vscode.Uri.joinPath(document.uri, '..'), ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri)];
  panel.webview.options = { enableScripts: true, localResourceRoots: localRoots };
  const render = (): void => {
    const script = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist', 'markdownPreview.js'));
    const nonce = `${Date.now()}${Math.random().toString(36).slice(2)}`;
    const body = renderMarkdown(document.getText(), (src) => {
      const uri = vscode.Uri.joinPath(document.uri, '..', decodeURIComponent(src.split(/[?#]/)[0]));
      return panel.webview.asWebviewUri(uri).toString();
    });
    panel.webview.html = `<!doctype html><html><head><meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} https: data:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${panel.webview.cspSource} data:;">
      <style>body{padding:20px 32px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family);line-height:1.6}button{color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;padding:6px 12px;cursor:pointer}img,svg{max-width:100%}pre{overflow:auto;padding:12px;background:var(--vscode-textCodeBlock-background)}table{border-collapse:collapse}th,td{border:1px solid var(--vscode-panel-border);padding:6px}a{color:var(--vscode-textLink-foreground)}[data-source-line]:hover{outline:1px solid var(--vscode-focusBorder)}</style>
      </head><body><button id="source">${escapeHtml(message('ui.markdown.source'))}</button><p>${escapeHtml(message('ui.markdown.edit-hint'))}</p><main>${body}</main>
      <script nonce="${nonce}" src="${script}"></script><script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      document.getElementById('source').addEventListener('click', () => vscode.postMessage({type:'source'}));
      document.querySelector('main').addEventListener('dblclick', event => { const block = event.target.closest('[data-source-line]'); if(block) vscode.postMessage({type:'edit', line:Number(block.dataset.sourceLine), end:Number(block.dataset.sourceEnd), blockType:block.dataset.sourceType, version:${document.version}}); });
      document.querySelector('main').addEventListener('click', event => { const link = event.target.closest('a'); if(link) { event.preventDefault(); vscode.postMessage({type:'link', href:link.getAttribute('href')}); } });
      </script></body></html>`;
  };
  const change = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.uri.toString() === document.uri.toString()) render();
  });
  const receive = panel.webview.onDidReceiveMessage(async (event: { type?: string; line?: number; end?: number; blockType?: string; version?: number; href?: string }) => {
    if (event.type === 'edit' && Number.isInteger(event.line) && event.line! >= 0 && event.line! < document.lineCount &&
        event.end === event.line! + 1 && (event.blockType === 'paragraph_open' || event.blockType === 'heading_open')) {
      if (event.version !== document.version) {
        void vscode.window.showWarningMessage(message('ui.markdown.edit-conflict'));
        return;
      }
      const original = document.lineAt(event.line!);
      const value = await vscode.window.showInputBox({ prompt: message('ui.markdown.edit-block'), value: original.text });
      if (value === undefined || value === original.text) return;
      if (event.version !== document.version) {
        void vscode.window.showWarningMessage(message('ui.markdown.edit-conflict'));
        return;
      }
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, original.range, value);
      if (!await vscode.workspace.applyEdit(edit)) void vscode.window.showErrorMessage(message('ui.markdown.edit-failed'));
    } else if (event.type === 'source' || event.type === 'edit') {
      await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default', { viewColumn: panel.viewColumn });
      if (Number.isInteger(event.line) && event.line! >= 0) {
        const editor = vscode.window.visibleTextEditors.find((item) => item.document.uri.toString() === document.uri.toString());
        if (editor) {
          const position = new vscode.Position(Math.min(event.line!, document.lineCount - 1), 0);
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(new vscode.Range(position, position));
        }
      }
    } else if (event.type === 'link' && typeof event.href === 'string') {
      try {
        if (/^https?:/i.test(event.href) || /^mailto:/i.test(event.href)) {
          await vscode.env.openExternal(vscode.Uri.parse(event.href));
        } else if (!/^[a-z][a-z0-9+.-]*:/i.test(event.href) && !event.href.startsWith('#')) {
          const target = decodeURIComponent(event.href.split('#')[0].split('?')[0]);
          const uri = vscode.Uri.file(path.resolve(path.dirname(document.uri.fsPath), target));
          await vscode.commands.executeCommand('vscode.open', uri);
        }
      } catch {
        void vscode.window.showErrorMessage(message('ui.markdown.link-error'));
      }
    }
  });
  panel.onDidDispose(() => { change.dispose(); receive.dispose(); });
  render();
}
