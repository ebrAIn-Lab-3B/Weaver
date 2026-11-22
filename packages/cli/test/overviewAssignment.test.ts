import { describe, expect, it } from 'vitest';
import { KANBAN_COLUMNS, type KanbanColumn, type Lane, type NextAssigneePlan } from '@ebrain-lab/weaver-markdown';
import { renderOverviewHtml, type OverviewCard } from '../../../apps/vscode-extension/src/overviewHtml';

const proposal: NextAssigneePlan = { column: 'Review', status: 'proposal', decider: 'Coordinator', role: 'review', candidate: 'Reviewer', kind: 'agent', label: 'work:reviewer', taskField: 'reviewer', taskParticipant: 'Reviewer' };
const base: OverviewCard = { repository: 'example/repo', number: 1, title: 'Example', url: 'https://github.com/example/repo/issues/1', assignees: [], placement: { column: 'Review', gaps: [] } as OverviewCard['placement'], stale: [], state: 'open', nextAssignment: proposal };
function render(card: OverviewCard, locale: 'en' | 'ko' = 'en'): string {
  const columns = Object.fromEntries(KANBAN_COLUMNS.map((column) => [column, [] as OverviewCard[]])) as Record<KanbanColumn, OverviewCard[]>;
  columns.Review.push(card);
  const lane: Lane<OverviewCard> = { repository: card.repository, title: 'repo', total: 1, blocked: 0, columns };
  return renderOverviewHtml({ kind: 'ready', projectTitle: 'Board', lanes: [lane], skipped: 0, hidden: [], collapsed: [], mismatches: [], skippedChecks: [], reading: [], focusActive: false, showFinished: false, finished: {} }, 'nonce', 'csp', locale);
}

describe('confirmed assignment proposal on an Overview card', () => {
  it('shows the candidate and review button for an actionable open card in Korean', () => {
    const page = render(base, 'ko');
    expect(page).toContain('Reviewer');
    expect(page).toContain('data-apply-proposal="https://github.com/example/repo/issues/1"');
    expect(page).toContain('제안 적용 검토');
    expect(page).toContain("postMessage({ type: 'applyProposal', url: target.dataset.applyProposal })");
  });
  it('offers a human proposal only when its GitHub login is configured', () => {
    const human: NextAssigneePlan = { ...proposal, kind: 'human', label: undefined, issueAssignee: 'reviewer-login' };
    expect(render({ ...base, nextAssignment: human })).toContain('data-apply-proposal=');
    expect(render({ ...base, nextAssignment: { ...human, issueAssignee: undefined } })).not.toContain('data-apply-proposal=');
  });
  it('does not offer application for a non-matching condition, closed issue or offline card', () => {
    const condition: NextAssigneePlan = { column: 'Ready', status: 'condition-not-met', decider: 'Coordinator', field: 'Type' };
    for (const card of [{ ...base, nextAssignment: condition }, { ...base, state: 'closed' as const }, { ...base, fromFiles: true }]) {
      expect(render(card)).not.toContain('data-apply-proposal=');
    }
  });
  it('explains missing task participant configuration or action route without offering a write', () => {
    const withoutField: NextAssigneePlan = { ...proposal, taskField: undefined };
    const withoutReach: NextAssigneePlan = { ...proposal, label: undefined };
    const fieldPage = render({ ...base, nextAssignment: withoutField });
    const routePage = render({ ...base, nextAssignment: withoutReach });
    expect(fieldPage).toContain('Configure which task-file participant');
    expect(routePage).toContain('No actionable GitHub login or agent label');
    expect(fieldPage).not.toContain('data-apply-proposal=');
    expect(routePage).not.toContain('data-apply-proposal=');
  });
});
