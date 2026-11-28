// Opt-in, read-only check of actual GitHub review records through the evidence menu.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const vscode = require('vscode');
const githubPath = require.resolve('@ebrain-lab/weaver-github');
const github = { ...require(githubPath) };
require.cache[githubPath].exports = github;
const authPath = require.resolve('../dist/github');
const auth = { ...require(authPath), getGitHubToken: async () => 'unused-by-fixture' };
require.cache[authPath].exports = auth;
const { OverviewView } = require('../dist/overviewView');
const { t, placeIssue } = require('@ebrain-lab/weaver-markdown');

async function run() {
  try {
    assert.equal(process.env.WEAVER_LIVE_CONFIRM_READ, '1');
    const pullUrl = 'https://github.com/microsoft/vscode/pull/350813';
    const token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', timeout: 15000, windowsHide: true }).trim();
    const reviews = await github.fetchPullReviews(token, pullUrl);
    assert.equal(reviews.status, 'read');
    const approved = reviews.value.find(review => review.state === 'APPROVED');
    const commented = reviews.value.find(review => review.state === 'COMMENTED');
    assert(approved && commented);
    const issueUrl = 'https://github.com/example/repo/issues/1';
    github.fetchCompletionEvidence = async () => ({ issueUrl, readAt: new Date().toISOString(), issue: { ok: true, issue: { state: 'closed' } }, pulls: { status: 'read', value: [] }, reviews: [{ pullUrl, observation: reviews }], comments: { status: 'read', value: [] } });
    const view = new OverviewView({ get: (_key, fallback) => fallback, update: async () => {} }, {});
    const card = { repository: 'example/repo', number: 1, title: 'Fixture', url: issueUrl, state: 'closed', labels: [], assignees: [], placement: placeIssue({ state: 'closed', labels: [] }) };
    view.read = { title: 'Fixture', cards: [card], skipped: 0 };
    view.loaded = { artifacts: [], uris: new Map(), issues: [] };
    for (const locale of ['en', 'ko']) {
      await vscode.workspace.getConfiguration('weaver').update('language', locale, vscode.ConfigurationTarget.Global);
      let observed;
      view.choose = async (items, options) => {
        if (options.placeHolder === t('ui.overview.menu.placeholder', locale)) return items.find(item => item.label.includes(t('ui.overview.menu.evidence', locale)));
        observed = items;
        return undefined;
      };
      await view.cardMenu(issueUrl);
      for (const [review, key] of [[approved, 'ui.overview.evidence.review-state.approved'], [commented, 'ui.overview.evidence.review-state.commented']]) {
        assert(observed.some(item => item.url === review.url && item.label === t('ui.overview.evidence.review', locale, { author: review.author ?? '—', state: t(key, locale) }) && item.detail.includes(review.revision ?? '—')));
      }
    }
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'passed', vscode: vscode.version, case: 'actual public review records rendered in a synthetic evidence view', realGitHubWrites: 0, reviewSource: pullUrl }));
  } catch (error) {
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'failed', error: String(error.stack || error) }));
    throw error;
  }
}
exports.run = run;
