// Run by VS Code's --extensionTestsPath against its actual document model.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vscode = require('vscode');
const { submitDocumentEdit } = require('../dist/submitDocumentEdit');

async function run() {
  try {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'weaver-race-document-'));
    const cases = [
      ['inline', 'Original text\n', [0, 0, 0, 8], 'Weaver'],
      ['insert', 'Original text\n', [0, 0, 0, 0], 'Weaver\n\n'],
      ['split', 'Original text\n', [0, 0, 0, 13], 'Original\n\ntext'],
      ['fence', '```js\noriginal\n```\n', [1, 0, 1, 8], 'changed'],
      ['checklist', '- [ ] task\n', [0, 0, 0, 5], '- [x]'],
    ];
    for (const [name, source, positions, replacement] of cases) {
      const file = path.join(directory, name + '.md');
      fs.writeFileSync(file, source);
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      const version = document.version;
      const competing = new vscode.WorkspaceEdit();
      competing.insert(document.uri, new vscode.Position(0, 0), 'External ');
      const rendered = new vscode.WorkspaceEdit();
      rendered.replace(document.uri, new vscode.Range(...positions), replacement);
      let competingResult, submissionVersion;
      const renderedResult = submitDocumentEdit(document, version, () => {
        // Queue the competing change after Weaver's check, before its application.
        competingResult = vscode.workspace.applyEdit(competing);
        submissionVersion = document.version;
        return vscode.workspace.applyEdit(rendered);
      });
      assert.equal(submissionVersion, version, `${name}: both requests must use the initial model version`);
      assert.equal(await competingResult, true, `${name}: competing edit must apply`);
      assert.equal(await renderedResult, false, `${name}: stale rendered edit must be refused`);
      assert.equal(document.getText(), 'External ' + source, `${name}: competing document must remain intact`);
    }
    fs.writeFileSync(process.env.WEAVER_RACE_RESULT, JSON.stringify({ status: 'passed', vscode: vscode.version, cases: cases.map(item => item[0]) }));
  } catch (error) {
    fs.writeFileSync(process.env.WEAVER_RACE_RESULT, JSON.stringify({ status: 'failed', vscode: vscode.version, error: String(error.stack || error) }));
    throw error;
  }
}
module.exports = { run };
