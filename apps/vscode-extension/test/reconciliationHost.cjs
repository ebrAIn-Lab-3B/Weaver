const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const vscode = require('vscode');
const { defaultProcess, placeIssue } = require('@ebrain-lab/weaver-markdown');
const { processStore } = require('../dist/processStore');
const { OverviewView } = require('../dist/overviewView');
const { renderOverviewHtml } = require('../dist/overviewHtml');

async function run() {
  try {
    const rules = defaultProcess().columns;
    rules.projection = { Backlog: 'Backlog' };
    processStore.init({ get: (_key, fallback) => fallback, update: async () => {} });
    processStore.has = () => true;
    processStore.rulesFor = () => rules;
    processStore.summary = (repository) => ({ repository, file: 'read', sources: { columns: 'repository', evidence: 'default', stale: 'default', task: 'default' }, process: { ...defaultProcess(), columns: rules } });
    processStore.diagnosisUnavailable = () => false;
    const store = { get: (_key, fallback) => fallback, update: async () => {} };
    const view = new OverviewView(store, {});
    view.registry = { kind: 'ok', registry: { version: 1, project: { owner: 'o', number: 1 }, repositories: [{ repository: 'o/r' }] } };
    view.phase = 'ready';
    view.read = { title: 'Test Board', statusOptions: ['Backlog', 'Todo'], membershipComplete: true, skipped: 0, cards: [{ repository: 'o/r', number: 1, title: 'Card', url: 'https://github.com/o/r/issues/1', state: 'open', labels: ['status:backlog'], assignees: [], boardStatus: 'Todo', placement: placeIssue({ state: 'open', labels: ['status:backlog'] }) }] };
    view.loaded = { artifacts: [], issues: [], uris: new Map(), documentLinks: new Map() };
    const state = view.state();
    assert.equal(state.kind, 'ready');
    assert(state.mismatches.some((m) => m.kind === 'board-status-differs' && m.args.expected === 'Backlog'));
    const html = renderOverviewHtml(state, 'nonce', 'test', 'ko');
    assert.match(html, /Backlog, Todo/);
    assert.match(html, /Backlog: status:backlog → Backlog/);
    assert.match(html, /Issue 라벨 status:backlog/);

    rules.source = 'board-status';
    const labels = ['status:backlog'];
    const noStatus = { ...view.read.cards[0], boardStatus: undefined, boardStatusRead: true, placement: placeIssue({ state: 'open', labels }, rules) };
    view.read.cards = [noStatus];
    const missingHtml = renderOverviewHtml(view.state(), 'nonce', 'test', 'ko');
    assert.match(missingHtml, /Issue 라벨: status:backlog; Project Status: 없음/);
    view.read.cards = [{ ...noStatus, boardStatusRead: false }];
    const unreadHtml = renderOverviewHtml(view.state(), 'nonce', 'test', 'ko');
    assert.match(unreadHtml, /Issue 라벨: status:backlog; Project Status: 조회하지 않음/);
    processStore.diagnosisUnavailable = () => true;
    const unavailable = view.state();
    assert(unavailable.skippedChecks.some((n) => n.code === 'cli.reconcile.process-unavailable'));
    assert(!unavailable.mismatches.some((m) => m.kind === 'board-status-differs'));
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'passed', vscode: vscode.version, case: 'overview rules and unavailable process (mock GitHub)' }));
  } catch (error) {
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'failed', error: String(error.stack || error) }));
    throw error;
  }
}
module.exports = { run };
