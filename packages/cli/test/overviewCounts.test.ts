import { describe, expect, it } from 'vitest';
import { buildLanes, defaultProcess, foldFinished, placeIssue } from '@ebrain-lab/weaver-markdown';
import { renderOverviewHtml, unfinishedCounts, type OverviewCard, type OverviewState } from '../../../apps/vscode-extension/src/overviewHtml';

const rules = defaultProcess().columns;
rules.source = 'board-status';
rules.board = { Queue: 'Backlog', Next: 'Ready', Working: 'In progress', Waiting: 'Blocked', Check: 'Review', Done: 'Verified' };
const makeCard = (number: number, boardStatus: string, state: 'open' | 'closed' = 'open'): OverviewCard => ({
  repository: 'o/r', number, title: `Card ${number}`, url: `https://github.com/o/r/issues/${number}`, assignees: [], stale: [], state,
  placement: placeIssue({ state, labels: [], boardStatus }, rules),
});
const registry = { version: 1 as const, project: { owner: 'o', number: 1 }, repositories: [{ repository: 'o/r' }, { repository: 'o/empty' }] };
const cards = [makeCard(1, 'Queue'), makeCard(2, 'Next'), makeCard(3, 'Working'), makeCard(4, 'Waiting'), makeCard(5, 'Check'), makeCard(6, 'Done'), makeCard(7, 'Queue', 'closed')];

describe('Overview unfinished repository counts', () => {
  it('uses derived columns and excludes Verified and closed cards even when gaps keep them visible', () => {
    const [lane, empty] = buildLanes(registry, cards);
    expect(unfinishedCounts(lane)).toEqual({ backlog: 1, active: 4, blocked: 1 });
    expect(unfinishedCounts(empty)).toEqual({ backlog: 0, active: 0, blocked: 0 });
    expect(unfinishedCounts(foldFinished(lane).lane)).toEqual(unfinishedCounts(lane));
    expect(lane.columns.Review.some((card) => card.number === 7)).toBe(true);
  });

  it('renders labelled counts on chips and lane headers in both languages', () => {
    const lanes = buildLanes(registry, cards);
    const state: OverviewState = { kind: 'ready', projectTitle: 'Board', lanes, skipped: 0, hidden: [], collapsed: [], mismatches: [], skippedChecks: [], reading: [], focusActive: false, showFinished: true, finished: {} };
    const en = renderOverviewHtml(state, 'nonce', 'csp', 'en');
    const ko = renderOverviewHtml(state, 'nonce', 'csp', 'ko');
    expect(en.match(/Backlog 1 · Active 4/g)).toHaveLength(2);
    expect(ko.match(/백로그 1 · 진행 단계 4/g)).toHaveLength(2);
    expect(en).toContain('1 blocked');
    expect(en).toContain('Card 7');
    expect(en).toContain('Backlog 0 · Active 0');
  });

  it('shows exact status options and source mappings in both languages', () => {
    const state: OverviewState = { kind: 'ready', projectTitle: 'Board', lanes: [], skipped: 0, hidden: [], collapsed: [], mismatches: [], skippedChecks: [], reading: [], focusActive: false, showFinished: false, finished: {}, statusOptions: ['Backlog', 'Todo'], processMappings: [{ repository: 'o/r', source: 'labels', origin: 'repository', mapping: 'Backlog → Backlog' }] };
    for (const locale of ['en', 'ko'] as const) {
      const html = renderOverviewHtml(state, 'nonce', 'csp', locale);
      expect(html).toContain('Backlog, Todo');
      expect(html).toContain('Backlog → Backlog');
      expect(html).toContain('labels');
      expect(html).toContain('o/r');
    }
  });

  it('does not say all checks are clean when a source could not be read', () => {
    const state: OverviewState = { kind: 'ready', projectTitle: 'Board', lanes: [], skipped: 0, hidden: [], collapsed: [], mismatches: [], skippedChecks: [{ code: 'project.membership-incomplete' }], reading: [], focusActive: false, showFinished: false, finished: {} };
    const html = renderOverviewHtml(state, 'nonce', 'csp', 'en');
    expect(html).toContain('other checks are unavailable');
    expect(html).not.toContain('No mismatches between files');
  });

  it('recomputes counts when the board changes and renders offline lanes', () => {
    const [lane] = buildLanes(registry, cards);
    const updated = buildLanes(registry, [...cards, makeCard(8, 'Queue')])[0];
    expect(unfinishedCounts(updated).backlog).toBe(2);
    const offline: OverviewState = { kind: 'error', error: { code: 'gap.no-status-label' } as never, offline: { lanes: [lane], collapsed: [] } };
    expect(renderOverviewHtml(offline, 'nonce', 'csp', 'en')).toContain('Backlog 1 · Active 4');
  });
});
