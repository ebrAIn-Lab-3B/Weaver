const assert = require('node:assert/strict');
const { renderOverviewHtml } = require('../apps/vscode-extension/dist/overviewHtml');
const { KANBAN_COLUMNS } = require('@ebrain-lab/weaver-markdown');

function render(participants, locale = 'en', boardStatus = 'Ready <test>', projectFields) {
  const card = {
    repository: 'example/project', number: 1, title: 'Work', url: 'https://github.com/example/project/issues/1',
    assignees: ['other'], ...(boardStatus === null ? {} : { boardStatus }), placement: { column: 'Backlog', gaps: [] }, stale: [], participants, projectFields,
  };
  const columns = Object.fromEntries(KANBAN_COLUMNS.map((name) => [name, name === 'Backlog' ? [card] : []]));
  return renderOverviewHtml({ kind: 'ready', projectTitle: 'Board', lanes: [{ repository: card.repository, title: 'Project', total: 1, blocked: 0, columns }], skipped: 0, hidden: [], collapsed: [], mismatches: [], skippedChecks: [], reading: [], focusActive: false, showFinished: true, finished: {} }, 'nonce', 'source', locale);
}

const html = render({ path: 'tasks/one.md', assignee: '<agent>', kind: 'agent', reviewer: 'Mina' });
assert.match(html, /data-file="tasks\/one\.md"/);
assert.match(html, /Owner: &lt;agent&gt; \(agent\)/);
assert.match(html, /Reviewer: Mina/);
assert.match(html, /Issue assignees: @other/);
assert.match(html, /Project status: Ready &lt;test&gt;/);
assert.doesNotMatch(html, /Owner: <agent>/);
assert.match(render({ path: 'task.md', assignee: 'Mina' }), /Owner: Mina \(kind not recorded\)/);
assert.match(render({ path: 'task.md', assignee: 'Mina', kind: 'human' }, 'ko'), /담당자: Mina \(사람\)/);
assert.match(render(undefined, 'ko'), /Project 상태: Ready &lt;test&gt;/);
assert.doesNotMatch(render(undefined, 'en', null), /Project status:/);
const fields = render(undefined, 'en', null, { at: '2026-01-01T00:00:00Z', values: [{ name: 'Coordinator', value: '<agent>' }, { name: 'Waiting' }] });
assert.match(fields, /Project fields \(read 2026-01-01T00:00:00Z\)/);
assert.match(fields, /Coordinator: &lt;agent&gt;/);
assert.match(fields, /Waiting: not available or empty/);
assert.match(render(undefined, 'ko', null, { values: [] }), /Project 필드: 아직 확인할 수 없음/);
assert.match(render(undefined, 'en', null, { failed: true, values: [] }), /Project fields could not be read/);
assert.match(render(undefined, 'en', null, { invalid: true, values: [] }), /Project field configuration is invalid/);
assert.doesNotMatch(render(undefined), /Task file participants/);
console.log('Overview participant rendering passed');
