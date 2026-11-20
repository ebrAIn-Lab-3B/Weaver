// Exercise the rendered editor's queued save against a local disk conflict.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');
const { attachMarkdownEditor } = require('../dist/markdownEditor');

async function run() {
  try {
    const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const attach = document => {
      let receive;
      const panel = {
        active: true,
        webview: {
          options: {}, cspSource: 'test', html: '',
          asWebviewUri: uri => uri,
          onDidReceiveMessage: handler => { receive = handler; return { dispose() {} }; },
          postMessage: async () => true,
        },
        onDidDispose: () => ({ dispose() {} }),
      };
      attachMarkdownEditor(document, panel, { extensionUri: vscode.Uri.file(path.resolve(__dirname, '..')) });
      return receive;
    };
    const normalFile = path.join(root, 'normal.md');
    await fs.writeFile(normalFile, 'Normal\n');
    const normal = await vscode.workspace.openTextDocument(vscode.Uri.file(normalFile));
    await vscode.window.showTextDocument(normal, { preview: false });
    const normalEdit = new vscode.WorkspaceEdit();
    normalEdit.insert(normal.uri, new vscode.Position(0, 0), 'EDIT ');
    assert.equal(await vscode.workspace.applyEdit(normalEdit), true);
    await attach(normal)({ type: 'save' });
    assert.equal(await fs.readFile(normalFile, 'utf8'), 'EDIT Normal\n');
    assert.equal(normal.isDirty, false);

    const file = path.join(root, 'conflict.md');
    await fs.writeFile(file, 'Initial\n');
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    await vscode.window.showTextDocument(document, { preview: false });
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, new vscode.Position(0, 0), 'LOCAL ');
    assert.equal(await vscode.workspace.applyEdit(edit), true);
    assert.equal(document.isDirty, true);
    await fs.writeFile(file, 'EXTERNAL\n');
    const future = new Date(Date.now() + 3000);
    await fs.utimes(file, future, future);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await attach(document)({ type: 'save' });
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(await fs.readFile(file, 'utf8'), 'EXTERNAL\n');
    assert.equal(document.getText(), 'LOCAL Initial\n');
    assert.equal(document.isDirty, true);
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'passed', vscode: vscode.version, disk: 'external preserved', model: 'local preserved and dirty' }));
  } catch (error) {
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'failed', error: String(error.stack || error) }));
    throw error;
  }
}
module.exports = { run };
