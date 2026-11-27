import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findMismatches, formatNotice, loadWorkspace, parseProcess, placeIssue, type MismatchCard } from '../src';

const fixture = join(__dirname, 'examples', 'task-133');
const repository = 'fixture/example';
const files = readdirSync(fixture).filter((name) => /^(REQ|TASK)-\d+\.md$/.test(name))
  .map((path) => ({ path, text: readFileSync(join(fixture, path), 'utf8') }));
const artifacts = loadWorkspace(files).artifacts;
const rules = (name: string) => parseProcess(name, readFileSync(join(fixture, name), 'utf8')).process.columns;
const issue = (number: number, status: string, source = 'labels.yaml'): MismatchCard => {
  const columns = rules(source);
  const labels = ['status:backlog'];
  return {
    repository, number, title: `Issue ${number}`, url: `https://github.com/${repository}/issues/${number}`,
    labels, boardStatus: status, placement: placeIssue({ state: 'open', labels, boardStatus: status }, columns),
  };
};

describe('TASK-133 fixture scenarios', () => {
  it('distinguishes missing membership, missing and invalid links, and shared references', () => {
    const findings = findMismatches({ artifacts, cards: [issue(2, 'Backlog')], repositories: [repository], rulesFor: () => rules('labels.yaml') });
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'issue-not-on-project', subject: 'TASK-001' }),
      expect.objectContaining({ kind: 'task-without-issue', subject: 'TASK-004' }),
      expect.objectContaining({ kind: 'broken-issue-link', subject: 'TASK-005' }),
      expect.objectContaining({ kind: 'shared-issue', args: expect.objectContaining({ tasks: 'TASK-002, TASK-003' }) }),
    ]));
    expect(findings.filter((finding) => finding.kind === 'broken-issue-link')).toHaveLength(1);
  });

  it('reports unknown membership when the Project read is incomplete', () => {
    const findings = findMismatches({ artifacts, cards: [issue(2, 'Backlog')], repositories: [repository], projectMembershipComplete: false, rulesFor: () => rules('labels.yaml') });
    expect(findings).toContainEqual(expect.objectContaining({ kind: 'issue-project-unknown', subject: 'TASK-001' }));
    expect(findings).not.toContainEqual(expect.objectContaining({ kind: 'issue-not-on-project', subject: 'TASK-001' }));
  });

  it('treats Backlog and Todo as distinct under an explicit label projection', () => {
    const run = (status: string) => findMismatches({ artifacts, cards: [issue(2, status)], repositories: [repository], rulesFor: () => rules('labels.yaml') });
    expect(run('Backlog').some((finding) => finding.kind === 'board-status-differs')).toBe(false);
    expect(run('Todo')).toContainEqual(expect.objectContaining({ kind: 'board-status-differs', args: expect.objectContaining({ board: 'Todo', expected: 'Backlog' }) }));
    expect(run('Todo')).toEqual(run('Todo'));
  });

  it('uses the board as the source when configured', () => {
    const columns = rules('board-status.yaml');
    const card = issue(2, 'Todo', 'board-status.yaml');
    expect(card.placement.column).toBe('Ready');
    const findings = findMismatches({ artifacts, cards: [card], repositories: [repository], boardSourced: [repository], rulesFor: () => columns });
    expect(findings.some((finding) => finding.kind === 'board-status-differs')).toBe(false);
  });

  it('asks for a decision when the authoritative status is missing', () => {
    const noLabel = { ...issue(2, 'Backlog'), labels: [], placement: placeIssue({ state: 'open', labels: [] }, rules('labels.yaml')) };
    const labelFindings = findMismatches({ artifacts, cards: [noLabel], repositories: [repository], rulesFor: () => rules('labels.yaml') });
    expect(labelFindings).toContainEqual(expect.objectContaining({ kind: 'status-source-needs-decision', args: expect.objectContaining({ source: 'labels', labels: '—', board: 'Backlog' }) }));
    const { boardStatus: _unused, ...boardCard } = issue(2, 'Todo', 'board-status.yaml');
    const noBoard = { ...boardCard, placement: placeIssue({ state: 'open', labels: ['status:backlog'] }, rules('board-status.yaml')) };
    const boardFindings = findMismatches({ artifacts, cards: [noBoard], repositories: [repository], boardSourced: [repository], rulesFor: () => rules('board-status.yaml') });
    expect(boardFindings).toContainEqual(expect.objectContaining({ kind: 'status-source-needs-decision', args: expect.objectContaining({ source: 'board-status', labels: 'status:backlog', board: '—' }) }));
    const boardFinding = boardFindings.find((finding) => finding.kind === 'status-source-needs-decision')!;
    for (const locale of ['en', 'ko'] as const) {
      expect(formatNotice({ code: 'mismatch.status-source-needs-decision', args: boardFinding.args }, locale)).toContain('status:backlog');
    }
  });

  it('distinguishes unread values from a completed read with no value in both languages', () => {
    const columns = rules('board-status.yaml');
    const labels: string[] = [];
    const base = issue(2, 'Todo', 'board-status.yaml');
    const { boardStatus: _status, ...withoutStatus } = base;
    const placement = placeIssue({ state: 'open', labels }, columns);
    const finding = (card: MismatchCard) => findMismatches({ artifacts, cards: [card], repositories: [repository], boardSourced: [repository], rulesFor: () => columns }).find((item) => item.kind === 'status-source-needs-decision')!;
    const read = finding({ ...withoutStatus, labels, boardStatusRead: true, placement });
    const unread = finding({ ...withoutStatus, labels: undefined, boardStatusRead: false, placement });
    for (const [locale, none, unknown] of [['en', 'none', 'not read'], ['ko', '없음', '조회하지 않음']] as const) {
      const render = (item: typeof read) => formatNotice({ code: 'mismatch.status-source-needs-decision', args: item.args }, locale);
      expect(render(read)).toContain(none);
      expect(render(read)).not.toContain(unknown);
      expect(render(unread)).toContain(unknown);
    }
  });

  it('keeps a closed issue in review and reports incomplete PR evidence', () => {
    const labels = ['status:review'];
    const closed = {
      ...issue(2, 'In Progress'), state: 'closed' as const, labels, pullsIncomplete: true,
      placement: placeIssue({ state: 'closed', labels, boardStatus: 'In Progress' }, rules('labels.yaml')),
    };
    expect(closed.placement.column).toBe('Review');
    const findings = findMismatches({ artifacts, cards: [closed], repositories: [repository], rulesFor: () => rules('labels.yaml') });
    expect(findings).toContainEqual(expect.objectContaining({ kind: 'pulls-incomplete', subject: '#2' }));
  });

  it('reports missing Project status on a closed issue without inferring Verified', () => {
    const labels = ['status:review'];
    const { boardStatus: _unused, ...base } = issue(2, 'In Progress');
    const closed = { ...base, state: 'closed' as const, labels, boardStatusRead: true, placement: placeIssue({ state: 'closed', labels }, rules('labels.yaml')) };
    const findings = findMismatches({ artifacts, cards: [closed], repositories: [repository], rulesFor: () => rules('labels.yaml') });
    expect(closed.placement.column).toBe('Review');
    expect(findings).toContainEqual(expect.objectContaining({ kind: 'board-status-missing', args: expect.objectContaining({ expected: 'In Progress' }) }));
    const backlogLabels = ['status:backlog'];
    const backlog = { ...issue(2, 'Done'), state: 'closed' as const, labels: backlogLabels, placement: placeIssue({ state: 'closed', labels: backlogLabels, boardStatus: 'Done' }, rules('labels.yaml')) };
    expect(backlog.placement.column).toBe('Review');
    expect(findMismatches({ artifacts, cards: [backlog], repositories: [repository], rulesFor: () => rules('labels.yaml') }))
      .toContainEqual(expect.objectContaining({ kind: 'board-status-differs', args: expect.objectContaining({ column: 'Backlog', expected: 'Backlog' }) }));
  });
});
