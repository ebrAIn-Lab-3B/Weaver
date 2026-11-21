const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const vscode = require('vscode');
const { loadWorkspaceArtifacts } = require('../dist/workspace');
const { viewTargetOf } = require('@ebrain-lab/weaver-markdown');

async function run() {
  try {
    const loaded = await loadWorkspaceArtifacts();
    const requirements = loaded.artifacts.filter(a => a.kind === 'requirement');
    const tasks = loaded.artifacts.filter(a => a.kind === 'task');
    assert.equal(requirements.length, 2);
    assert.equal(tasks.length, 3);
    assert.notEqual(requirements[0].path, requirements[1].path);
    assert.equal(loaded.issues.some(i => i.code === 'duplicate-id' || i.code === 'unknown-requirement'), false);
    assert.deepEqual(requirements.map(r => r.repositoryServer).sort(), ['git.example:8443', 'git.example:9443']);
    for (const task of tasks.filter(t => t.id !== 'TASK-003')) {
      assert.equal(viewTargetOf(loaded.artifacts, task.path)?.requirement.sourceScope, task.sourceScope);
    }
    const cross = tasks.find(t => t.id === 'TASK-003');
    assert.equal(viewTargetOf(loaded.artifacts, cross.path)?.requirement.repositoryServer, 'git.example:8443');
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'passed', vscode: vscode.version, case: 'duplicate IDs and paths in separate local repositories' }));
  } catch (error) {
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'failed', error: String(error.stack || error) }));
    throw error;
  }
}
module.exports = { run };
