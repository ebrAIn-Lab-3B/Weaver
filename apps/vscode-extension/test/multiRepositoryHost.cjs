const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');
const { createDocument } = require('../dist/authorDocument');

async function run() {
  try {
    const folders = vscode.workspace.workspaceFolders;
    assert.equal(folders.length, 2);
    const firstRoot = path.basename(folders[0].uri.fsPath) === 'nested' ? path.dirname(folders[0].uri.fsPath) : folders[0].uri.fsPath;
    const target = path.join(folders[1].uri.fsPath, 'created.md');
    const fields = ['Multi repository', 'Outcome', 'Criterion'];
    const errors = [];
    const ui = {
      showWorkspaceFolderPick: async () => folders[1],
      showInputBox: async () => fields.shift(),
      showSaveDialog: async () => vscode.Uri.file(target),
      showInformationMessage: async (_text, _options, choice) => choice,
      showErrorMessage: async text => { errors.push(text); },
    };
    await createDocument('requirement', ui);
    assert.match(await fs.readFile(target, 'utf8'), /id: REQ-008/);
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(firstRoot, 'legacy.md'), '---\nid: REQ-010\ntype: requirement\ntitle: Legacy\nstatus: draft\n---\n');
    await fs.unlink(target);
    fields.push('Another requirement', 'Outcome', 'Criterion');
    await createDocument('requirement', ui);
    assert.match(await fs.readFile(target, 'utf8'), /id: REQ-011/);
    assert.deepEqual(errors, []);
    const otherHistory = path.join(firstRoot, '.weaver', 'requirement-ids.txt');
    await fs.writeFile(otherHistory, '');
    fields.push('Blocked by invalid history', 'Outcome', 'Criterion');
    await createDocument('requirement', ui);
    assert.match(errors[0], /allocation history is incomplete or invalid/);
    assert.ok(errors[0].includes(otherHistory));
    assert.match(await fs.readFile(target, 'utf8'), /id: REQ-011/);
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'passed', vscode: vscode.version, case: 'multiple repositories and empty history' }));
  } catch (error) {
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'failed', error: String(error.stack || error) }));
    throw error;
  }
}
module.exports = { run };
