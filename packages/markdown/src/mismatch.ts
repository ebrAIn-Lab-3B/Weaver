import type { MessageArgs } from './i18n';
import { KANBAN_COLUMNS, type ColumnRules, type KanbanColumn, type KanbanPlacement } from './kanban';
import { defaultProcess } from './process';
import { normalizeIssueUrl, requirementsByIssue } from './overview';
import type { Artifact } from './types';
import { contractGaps, type ContractGapKind, type TaskContract } from './taskContract';

export type MismatchKind =
  | 'task-without-issue'
  | 'broken-issue-link'
  | 'issue-not-on-project'
  | 'issue-project-unknown'
  | 'card-without-file'
  | 'card-file-unknown'
  | 'merged-pr-not-linked'
  | 'board-status-differs'
  | 'shared-issue'
  | 'projection-unmapped'
  | 'board-status-missing'
  | 'pulls-incomplete'
  | 'status-source-needs-decision'
  | ContractGapKind;

/** One place where the repository files, the Issues, and the central Project do not agree. */
export interface Mismatch {
  kind: MismatchKind;
  /** The task, card, or pull request the mismatch is about, for ordering and display. */
  subject: string;
  /** Message arguments; the catalog key is `mismatch.<kind>`. */
  args: MessageArgs;
  /** Workspace-relative path of the file to open, when the mismatch is in a file. */
  path?: string;
  /** A GitHub page to open. */
  url?: string;
}

export interface MismatchCard {
  repository: string;
  number: number;
  title: string;
  url: string;
  taskId?: string;
  pullsIncomplete?: boolean;
  boardStatus?: string;
  /** True when Project Status was actually read, including an unset field. */
  boardStatusRead?: boolean;
  /** A closed Issue has nothing left to close, so a pull request that did not close it is not a mismatch. */
  state?: 'open' | 'closed';
  placement: KanbanPlacement;
  /** The labels of the Issue. Left out, they were not read and a label is not judged. */
  labels?: readonly string[];
  /** The Project fields that were read, by name (the `project-field` of a task contract). Left out, they were not read. */
  fields?: Record<string, string>;
}

export interface MergedPull {
  repository: string;
  number: number;
  title: string;
  url: string;
  branch: string;
  /** Issue numbers the pull request closes, as GitHub records them. */
  closes: number[];
  /** Closing references were truncated and cannot establish absence. */
  closingIncomplete?: boolean;
  /** Issues explicitly identified as partial work, not a closing claim. */
  partial?: number[];
}

/** The board Status each column folds into (DEC-003). */
const BOARD_STATUS: Record<KanbanColumn, string> = {
  Backlog: 'Todo',
  Ready: 'Todo',
  'In progress': 'In Progress',
  Blocked: 'In Progress',
  Review: 'In Progress',
  Verified: 'Done',
};

export function expectedBoardStatus(column: KanbanColumn): string {
  return BOARD_STATUS[column];
}

const ISSUE_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+$/i;

/**
 * Task IDs a pull request names: in its branch (`feat/task-033-...`) or in a trailing
 * `(TASK-033)` of its title. A task ID elsewhere in the title is only a mention.
 */
export function taskIdsOfPull(pull: Pick<MergedPull, 'title' | 'branch'>): string[] {
  const ids = new Set<string>();
  for (const match of pull.branch.matchAll(/(?:^|[\/_-])task-(\d{3,})(?=$|[\/_-])/gi)) ids.add(`TASK-${match[1]}`);
  const trailing = /\(((?:TASK-\d{3,})(?:\s*,\s*TASK-\d{3,})*)\)\s*$/.exec(pull.title);
  if (trailing) for (const id of trailing[1].match(/TASK-\d{3,}/g) ?? []) ids.add(id);
  return [...ids];
}

/** An explicit standalone marker for partial work. Code blocks and quotations are not declarations. */
export function partialIssuesOfPull(body: string | null | undefined): number[] {
  const result = new Set<number>();
  let fence: string | undefined;
  for (const line of (body ?? '').split(/\r?\n/)) {
    const boundary = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (boundary) {
      const mark = boundary[1];
      if (!fence) fence = mark;
      else if (mark[0] === fence[0] && mark.length >= fence.length) fence = undefined;
      continue;
    }
    if (fence) continue;
    const match = /^ {0,3}Partial:\s*#([1-9]\d*)\s*$/i.exec(line);
    if (match && Number.isSafeInteger(Number(match[1]))) result.add(Number(match[1]));
  }
  return [...result];
}

export interface MismatchInput {
  artifacts: readonly Artifact[];
  cards: readonly MismatchCard[];
  /** The registered repositories, `owner/name`. */
  repositories: readonly string[];
  /** False if Project membership cannot be determined from the read. */
  projectMembershipComplete?: boolean;
  /** False when malformed workspace artifacts prevent a reliable file inventory. */
  workspaceComplete?: boolean;
  /** Recently merged pull requests of the registered repositories; leave empty when they were not read. */
  pulls?: readonly MergedPull[];
  /** Repositories whose process takes the column from the board Status (DEC-015); the board cannot differ from itself. */
  boardSourced?: readonly string[];
  /** Repositories whose process does not honor an `evidence_exception` (DEC-015). */
  exceptionsIgnored?: readonly string[];
  /** Repositories whose process does not need a pull request that closes the Issue (DEC-015). */
  closingNotRequired?: readonly string[];
  /** The task contract of a repository's process (DEC-016); without one, tasks are not judged against a contract. */
  contractFor?: (repository: string) => TaskContract | undefined;
  /** Effective column rules for each repository. */
  rulesFor?: (repository: string) => ColumnRules | undefined;
}

/**
 * Finds where files, Issues, and the Project disagree. It only reports: nothing is changed.
 * A Project card can only be judged against files for repositories whose files are in the
 * workspace, so cards of other repositories are not reported as missing a file.
 */
export function findMismatches(input: MismatchInput): Mismatch[] {
  const { artifacts, cards, repositories } = input;
  const registered = new Set(repositories.map((name) => name.toLowerCase()));
  const boardSourced = new Set((input.boardSourced ?? []).map((name) => name.toLowerCase()));
  const exceptionsIgnored = new Set((input.exceptionsIgnored ?? []).map((name) => name.toLowerCase()));
  const closingNotRequired = new Set((input.closingNotRequired ?? []).map((name) => name.toLowerCase()));
  const found: Mismatch[] = [];
  const cardByUrl = new Map(cards.map((card) => [normalizeIssueUrl(card.url), card]));
  const links = requirementsByIssue(artifacts);

  // Repositories whose files are here: named by a requirement or task file's `repository`.
  const seen = new Set<string>();
  for (const artifact of artifacts) if (artifact.repository) seen.add(artifact.repository.toLowerCase());

  for (const artifact of artifacts) {
    if (artifact.kind !== 'task') continue;
    const repository = artifact.repository?.toLowerCase();
    if (repository && !registered.has(repository)) continue;
    const contract = repository ? input.contractFor?.(repository) : undefined;
    if (contract) {
      const card = artifact.issue ? cardByUrl.get(normalizeIssueUrl(artifact.issue)) : undefined;
      for (const gap of contractGaps(artifact.frontmatter, contract, card?.labels ? { labels: card.labels, ...(card.fields ? { fields: card.fields } : {}) } : undefined)) {
        found.push({ kind: gap.kind, subject: artifact.id, args: { task: artifact.id, ...gap.args }, path: artifact.path });
      }
    }
    if (!artifact.issue) {
      found.push({ kind: 'task-without-issue', subject: artifact.id, args: { task: artifact.id }, path: artifact.path });
    } else if (!ISSUE_URL.test(artifact.issue.trim())) {
      found.push({ kind: 'broken-issue-link', subject: artifact.id, args: { task: artifact.id, issue: artifact.issue }, path: artifact.path });
    } else if (!cardByUrl.has(normalizeIssueUrl(artifact.issue))) {
      const where = /github\.com\/([\w.-]+\/[\w.-]+)\//i.exec(artifact.issue)?.[1].toLowerCase();
      if (where && registered.has(where)) {
        found.push({ kind: input.projectMembershipComplete === false ? 'issue-project-unknown' : 'issue-not-on-project', subject: artifact.id, args: { task: artifact.id, issue: artifact.issue }, path: artifact.path, url: artifact.issue });
      }
    }
  }

  // A shared Issue may be intentional. Report the association for review, not as an invalid link.
  const shared = new Map<string, { url: string; tasks: string[] }>();
  for (const artifact of artifacts) {
    if (artifact.kind !== 'task' || !artifact.issue || !ISSUE_URL.test(artifact.issue.trim())) continue;
    const repository = artifact.repository?.toLowerCase();
    if (repository && !registered.has(repository)) continue;
    const key = normalizeIssueUrl(artifact.issue);
    const entry = shared.get(key) ?? { url: artifact.issue, tasks: [] };
    entry.tasks.push(artifact.id);
    shared.set(key, entry);
  }
  for (const entry of shared.values()) {
    if (entry.tasks.length > 1) found.push({ kind: 'shared-issue', subject: entry.tasks.join(', '), args: { tasks: entry.tasks.join(', '), issue: entry.url }, url: entry.url });
  }

  for (const card of cards) {
    const repository = card.repository.toLowerCase();
    const label = `#${card.number}`;
    if (card.pullsIncomplete) found.push({ kind: 'pulls-incomplete', subject: label, args: { repository: card.repository, number: card.number }, url: card.url });
    const statusGaps = card.placement.gaps.filter((gap) => ['gap.no-status-label', 'gap.multiple-status-labels', 'gap.no-board-status', 'gap.unmapped-board-status'].includes(gap.code));
    if (statusGaps.length) {
      const source = input.rulesFor?.(card.repository)?.source ?? (boardSourced.has(repository) ? 'board-status' : 'labels');
      found.push({ kind: 'status-source-needs-decision', subject: label, args: { repository: card.repository, number: card.number, source, observed: source === 'labels' ? (card.labels?.join(', ') || '—') : (card.boardStatus ?? '—'), labels: card.labels?.join(', ') || '—', board: card.boardStatus ?? '—' }, url: card.url });
    }
    // A repository whose process lets a card be an Issue with no file does not miss it (DEC-016 item 3).
    const filesNeeded = input.contractFor?.(repository)?.requireFile !== false;
    if (filesNeeded && seen.has(repository) && !links.has(normalizeIssueUrl(card.url))) {
      found.push({ kind: input.workspaceComplete === false ? 'card-file-unknown' : 'card-without-file', subject: label, args: { number: card.number, repository: card.repository, title: card.title }, url: card.url });
    }
    const rules = input.rulesFor?.(card.repository);
    // Closed Issues are displayed in Review, but the label may name a different column.
    const closedGap = card.placement.gaps.some((gap) => gap.code === 'gap.closed-without-verified');
    const labelRules = rules?.labels ?? defaultProcess().columns.labels;
    const labeledColumns = closedGap && card.labels ? KANBAN_COLUMNS.filter((column) => card.labels!.includes(labelRules[column])) : [];
    const actualColumn = closedGap ? (labeledColumns.length === 1 ? labeledColumns[0] : undefined) : card.placement.column;
    const comparableStatus = actualColumn !== undefined && card.placement.gaps.every((gap) => gap.code === 'gap.closed-without-verified');
    const observedLabel = actualColumn && card.labels?.includes(labelRules[actualColumn]) ? labelRules[actualColumn] : '—';
    const expected = actualColumn === undefined ? undefined : rules?.projection === undefined ? expectedBoardStatus(actualColumn) : rules.projection[actualColumn];
    if (!boardSourced.has(repository) && comparableStatus && !expected) {
      found.push({ kind: 'projection-unmapped', subject: label, args: { number: card.number, repository: card.repository, column: actualColumn!, label: observedLabel }, url: card.url });
    } else if (!boardSourced.has(repository) && comparableStatus && expected && card.boardStatusRead === true && !card.boardStatus) {
      found.push({ kind: 'board-status-missing', subject: label, args: { number: card.number, repository: card.repository, expected, label: observedLabel }, url: card.url });
    }
    if (expected && card.boardStatus && !boardSourced.has(repository) && comparableStatus && card.boardStatus !== expected) {
      found.push({
        kind: 'board-status-differs',
        subject: label,
        args: { number: card.number, repository: card.repository, board: card.boardStatus, expected, column: actualColumn!, label: observedLabel },
        url: card.url,
      });
    }
  }

  const exceptions = new Set<string>();
  for (const artifact of artifacts) {
    if (artifact.kind === 'task' && artifact.evidenceException && !exceptionsIgnored.has((artifact.repository ?? '').toLowerCase())) exceptions.add(artifact.id);
  }
  for (const pull of input.pulls ?? []) {
    // A `docs:` pull request usually writes or splits a task; it is not what implements it.
    if (/^docs(\([^)]*\))?!?:/i.test(pull.title.trim())) continue;
    for (const taskId of taskIdsOfPull(pull)) {
      if (exceptions.has(taskId)) continue;
      const card = cards.find((c) => c.taskId === taskId && c.repository.toLowerCase() === pull.repository.toLowerCase());
      if (card && !pull.closingIncomplete && card.state !== 'closed' && !pull.closes.includes(card.number) && !pull.partial?.includes(card.number) && !closingNotRequired.has(pull.repository.toLowerCase())) {
        found.push({
          kind: 'merged-pr-not-linked',
          subject: taskId,
          args: { pull: pull.number, task: taskId, number: card.number },
          url: pull.url,
        });
      }
    }
  }

  return found;
}
