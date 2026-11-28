const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const vscode = require('vscode');
const githubPath = require.resolve('@ebrain-lab/weaver-github');
const github = { ...require(githubPath) };
require.cache[githubPath].exports = github;
const authPath = require.resolve('../dist/github');
const auth = { ...require(authPath), getGitHubToken: async () => 'test-token' };
require.cache[authPath].exports = auth;
const pagePath = require.resolve('../dist/openPage');
const opened = [];
const page = { ...require(pagePath), openPage: async (url) => opened.push(url) };
require.cache[pagePath].exports = page;
const { OverviewView } = require('../dist/overviewView');
const { t, placeIssue } = require('@ebrain-lab/weaver-markdown');

async function run() {
  try {
    const issueUrl = 'https://github.com/example/repo/issues/1';
    const pullUrl = 'https://github.com/example/repo/pull/2';
    const commentUrl = `${issueUrl}#issuecomment-3`;
    let calls = 0;
    github.fetchCompletionEvidence = async (_token, url) => {
      calls++;
      assert.equal(url, issueUrl);
      return { issueUrl, readAt: '2026-11-28T00:00:00Z', issue: { ok: true, issue: { state: 'closed' } }, pulls: { status: 'read', value: [{ number: 2, title: 'work', url: pullUrl, state: 'merged', checks: 'none', link: 'mentions', revision: 'new-head', statusContexts: { state: 'success', count: 1, apiUrl: 'https://api.github.com/repos/example/repo/commits/new-head/status' } }] }, reviews: [{ pullUrl, revision: 'new-head', observation: { status: 'read', value: [{ url: `${pullUrl}#pullrequestreview-4`, author: 'reviewer', state: 'APPROVED', revision: 'old-head', submittedAt: '2026-11-27T00:00:00Z', body: '' }] } }], comments: { status: 'read', value: [{ url: commentUrl, author: 'tester', body: 'Cannot reproduce prior test claim', createdAt: '2026-11-27T00:00:00Z', updatedAt: '2026-11-28T00:00:00Z' }] } };
    };
    const store = { get: (_key, fallback) => fallback, update: async () => {} };
    const view = new OverviewView(store, {});
    const card = { repository: 'example/repo', number: 1, title: 'Task', url: issueUrl, state: 'closed', labels: [], assignees: [], placement: placeIssue({ state: 'closed', labels: [] }) };
    view.read = { title: 'Board', cards: [card], skipped: 0 };
    view.loaded = { artifacts: [], uris: new Map(), issues: [] };
    for (const locale of ['en', 'ko']) {
      await vscode.workspace.getConfiguration('weaver').update('language', locale, vscode.ConfigurationTarget.Global);
      let menuItems, evidenceItems;
      view.choose = async (items, options) => {
        if (options.placeHolder === t('ui.overview.menu.placeholder', locale)) {
          menuItems = items;
          return items.find((item) => item.label.includes(t('ui.overview.menu.evidence', locale)));
        }
        evidenceItems = items;
        return items.find((item) => item.url === commentUrl);
      };
      await view.cardMenu(issueUrl);
      assert(menuItems.some((item) => item.label.includes(t('ui.overview.menu.evidence', locale))));
      assert(evidenceItems.some((item) => item.label.includes('PR #2') && item.detail.includes('new-head')));
      assert(evidenceItems.some((item) => item.label === t('ui.overview.evidence.status-contexts', locale, { state: t('ui.overview.evidence.status.success', locale) })));
      assert(evidenceItems.some((item) => item.detail?.includes('old-head') && item.detail.includes('new-head')));
      assert(evidenceItems.some((item) => item.label === t('ui.overview.evidence.claims-warning', locale)));
      assert(evidenceItems.some((item) => item.url === commentUrl && item.detail.includes('Cannot reproduce')));
      assert.equal(opened.at(-1), commentUrl);
    }
    assert.equal(calls, 2);
    github.fetchCompletionEvidence = async () => ({ issueUrl, readAt: '2026-11-28T00:00:00Z', issue: { ok: false, error: { code: 'github.err.network' } }, pulls: { status: 'unavailable', error: { code: 'github.err.evidence-incomplete' } }, reviews: null, comments: { status: 'unavailable', error: { code: 'github.err.network' } } });
    let unavailableItems;
    view.choose = async (items, options) => {
      if (options.placeHolder === t('ui.overview.menu.placeholder', 'ko')) return items.find((item) => item.label.includes(t('ui.overview.menu.evidence', 'ko')));
      unavailableItems = items;
      return undefined;
    };
    await view.cardMenu(issueUrl);
    assert(unavailableItems.some((item) => item.label === t('ui.overview.evidence.issue-unavailable', 'ko')));
    assert(unavailableItems.some((item) => item.label === t('ui.overview.evidence.pulls-unavailable', 'ko')));
    assert(unavailableItems.some((item) => item.label === t('ui.overview.evidence.comments-unavailable', 'ko')));
    assert(!unavailableItems.some((item) => item.label === t('ui.overview.evidence.no-reviews', 'ko')));
    github.fetchCompletionEvidence = async () => ({ issueUrl, readAt: '2026-11-28T00:00:00Z', issue: { ok: true, issue: { state: 'closed' } }, pulls: { status: 'read', value: [{ number: 2, title: 'work', url: pullUrl, state: 'merged', checks: 'unknown', checksError: { code: 'github.err.http', args: { status: 403 } }, link: 'mentions', revision: 'new-head', statusContexts: { state: 'none', apiUrl: 'https://api.github.com/repos/example/repo/commits/new-head/status' } }] }, reviews: [{ pullUrl, observation: { status: 'read', value: [] } }], comments: { status: 'read', value: [] } });
    await view.cardMenu(issueUrl);
    assert(unavailableItems.some((item) => item.label === t('ui.overview.evidence.checks-unavailable', 'ko')));
    assert(unavailableItems.some((item) => item.label.includes('PR #2')));
    assert(unavailableItems.some((item) => item.label === t('ui.overview.evidence.no-reviews', 'ko')));
    github.fetchCompletionEvidence = async () => ({ issueUrl, readAt: '2026-11-28T00:00:00Z', issue: { ok: true, issue: { state: 'closed' } }, pulls: { status: 'partial', value: [{ number: 2, title: 'work', url: pullUrl, state: 'merged', checks: 'none', link: 'mentions', revision: 'new-head' }], unavailable: [{ url: 'https://github.com/example/repo/pull/3', error: { code: 'github.err.http', args: { status: 403 } } }] }, reviews: [{ pullUrl, observation: { status: 'read', value: [] } }], comments: { status: 'read', value: [] } });
    await view.cardMenu(issueUrl);
    assert(unavailableItems.some((item) => item.label === t('ui.overview.evidence.pulls-unavailable', 'ko') && item.url === 'https://github.com/example/repo/pull/3'));
    assert(unavailableItems.some((item) => item.label.includes('PR #2')));
    assert(!unavailableItems.some((item) => item.label === t('ui.overview.evidence.no-pulls', 'ko')));
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'passed', vscode: vscode.version, case: 'Overview evidence menu and source links in English and Korean (mock GitHub)', realGitHubWrites: 0 }));
  } catch (error) {
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'failed', error: String(error.stack || error) }));
    throw error;
  }
}
module.exports = { run };
