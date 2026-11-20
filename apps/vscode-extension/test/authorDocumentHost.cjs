// Real VS Code workspace, filesystem and commands; dialogs are supplied by the test.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');
const { createDocument } = require('../dist/authorDocument');
const { withRequirementCreationLock } = require('../dist/requirementCreationLock');
const { parseArtifact, requirementDraft } = require('@ebrain-lab/weaver-markdown');

async function run() {
  try {
    const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
    let values, destination, review, errors;
    const ui = {
      showWorkspaceFolderPick: async () => undefined,
      showInputBox: async () => values.shift(),
      showSaveDialog: async () => vscode.Uri.file(path.join(root, destination)),
      showInformationMessage: async (_text, options, choice) => review(options, choice),
      showErrorMessage: async text => { errors.push(text); },
    };
    const reset = (target, confirm = async (_options, choice) => choice) => {
      values = ['Host title', 'Host outcome', 'Host criterion']; destination = target; review = confirm; errors = [];
    };
    reset('requirement.md');
    await createDocument('requirement', ui);
    const source = await fs.readFile(path.join(root, 'requirement.md'), 'utf8');
    assert.equal(parseArtifact('requirement.md', source).artifact.id, 'REQ-001');
    assert.deepEqual(errors, []);
    reset('cancelled.md', async () => undefined);
    await createDocument('requirement', ui);
    await assert.rejects(fs.stat(path.join(root, 'cancelled.md')), { code: 'ENOENT' });
    reset('requirement.md');
    await createDocument('requirement', ui);
    assert.equal(await fs.readFile(path.join(root, 'requirement.md'), 'utf8'), source);
    assert.equal(errors.length, 1);
    reset('stale.md', async (_options, choice) => {
      await fs.writeFile(path.join(root, 'other.md'), requirementDraft('REQ-004', 'Other', 'Outcome', 'Criterion'));
      return choice;
    });
    await createDocument('requirement', ui);
    await assert.rejects(fs.stat(path.join(root, 'stale.md')), { code: 'ENOENT' });
    assert.equal(errors.length, 1);
    reset('ideation.md');
    await createDocument('ideation', ui);
    assert.equal(await fs.readFile(path.join(root, 'ideation.md'), 'utf8'), '# Host title\n\n');
    reset('locked.md');
    await withRequirementCreationLock(async () => {
      await createDocument('requirement', ui);
      assert.equal(errors.length, 1);
      await assert.rejects(fs.stat(path.join(root, 'locked.md')), { code: 'ENOENT' });
    });
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'passed', vscode: vscode.version, cases: ['requirement', 'ideation', 'cancel', 'destination-collision', 'stale-id', 'locked-creator'] }));
  } catch (error) {
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'failed', error: String(error.stack || error) }));
    throw error;
  }
}
module.exports = { run };
