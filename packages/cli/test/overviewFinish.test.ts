import { describe, expect, it } from 'vitest';
import { KANBAN_COLUMNS, type KanbanColumn, type Lane } from '@ebrain-lab/weaver-markdown';
import { renderOverviewHtml, type OverviewCard } from '../../../apps/vscode-extension/src/overviewHtml';

const CLOSED_WITHOUT_VERIFIED = { code: 'gap.closed-without-verified' };

const card = (extra: Partial<OverviewCard> = {}): OverviewCard => ({
  repository: 'o/r',
  number: 270,
  title: '[TASK-098] Open the first link',
  url: 'https://github.com/o/r/issues/270',
  assignees: [],
  taskId: 'TASK-098',
  placement: { column: 'Review', gaps: [] } as unknown as OverviewCard['placement'],
  stale: [],
  state: 'closed',
  ...extra,
});

const withGap = (extra: Partial<OverviewCard> = {}): OverviewCard => card({ placement: { column: 'Review', gaps: [CLOSED_WITHOUT_VERIFIED] } as unknown as OverviewCard['placement'], ...extra });

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

const requirement = { id: 'REQ-018', title: 'T', path: 'docs/requirements/REQ-018.md', taskId: 'TASK-098' };
const pull = (number: number, state: 'open' | 'merged' | 'closed') => ({ number, url: `https://github.com/o/r/pull/${number}`, title: `PR ${number}`, state });

describe('the line of a card that has no task file (REQ-020, DEC-023 item 3)', () => {
  it('says that there is no task file in this folder and what to do, for a card that names a task', () => {
    const page = html([card()]);
    expect(page).toContain('No task file for TASK-098 in this folder. If it is merged on GitHub, update the folder (git pull).');
  });

  it('says it in Korean in a Korean page', () => {
    expect(html([card()], 'ko')).toContain('이 폴더에 TASK-098 작업 파일이 없습니다. GitHub에 병합되어 있다면 폴더를 최신으로 받으세요(git pull).');
  });

  it('says nothing when the card is joined to its requirement', () => {
    expect(html([card({ requirement })])).not.toContain('No task file');
  });

  it('says nothing for a plain Issue, which names no task', () => {
    expect(html([card({ taskId: undefined, title: 'A plain Issue' })])).not.toContain('No task file');
  });

  it('says nothing for a card that was built from the files', () => {
    expect(html([card({ fromFiles: true })])).not.toContain('No task file');
  });
});

describe('the button "Mark verified" on a card (REQ-020, DEC-023 item 1)', () => {
  it('is on a card whose Issue is closed and that has the gap, with no requirement needed', () => {
    const page = html([withGap()]);
    expect(page).toMatch(/<button class="mark-verified" data-mark-verified="https:\/\/github.com\/o\/r\/issues\/270"[^>]*>Mark verified<\/button>/);
  });

  it('says so in Korean, and the tooltip says that it asks before it writes', () => {
    const page = html([withGap()], 'ko');
    expect(page).toContain('>검증됨으로 표시</button>');
    expect(page).toContain('title="TASK-098을(를) 검증됨으로 표시합니다. 바뀔 내용을 보여 주고, 쓰기 전에 묻습니다"');
  });

  it('names a plain Issue by its number in the tooltip', () => {
    const page = html([withGap({ taskId: undefined, title: 'A plain Issue' })]);
    expect(page).toContain('title="Mark #270 Verified: shows what changes and asks before it writes"');
  });

  it('is also on a card that has a requirement', () => {
    expect(html([withGap({ requirement })])).toContain('data-mark-verified=');
  });

  it('is not on a card whose pull request is still open, because its work is not over', () => {
    expect(html([withGap({ pulls: [pull(271, 'open'), pull(268, 'merged')] })])).not.toContain('data-mark-verified=');
  });

  it('is on a card whose pull requests are all merged or closed', () => {
    expect(html([withGap({ pulls: [pull(271, 'merged'), pull(268, 'closed')] })])).toContain('data-mark-verified=');
  });

  it('is not on a card without that gap, or with another gap', () => {
    expect(html([card()])).not.toContain('data-mark-verified=');
    const other = card({ placement: { column: 'Backlog', gaps: [{ code: 'gap.no-status-label' }] } as unknown as OverviewCard['placement'], state: 'open' });
    expect(html([other])).not.toContain('data-mark-verified=');
  });

  it('is not on a card built from the files, which has no Issue to change', () => {
    expect(html([withGap({ fromFiles: true })])).not.toContain('data-mark-verified=');
  });

  it('sends the card to the extension as a message, which asks and writes only after a yes', () => {
    expect(html([withGap()])).toContain("postMessage({ type: 'markVerified', url: target.dataset.markVerified })");
  });

  it('can be reached by keyboard: it is a button of the page', () => {
    expect(html([withGap()])).toContain('<button class="mark-verified"');
  });
});

describe('where the missing task file is, and what the card offers (DEC-024 items 1 and 2)', () => {
  it('says the folder is behind and offers to update it when the file is on GitHub', () => {
    const page = html([card({ taskFile: 'on-github' })]);
    expect(page).toContain('TASK-098 is on GitHub, and this folder is behind.');
    expect(page).toMatch(/data-update-folder="https:\/\/github.com\/o\/r\/issues\/270"[^>]*>Update the folder<\/button>/);
    expect(page).not.toContain('data-make-task-file="');
  });

  it('says there is no task file anywhere and offers to make it when GitHub does not have it', () => {
    const page = html([card({ taskFile: 'absent' })]);
    expect(page).toContain('There is no task file for TASK-098 on GitHub.');
    expect(page).toMatch(/data-make-task-file="https:\/\/github.com\/o\/r\/issues\/270"[^>]*>Make the task file<\/button>/);
    expect(page).not.toContain('data-update-folder="');
  });

  it('keeps the plain line, with no button, while GitHub has not answered', () => {
    const page = html([card()]);
    expect(page).toContain('No task file for TASK-098 in this folder.');
    expect(page).not.toContain('data-update-folder="');
    expect(page).not.toContain('data-make-task-file="');
  });

  it('offers nothing on a card that is joined to its requirement', () => {
    const page = html([card({ requirement, taskFile: 'absent' })]);
    expect(page).not.toContain('data-make-task-file="');
  });

  it('says it in Korean, and the page sends both messages when a button is clicked', () => {
    const page = html([card({ taskFile: 'absent' })], 'ko');
    expect(page).toContain('GitHub에도 TASK-098 작업 파일이 없습니다.');
    expect(page).toContain("type: 'makeTaskFile'");
    expect(page).toContain("type: 'updateFolder'");
  });
});
