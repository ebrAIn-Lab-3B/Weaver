const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const Module = require('node:module');
const originalLoad = Module._load;
let scenario;
const taskUri = { scheme: 'file', fsPath: 'task.md', toString: () => 'task.md' };
const plan = { column: 'Ready', status: 'proposal', decider: 'owner', role: 'build', candidate: 'worker', kind: 'agent', label: 'work:worker', holder: 'worker', taskField: 'assignee', taskParticipant: 'worker' };
const issueUrl = 'https://github.com/example/repo/issues/1';
const base = { issueUrl, issueState: 'open', activeExecution: 'unknown', labels: ['ready'], assignees: [], conditionFields: { Type: 'feature' }, processVersion: 'p1', rosterVersion: 'r1', plan };
const vscode = {
  workspace: { textDocuments: [] },
  window: {
    showInputBox: async () => scenario.inputs.shift(),
    showWarningMessage: async (title, _options, choice) => { scenario.messages.push(title); return scenario.cancel ? undefined : choice; },
    showInformationMessage: async (message) => scenario.messages.push(message),
  },
};
const gh = {
  readFreshLocalRoster: async () => ({ version: 'local' }),
  readFreshEffectiveRoster: async () => ({ version: 'roster', contributors: [] }),
  readFreshTaskHolder: async () => scenario.task ?? ({ version: 'task', holder: 'worker' }),
  readAssignmentSnapshot: async (_token, _project, _url, context) => {
    if (!await context.readHolder() || !await context.readRoster(undefined)) return undefined;
    scenario.reads++;
    const current = scenario.snapshot ?? base;
    return scenario.changed && scenario.reads >= 3 ? { ...current, conditionFields: { Type: 'bug' } } : current;
  },
  writeProposalAction: async (_token, action) => { scenario.writes.push(action); if (scenario.failWrite) throw Error('connection lost'); },
};
Module._load = function(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === '@ebrain-lab/weaver-github') return gh;
  if (request === './rootConfig' && parent?.filename.endsWith('applyCardProposal.js')) return { workspaceStartFolder: () => 'workspace' };
  if (request === './userConfig' && parent?.filename.endsWith('applyCardProposal.js')) return { userConfigPath: () => 'config' };
  if (request === './github' && parent?.filename.endsWith('applyCardProposal.js')) return { getGitHubToken: async () => 'fake-token' };
  if (request === './locale' && parent?.filename.endsWith('applyCardProposal.js')) return { message: (key, args) => `${key}:${JSON.stringify(args ?? {})}` };
  return originalLoad.call(this, request, parent, main);
};
const { applyCardProposal } = require('../apps/vscode-extension/dist/applyCardProposal');
async function run() {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'weaver-proposal-host-'));
  const input = { issueUrl, taskId: 'TASK-001', taskUri, project: { owner: 'example', number: 1 }, displayed: plan, auditFolder: folder };
  scenario = { inputs: ['Alice', 'agent console'], messages: [], writes: [], reads: 0 };
  await applyCardProposal(input);
  assert.equal(scenario.writes.length, 1);
  assert.equal(scenario.reads, 3);
  const records = (await fs.readFile(path.join(folder, 'assignment-actions.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(records.map((item) => item.event), ['attempt', 'completed']);
  assert.equal(records[0].executionAttestation.actor, 'Alice');
  assert.equal(records[0].executionAttestation.source, 'agent console');
  assert.equal(records[0].action.label, 'work:worker');
  const reviewPlan = { ...plan, column: 'Review', candidate: 'reviewer', role: 'review', label: 'work:review', holder: 'builder', taskField: 'reviewer', taskParticipant: 'reviewer' };
  scenario = { inputs: ['Alice', 'agent console'], messages: [], writes: [], reads: 0, task: { version: 'task', holder: 'builder', reviewer: 'reviewer' }, snapshot: { ...base, plan: reviewPlan } };
  await applyCardProposal({ ...input, displayed: reviewPlan });
  assert.equal(scenario.writes.length, 1); assert.equal(scenario.writes[0].label, 'work:review');
  scenario = { inputs: ['Alice', 'agent console'], messages: [], writes: [], reads: 0, cancel: true };
  await applyCardProposal(input); assert.equal(scenario.writes.length, 0);
  scenario = { inputs: ['Alice', 'agent console'], messages: [], writes: [], reads: 0, changed: true };
  await applyCardProposal(input); assert.equal(scenario.writes.length, 0);
  scenario = { inputs: ['Alice', 'agent console'], messages: [], writes: [], reads: 0, failWrite: true };
  await applyCardProposal(input); assert.equal(scenario.writes.length, 1);
  const updated = (await fs.readFile(path.join(folder, 'assignment-actions.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(updated.slice(-2).map((item) => item.event), ['attempt', 'outcome-unknown']);
  assert.ok(scenario.messages.some((item) => item.startsWith('ui.assignment-apply-write-unknown')));
  const notFolder = path.join(folder, 'not-a-directory'); await fs.writeFile(notFolder, 'x');
  scenario = { inputs: ['Alice', 'agent console'], messages: [], writes: [], reads: 0 };
  await applyCardProposal({ ...input, auditFolder: notFolder }); assert.equal(scenario.writes.length, 0);
  scenario = { inputs: [], messages: [], writes: [], reads: 0 };
  await applyCardProposal({ ...input, displayed: { ...plan, taskField: 'reviewer', taskParticipant: 'other' } });
  assert.equal(scenario.writes.length, 0);
  scenario = { inputs: [], messages: [], writes: [], reads: 0 };
  vscode.workspace.textDocuments = [{ uri: taskUri, isDirty: true }];
  await applyCardProposal(input); assert.equal(scenario.writes.length, 0);
  scenario = { inputs: [], messages: [], writes: [], reads: 0 };
  vscode.workspace.textDocuments = [{ uri: { scheme: 'file', fsPath: 'config', toString: () => 'config' }, isDirty: true }];
  await applyCardProposal(input); assert.equal(scenario.writes.length, 0);
  console.log('Proposal host confirmation tests passed');
}
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { Module._load = originalLoad; });
