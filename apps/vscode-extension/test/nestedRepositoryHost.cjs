// A real VS Code workspace nested inside a repository sees its parent IDs.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');
const { createDocument } = require('../dist/authorDocument');

async function run() {
  try {
    const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const values = ['Nested', 'Outcome', 'Criterion'];
    const errors = [];
    let preview, review;
    const ui = {
      showInputBox: async () => values.shift(),
      showSaveDialog: async () => vscode.Uri.file(path.join(root, 'child.md')),
      showInformationMessage: async (text, options, choice) => { review = text; preview = options.detail; return choice; },
      showErrorMessage: async text => { errors.push(text); },
    };
    await createDocument('requirement', ui);
    assert.match(preview, /id: REQ-002/);
    assert.ok(review.includes(path.join(path.dirname(root), '.weaver', 'requirement-ids.txt')));
    assert.match(review, /even if creation fails/);
    assert.match(await fs.readFile(path.join(root, 'child.md'), 'utf8'), /id: REQ-002/);
    assert.deepEqual(errors, []);
    await fs.unlink(path.join(root, 'child.md'));
    values.push('After deletion', 'Outcome', 'Criterion');
    await createDocument('requirement', ui);
    assert.match(preview, /id: REQ-003/);
    assert.match(await fs.readFile(path.join(root, 'child.md'), 'utf8'), /id: REQ-003/);
    assert.deepEqual(errors, []);
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'passed', vscode: vscode.version, case: 'nested repository and deleted ID' }));
  } catch (error) {
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'failed', error: String(error.stack || error) }));
    throw error;
  }
}
module.exports = { run };
