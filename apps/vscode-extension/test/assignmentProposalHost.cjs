const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');
const githubPath = require.resolve('@ebrain-lab/weaver-github');
const github = { ...require(githubPath) };
require.cache[githubPath].exports = github;
const authPath = require.resolve('../dist/github');
const auth = { ...require(authPath), getGitHubToken: async () => 'test-token' };
require.cache[authPath].exports = auth;
const { applyCardProposal } = require('../dist/applyCardProposal');

async function run() {
  try {
    const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const taskPath = path.join(root, 'TASK-001.md');
    const issueUrl = 'https://github.com/example/repo/issues/1';
    const source = `---\nid: TASK-001\ntype: task\ntitle: Example\nrequirement: REQ-001\nissue: ${issueUrl}\nrepository: example/repo\nassignee: builder\nassignee_type: agent\nreviewer: reviewer\n---\n`;
    await fs.writeFile(taskPath, source, 'utf8');
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(taskPath));
    const plan = { column: 'Review', status: 'proposal', decider: 'coordinator', role: 'review', candidate: 'reviewer', kind: 'agent', label: 'work:reviewer', holder: 'builder', taskField: 'reviewer', taskParticipant: 'reviewer' };
    const snapshot = { issueUrl, issueState: 'open', activeExecution: 'unknown', labels: ['review'], assignees: [], conditionFields: {}, processVersion: 'p1', rosterVersion: 'r1', plan };
    let writes = [], reads = 0;
    github.readFreshLocalRoster = async () => ({ version: 'local' });
    github.readFreshEffectiveRoster = async () => ({ version: 'roster', contributors: [] });
    github.readAssignmentSnapshot = async (_token, _project, _url, context) => {
      const holder = await context.readHolder();
      if (!holder || !await context.readRoster(undefined)) return undefined;
      assert.equal(holder.holder, 'builder'); assert.equal(holder.reviewer, 'reviewer');
      reads++;
      return { ...snapshot, rosterVersion: holder.version };
    };
    github.writeProposalAction = async (_token, action) => { writes.push(action); };
    const input = { issueUrl, taskId: 'TASK-001', taskUri: doc.uri, project: { owner: 'example', number: 1 }, displayed: plan, auditFolder: path.join(root, 'audit') };
    const inputs = () => ['Human tester', 'test execution source'];
    let answers = inputs(), warnings = [], infos = [];
    let onWarning = async (_message, _options, choice) => choice;
    const ui = {
      showInputBox: async () => answers.shift(),
      showWarningMessage: async (...args) => { warnings.push(args[0]); return onWarning(...args); },
      showInformationMessage: async text => { infos.push(text); },
    };
    await applyCardProposal(input, ui);
    assert.equal(writes.length, 1); assert.equal(writes[0].label, 'work:reviewer'); assert.equal(reads, 3);
    assert.equal(warnings.length, 2); assert.equal(infos.length, 1);
    const logs = (await fs.readFile(path.join(root, 'audit', 'assignment-actions.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(logs.map(item => item.event), ['attempt', 'completed']);
    assert.equal(logs[0].executionAttestation.actor, 'Human tester');
    assert.equal(doc.isDirty, false); assert.equal(doc.getText(), source);

    writes = []; reads = 0; answers = inputs(); warnings = []; onWarning = async () => undefined;
    await applyCardProposal(input, ui); assert.equal(writes.length, 0); assert.equal(warnings.length, 1);

    writes = []; reads = 0; answers = inputs(); warnings = [];
    const edit = new vscode.WorkspaceEdit(); edit.insert(doc.uri, new vscode.Position(doc.lineCount, 0), '\nUnsaved change\n');
    assert.equal(await vscode.workspace.applyEdit(edit), true); assert.equal(doc.isDirty, true);
    await applyCardProposal(input, ui); assert.equal(writes.length, 0); assert.equal(warnings.length, 1);
    const restore = new vscode.WorkspaceEdit();
    restore.replace(doc.uri, new vscode.Range(new vscode.Position(0, 0), doc.positionAt(doc.getText().length)), source);
    assert.equal(await vscode.workspace.applyEdit(restore), true);
    await doc.save();
    const reopened = await vscode.workspace.openTextDocument(doc.uri);
    assert.equal(reopened.isDirty, false); assert.equal(reopened.getText(), source);

    writes = []; reads = 0; answers = inputs(); warnings = [];
    onWarning = async (_message, _options, choice) => {
      if (warnings.length === 2) {
        const concurrent = new vscode.WorkspaceEdit(); concurrent.insert(reopened.uri, new vscode.Position(reopened.lineCount, 0), '\nChanged during confirmation\n');
        assert.equal(await vscode.workspace.applyEdit(concurrent), true);
      }
      return choice;
    };
    await applyCardProposal(input, ui); assert.equal(writes.length, 0); assert.equal(reopened.isDirty, true);
    // A task can inherit its Issue link from the requirement; both documents must remain saved.
    const linkedTaskPath = path.join(root, 'TASK-002.md');
    const reqPath = path.join(root, 'REQ-002.md');
    const linkedTask = source.replace('TASK-001', 'TASK-002').replace('requirement: REQ-001', 'requirement: REQ-002').replace(`issue: ${issueUrl}\n`, 'status: draft\n');
    const requirement = `---\nid: REQ-002\ntype: requirement\ntitle: Example\nstatus: draft\nrepository: example/repo\n---\n\n## Tasks\n\n- \`TASK-002\` Work — [Issue #1](${issueUrl})\n`;
    await fs.writeFile(linkedTaskPath, linkedTask, 'utf8'); await fs.writeFile(reqPath, requirement, 'utf8');
    const linkedDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(linkedTaskPath));
    const reqDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(reqPath));
    const linkedInput = { ...input, taskId: 'TASK-002', taskUri: linkedDoc.uri, requirement: { id: 'REQ-002', uri: reqDoc.uri } };
    writes = []; reads = 0; answers = inputs(); warnings = []; onWarning = async (_message, _options, choice) => choice;
    await applyCardProposal(linkedInput, ui); assert.equal(writes.length, 1);
    writes = []; reads = 0; answers = inputs(); warnings = [];
    onWarning = async (_message, _options, choice) => {
      if (warnings.length === 2) {
        const concurrent = new vscode.WorkspaceEdit(); concurrent.insert(reqDoc.uri, new vscode.Position(reqDoc.lineCount, 0), '\nUnsaved requirement change\n');
        assert.equal(await vscode.workspace.applyEdit(concurrent), true);
      }
      return choice;
    };
    await applyCardProposal(linkedInput, ui); assert.equal(writes.length, 0); assert.equal(reqDoc.isDirty, true);
    const restoreRequirement = new vscode.WorkspaceEdit();
    restoreRequirement.replace(reqDoc.uri, new vscode.Range(new vscode.Position(0, 0), reqDoc.positionAt(reqDoc.getText().length)), requirement);
    assert.equal(await vscode.workspace.applyEdit(restoreRequirement), true); await reqDoc.save();
    writes = []; reads = 0; answers = inputs(); warnings = [];
    onWarning = async (_message, _options, choice) => {
      if (warnings.length === 2) {
        const concurrent = new vscode.WorkspaceEdit(); concurrent.insert(reqDoc.uri, new vscode.Position(reqDoc.lineCount, 0), '\nSaved requirement change\n');
        assert.equal(await vscode.workspace.applyEdit(concurrent), true); assert.equal(await reqDoc.save(), true);
      }
      return choice;
    };
    await applyCardProposal(linkedInput, ui); assert.equal(writes.length, 0); assert.equal(reqDoc.isDirty, false);
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'passed', vscode: vscode.version, cases: ['confirmed-mock-write', 'cancel', 'dirty-before', 'dirty-during-confirmation', 'requirement-link', 'requirement-dirty-during-confirmation', 'requirement-saved-during-confirmation'], realGitHubWrites: 0 }));
  } catch (error) {
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'failed', error: String(error.stack || error) }));
    throw error;
  }
}
module.exports = { run };
