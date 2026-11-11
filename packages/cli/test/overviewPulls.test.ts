import { describe, expect, it } from 'vitest';
import { KANBAN_COLUMNS, type KanbanColumn, type Lane } from '@ebrain-lab/weaver-markdown';
import { renderOverviewHtml, type OverviewCard } from '../../../apps/vscode-extension/src/overviewHtml';

const card = (extra: Partial<OverviewCard> = {}): OverviewCard => ({
  repository: 'o/r',
  number: 7,
  title: '[TASK-007] Do the work',
  url: 'https://github.com/o/r/issues/7',
  assignees: [],
  placement: { column: 'Review', gaps: [] } as unknown as OverviewCard['placement'],
  stale: [],
  state: 'open',
  ...extra,
});

function html(cards: OverviewCard[], locale: 'en' | 'ko' = 'en'): string {
  const columns = Object.fromEntries(KANBAN_COLUMNS.map((c) => [c, [] as OverviewCard[]])) as Record<KanbanColumn, OverviewCard[]>;
  columns.Review.push(...cards);
  const lane: Lane<OverviewCard> = { repository: 'o/r', title: 'r', total: cards.length, blocked: 0, columns };
  return renderOverviewHtml(
    { kind: 'ready', projectTitle: 'Board', lanes: [lane], skipped: 0, hidden: [], collapsed: [], mismatches: [], skippedChecks: [], reading: [], focusActive: false, showFinished: false, finished: {} } as never,
    'nonce',
    'csp',
    locale,
  );
}

const pull = (number: number, state: 'open' | 'merged' | 'closed') => ({ number, url: `https://github.com/o/r/pull/${number}`, title: `PR ${number}`, state });

describe('the pull requests on a card (REQ-019, DEC-022)', () => {
  it('shows each as a link with its number and state, without a menu, open ones first', () => {
    const page = html([card({ pulls: [pull(9, 'open'), pull(8, 'merged')] })]);
    expect(page).toMatch(/<a class="pr pr-open" href="#" data-url="https:\/\/github.com\/o\/r\/pull\/9"[^>]*>PR #9 · open<\/a>/);
    expect(page).toMatch(/<a class="pr pr-merged" href="#" data-url="https:\/\/github.com\/o\/r\/pull\/8"[^>]*>PR #8 · merged<\/a>/);
    expect(page.indexOf('PR #9')).toBeLessThan(page.indexOf('PR #8'));
  });

  it('opens through the same message as every other link, which opens the page and follows it (DEC-020)', () => {
    const page = html([card({ pulls: [pull(9, 'open')] })]);
    // The click handler turns data-url into the message 'openUrl', which the Overview opens with openPage.
    expect(page).toContain("postMessage({ type: 'openUrl', url: target.dataset.url })");
  });

  it('can be reached by keyboard: it is a link in the page, not a script-only control', () => {
    const page = html([card({ pulls: [pull(9, 'open')] })]);
    expect(page).toContain('<a class="pr pr-open" href="#"');
  });

  it('says the state in Korean in a Korean page', () => {
    const page = html([card({ pulls: [pull(9, 'open'), pull(8, 'merged'), pull(7, 'closed')] })], 'ko');
    expect(page).toContain('PR #9 · 열림');
    expect(page).toContain('PR #8 · 병합됨');
    expect(page).toContain('PR #7 · 닫힘');
  });

  it('puts the title of the pull request and its state in the tooltip', () => {
    const page = html([card({ pulls: [pull(9, 'open')] })]);
    expect(page).toContain('title="Open pull request #9 (open): PR 9"');
  });

  it('shows nothing more on a card that no pull request refers to', () => {
    expect(html([card()])).not.toContain('class="pulls"');
    expect(html([card({ pulls: [] })])).not.toContain('class="pulls"');
  });

  it('escapes the title of a pull request', () => {
    const page = html([card({ pulls: [{ ...pull(9, 'open'), title: '<script>alert(1)</script>' }] })]);
    expect(page).not.toContain('<script>alert(1)</script>');
    expect(page).toContain('&lt;script&gt;');
  });
});

describe('which pull request closes the card, and the labels of a card (TASK-114)', () => {
  const closing = (number: number, state: 'open' | 'merged' | 'closed') => ({ ...pull(number, state), closes: true });

  it('marks the pull request that closes the Issue', () => {
    const page = html([card({ pulls: [closing(5, 'open'), pull(3, 'merged')] })]);
    expect(page).toMatch(/<a class="pr pr-open pr-closes"[^>]*>PR #5 · open · closes it<\/a>/);
    expect(page).toMatch(/<a class="pr pr-merged"[^>]*>PR #3 · merged<\/a>/);
    expect(page).not.toContain('no closing pull request yet');
  });

  it('says so in Korean', () => {
    const page = html([card({ pulls: [closing(5, 'merged')] })], 'ko');
    expect(page).toContain('PR #5 · 병합됨 · 닫는 PR');
  });

  const round = (extra: Partial<OverviewCard> = {}): OverviewCard => card({ title: 'Exploration round 1', ...extra });

  it('says that nothing closes an open card that names no task, whose pull requests only refer to it', () => {
    expect(html([round({ pulls: [pull(3, 'merged')] })])).toContain('no closing pull request yet');
    expect(html([round({ pulls: [pull(3, 'merged')] })], 'ko')).toContain('아직 닫는 PR 없음');
  });

  it('says nothing about it on a task card, which may be open on purpose', () => {
    expect(html([card({ taskId: 'TASK-007', pulls: [pull(3, 'merged')] })])).not.toContain('no closing pull request yet');
  });

  it('says nothing about it on a card with no pull request, or a closed card', () => {
    expect(html([card()])).not.toContain('no closing pull request yet');
    expect(html([round({ state: 'closed', pulls: [pull(3, 'merged')] })])).not.toContain('no closing pull request yet');
  });

  it('shows the labels other than the status labels, at most three', () => {
    const page = html([card({ labels: ['status:in-progress', 'explore', 'design', 'Status:review', 'ux', 'later'] })]);
    expect(page).toContain('<div class="labels"><span class="label-chip">explore</span><span class="label-chip">design</span><span class="label-chip">ux</span></div>');
    expect(page).not.toContain('label-chip">later');
    expect(page).not.toContain('label-chip">status:');
  });

  it('shows no label line when there are only status labels, and escapes a label', () => {
    expect(html([card({ labels: ['status:review'] })])).not.toContain('class="labels"');
    expect(html([card({ labels: ['<b>탐색</b>'] })])).toContain('<span class="label-chip">&lt;b&gt;탐색&lt;/b&gt;</span>');
  });
});
