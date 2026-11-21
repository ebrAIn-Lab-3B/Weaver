const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const vscode = require('vscode');
const { parseArtifact } = require('@ebrain-lab/weaver-markdown');
const githubPath = require.resolve('../dist/github');
const github = { ...require(githubPath) };
require.cache[githubPath].exports = github;
const { processStore } = require('../dist/processStore');
const configRoster = require('../dist/configRoster');
const { RequirementView } = require('../dist/requirementView');

async function run() {
  try {
    const calls = [];
    github.getStatusToken = async interactive => { calls.push(interactive); return 'test-token'; };
    github.fetchIssue = async (_token, url) => ({ ok: true, issue: { number: 36, title: 'Example', url, state: 'open', labels: ['status:ready'], assignees: [] } });
    github.fetchEvidence = async () => ({ ok: true, evidence: { pulls: [] } });
    github.fetchBoardItems = async () => [];
    processStore.refresh = async () => false;
    configRoster.readConfigRoster = async () => undefined;
    const requirement = parseArtifact('req.md', '---\nid: REQ-001\ntype: requirement\ntitle: Example\nstatus: draft\n---\n\n## Tasks\n\n- `TASK-013` Example — [GitHub Issue #36](https://github.com/example/repo/issues/36)\n').artifact;
    assert.equal(requirement.kind, 'requirement');
    const panel = { webview: { html: '', cspSource: 'test', onDidReceiveMessage() {} }, onDidDispose() {} };
    const loaded = { artifacts: [requirement], issues: [], uris: new Map(), documentLinks: new Map() };
    new RequirementView().attach(panel, loaded, requirement);
    for (let i = 0; i < 100 && !panel.webview.html.includes('data-move="TASK-013"'); i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(calls, [false]);
    assert.match(panel.webview.html, /select data-move="TASK-013"/);
    assert.match(panel.webview.html, /value="Ready" selected/);
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'passed', vscode: vscode.version, case: 'automatic issue read renders status selector (mock GitHub)' }));
  } catch (error) {
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'failed', error: String(error.stack || error) }));
    throw error;
  }
}
module.exports = { run };
