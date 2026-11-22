import { describe, expect, it } from 'vitest';
import { KANBAN_COLUMNS, type KanbanColumn, type Lane } from '@ebrain-lab/weaver-markdown';
import { renderOverviewHtml, type OverviewCard } from '../../../apps/vscode-extension/src/overviewHtml';

const base: OverviewCard = { repository: 'example/repo', number: 1, title: 'Example', url: 'https://github.com/example/repo/issues/1', assignees: [], placement: { column: 'Blocked', gaps: [] } as OverviewCard['placement'], stale: [{ code: 'stale.needs-decision' }], state: 'open', requirement: { id: 'REQ-001', title: 'Example', path: 'req.md', taskId: 'TASK-001', taskPath: 'docs/task & one.md' } };
function render(card: OverviewCard, locale: 'en' | 'ko' = 'en'): string {
  const columns = Object.fromEntries(KANBAN_COLUMNS.map(column => [column, [] as OverviewCard[]])) as Record<KanbanColumn, OverviewCard[]>;
  columns.Blocked.push(card);
  const lane: Lane<OverviewCard> = { repository: card.repository, title: 'repo', total: 1, blocked: 1, columns };
  return renderOverviewHtml({ kind: 'ready', projectTitle: 'Board', lanes: [lane], skipped: 0, hidden: [], collapsed: [], mismatches: [], skippedChecks: [], reading: [], focusActive: false, showFinished: false, finished: {} }, 'nonce', 'csp', locale);
}

describe('explicit decision wait source', () => {
  it('links the wait to the escaped task path, including when no participant is recorded', () => {
    const page = render(base);
    expect(page).toContain('data-file="docs/task &amp; one.md" class="stale-chip needs-decision">waiting for a human decision</a>');
    expect(page).toContain("postMessage({ type: 'openFile', path: target.dataset.file })");
    expect(render(base, 'ko')).toContain('사람의 결정을 기다림</a>');
  });
  it('keeps a notice without a linked task as plain text, and does not link other notices', () => {
    const withoutTask = render({ ...base, requirement: undefined });
    expect(withoutTask).toContain('<span class="stale-chip needs-decision">waiting for a human decision</span>');
    expect(withoutTask).not.toContain('data-file=');
    const other = render({ ...base, stale: [{ code: 'stale.no-evidence' }] });
    expect(other).not.toContain('data-file=');
  });
});
