import {
  Artifact,
  ColumnRules,
  EvidenceRules,
  findMismatches,
  TaskContract,
  formatNotice,
  Locale,
  MergedPull,
  MessageKey,
  normalizeIssueUrl,
  parseIssueUrl,
  requirementForTask,
  TaskArtifact,
  planMove,
  Mismatch,
  KANBAN_COLUMNS,
  PROJECT_STATUS_FOR_COLUMN,
} from '@ebrain-lab/weaver-markdown';
import { addIssueComment, hasIssueComment, fetchIssue, readProject, setProjectField, NoticeError, type Fetch, type FetchFn, type ProjectCard } from '@ebrain-lab/weaver-github';
import { attribution, PlannedAction, ReportItem } from './actions';
import { cardNotices } from './cards';
import { FilesContext, planDraftTask, planLinkIssue } from './reconcileFiles';
import { planProjectAdd } from './projectAdd';

/** Compare only options explicitly covered by the projection; ambiguous order stays report-only. */
function boardBehind(current: string, expected: string, rules: ColumnRules | undefined): boolean {
  const projection = rules?.projection ?? PROJECT_STATUS_FOR_COLUMN;
  const currentRanks = KANBAN_COLUMNS.flatMap((column, index) => projection[column] === current ? [index] : []);
  const expectedRanks = KANBAN_COLUMNS.flatMap((column, index) => projection[column] === expected ? [index] : []);
  return currentRanks.length > 0 && expectedRanks.length > 0 && Math.max(...currentRanks) < Math.min(...expectedRanks);
}

export interface ReconcileInput {
  token: string;
  login: string | undefined;
  locale: Locale;
  project: { owner: string; number: number };
  repositories: readonly string[];
  cards: readonly ProjectCard[];
  statusOptions?: readonly string[];
  projectMembershipComplete?: boolean;
  workspaceComplete?: boolean;
  /** Repositories whose process could not be read or validated. */
  unavailableRepositories?: readonly string[];
  artifacts: readonly Artifact[];
  pulls: readonly MergedPull[];
  /** The column rules of a repository's process (DEC-015); the defaults when it has none. */
  rulesFor?: (repository: string) => ColumnRules | undefined;
  idleDaysFor?: (repository: string) => number;
  evidenceFor?: (repository: string) => EvidenceRules | undefined;
  /** The task contract of a repository's process (DEC-016); a task is judged against it, a card with no file is allowed when it says so. */
  contractFor?: (repository: string) => TaskContract | undefined;
  /** What the two fixes that change repository files need; without it they stay reports. */
  files?: FilesContext;
  /** Re-read effective rules immediately before a status write; unavailable means writes fail closed. */
  freshRulesFor?: (repository: string) => Promise<ColumnRules | undefined>;
  /** Check that the selected Project and repository scope have not changed. */
  freshSetupMatches?: () => Promise<boolean>;
  /** Re-read the task file link before adding an Issue to the selected Project. */
  freshTaskIssue?: (path: string) => Promise<string | undefined>;
  now: Date;
  fetch?: Fetch;
  fetchFn?: FetchFn;
}

export interface ReconcilePlan {
  actions: PlannedAction[];
  reports: ReportItem[];
}

/**
 * Turns what REQ-006 reports into the three tiers of REQ-007 (the rule table is in DEC-012):
 * - an *automatic* fix is a fact that is easy to undo (an Issue added to the Project);
 * - a *proposed* fix changes a card's meaning or leaves a note, and is shown for approval (a board Status
 *   that is behind its label is brought up to it; one that is ahead is reported);
 * - everything else is *reported* for a person.
 * Every action still goes through the one-at-a-time confirmation of DEC-008. Nothing here closes an
 * Issue, commits to a default branch, or marks work verified on its own.
 */
export async function planReconcile(input: ReconcileInput): Promise<ReconcilePlan> {
  const { locale } = input;
  const actions: PlannedAction[] = [];
  const reports: ReportItem[] = [];
  const message = (m: Mismatch): string => formatNotice({ code: `mismatch.${m.kind}` as MessageKey, args: m.args }, locale);
  const byUrl = new Map(input.cards.map((card) => [normalizeIssueUrl(card.url), card]));
  const unavailable = new Set((input.unavailableRepositories ?? []).map((name) => name.toLowerCase()));
  const checkedRepositories = input.repositories.filter((name) => !unavailable.has(name.toLowerCase()));
  const checkedCards = input.cards.filter((card) => !unavailable.has(card.repository.toLowerCase()));
  for (const repository of input.unavailableRepositories ?? []) reports.push({ tier: 'report', kind: 'process-unavailable', subject: repository, message: formatNotice({ code: 'cli.reconcile.process-unavailable', args: { repository } }, locale), automated: false });
  if (input.workspaceComplete === false) reports.push({ tier: 'report', kind: 'workspace-invalid', subject: 'workspace', message: formatNotice({ code: 'cli.reconcile.recheck-artifact-invalid' }, locale), automated: false });
  const onProject = checkedCards.map((card) => card.url);
  const plannedProjectAdds = new Set<string>();
  const repositoryScope = [...new Set(input.repositories.map((name) => name.toLowerCase()))].sort();

  for (const m of findMismatches({
    artifacts: input.artifacts,
    cards: checkedCards,
    projectMembershipComplete: input.projectMembershipComplete,
    workspaceComplete: input.workspaceComplete,
    rulesFor: input.rulesFor,
    repositories: checkedRepositories,
    pulls: input.pulls,
    boardSourced: input.repositories.filter((name) => input.rulesFor?.(name)?.source === 'board-status'),
    exceptionsIgnored: input.repositories.filter((name) => input.evidenceFor?.(name)?.exceptions === false),
    closingNotRequired: input.repositories.filter((name) => input.evidenceFor?.(name)?.closingPullRequest === false),
    ...(input.contractFor ? { contractFor: input.contractFor } : {}),
  })) {
    const item = (tier: ReportItem['tier'], automated: boolean): ReportItem => ({
      tier,
      kind: m.kind,
      subject: m.subject,
      message: message(m),
      automated,
      ...(m.path ? { path: m.path } : {}),
      ...(m.url ? { url: m.url } : {}),
    });

    switch (m.kind) {
      case 'issue-not-on-project': {
        const key = normalizeIssueUrl(m.url ?? '');
        if (plannedProjectAdds.has(key)) break;
        plannedProjectAdds.add(key);
        const observed = await fetchIssue(input.token, m.url ?? '', input.fetchFn);
        if (!observed.ok) {
          reports.push({ tier: 'report', kind: 'issue-unavailable', subject: m.subject, message: formatNotice({ code: 'cli.reconcile.issue-unavailable', args: { task: m.subject, issue: m.url ?? '', detail: formatNotice(observed.error, locale) } }, locale), automated: false, ...(m.url ? { url: m.url } : {}) });
          break;
        }
        const plan = planProjectAdd([m.url ?? ''], { token: input.token, project: input.project, repositories: input.repositories, onProject, fetch: input.fetch });
        const issueUrl = m.url ?? '';
        const taskPath = m.path;
        const issueRef = parseIssueUrl(issueUrl);
        for (const action of plan.actions) {
          const runAdd = action.run;
          action.summary = { code: 'cli.reconcile.project-add', args: { task: m.subject, path: taskPath ?? '—', issue: issueUrl, owner: input.project.owner, project: input.project.number } };
          action.reason = { code: 'cli.reconcile.project-add-reason' };
          action.fingerprint = JSON.stringify([input.project.owner, input.project.number, repositoryScope, issueUrl, taskPath ?? null]);
          action.run = async () => {
            if (!await input.freshSetupMatches?.() || !taskPath || !issueRef || !input.freshTaskIssue || normalizeIssueUrl(await input.freshTaskIssue(taskPath) ?? '') !== normalizeIssueUrl(issueUrl)) throw new NoticeError({ code: 'cli.reconcile.stale' });
            const repository = `${issueRef.owner}/${issueRef.repo}`;
            const freshRules = await input.freshRulesFor?.(repository);
            if (!freshRules || JSON.stringify(freshRules) !== JSON.stringify(input.rulesFor?.(repository))) throw new NoticeError({ code: 'cli.reconcile.stale' });
            const before = await readProject(input.token, input.project, [repository], input.fetch);
            if (!before.ok) throw new NoticeError(before.error);
            if (before.read.cards.some((card) => normalizeIssueUrl(card.url) === normalizeIssueUrl(issueUrl))) return;
            if (before.read.membershipComplete !== true) throw new NoticeError({ code: 'cli.reconcile.stale' });
            const issue = await fetchIssue(input.token, issueUrl, input.fetchFn);
            if (!issue.ok) throw new NoticeError(issue.error);
            await runAdd();
            const after = await readProject(input.token, input.project, [repository], input.fetch);
            const afterIssue = await fetchIssue(input.token, issueUrl, input.fetchFn);
            if (!after.ok || !after.read.cards.some((card) => normalizeIssueUrl(card.url) === normalizeIssueUrl(issueUrl)) || !afterIssue.ok || afterIssue.issue.state !== issue.issue.state || JSON.stringify([...afterIssue.issue.labels].sort()) !== JSON.stringify([...issue.issue.labels].sort())) throw new NoticeError({ code: 'cli.reconcile.verify-failed' });
          };
          actions.push(action);
        }
        break;
      }
      case 'board-status-missing':
      case 'board-status-differs': {
        const card = byUrl.get(normalizeIssueUrl(m.url ?? ''));
        const expected = String(m.args.expected ?? '');
        if (!card || !expected) break;
        if (card.state === 'closed') {
          reports.push({ ...item('report', false), message: formatNotice({ code: 'cli.reconcile.closed-board-review', args: { ref: `${card.repository}#${card.number}`, owner: input.project.owner, project: input.project.number, board: card.boardStatus ?? '—', expected } }, locale) });
          break;
        }
        // A board that is ahead of the label was moved by a person (or the board's own rules) first.
        // Moving it back would undo real progress, and making the label follow could close the Issue,
        // so that case is only reported.
        if (!input.statusOptions) {
          reports.push({ ...item('report', false), message: formatNotice({ code: 'project.status-options-unavailable' }, locale) });
          break;
        }
        if (!input.statusOptions.includes(expected)) {
          reports.push({ ...item('report', false), message: formatNotice({ code: 'cli.reconcile.status-option-not-found', args: { expected, owner: input.project.owner, project: input.project.number } }, locale) });
          break;
        }
        if (m.kind !== 'board-status-missing' && !boardBehind(String(m.args.board ?? ''), expected, input.rulesFor?.(card.repository))) {
          reports.push({ ...item('report', false), message: formatNotice({ code: 'cli.reconcile.board-review', args: { ref: `${card.repository}#${card.number}`, board: String(m.args.board ?? '—'), expected, owner: input.project.owner, project: input.project.number } }, locale) });
          break;
        }
        const ref = `${card.repository}#${card.number}`;
        actions.push({
          kind: 'board.status',
          target: ref,
          summary: { code: 'cli.reconcile.board-status', args: { ref, board: String(m.args.board ?? '—'), status: expected, column: String(m.args.column ?? card.placement.column), owner: input.project.owner, project: input.project.number } },
          reason: { code: 'cli.reconcile.board-status-reason' },
          fingerprint: JSON.stringify([input.project.owner, input.project.number, repositoryScope, ref, card.projectItemId ?? null, card.state, [...card.labels].sort(), card.boardStatus ?? null, expected, input.statusOptions ?? null, input.rulesFor?.(card.repository) ?? null]),
          run: async () => {
            if (!await input.freshSetupMatches?.()) throw new NoticeError({ code: 'cli.reconcile.stale' });
            const freshRules = await input.freshRulesFor?.(card.repository);
            if (!freshRules || JSON.stringify(freshRules) !== JSON.stringify(input.rulesFor?.(card.repository))) throw new NoticeError({ code: 'cli.reconcile.stale' });
            const before = await readProject(input.token, input.project, [card.repository], input.fetch);
            if (!before.ok) throw new NoticeError(before.error);
            if (!before.read.statusOptions?.includes(expected) || (input.statusOptions && JSON.stringify([...before.read.statusOptions].sort()) !== JSON.stringify([...input.statusOptions].sort()))) throw new NoticeError({ code: 'cli.reconcile.stale' });
            const fresh = before.read.cards.find((c) => normalizeIssueUrl(c.url) === normalizeIssueUrl(card.url));
            if (!fresh || !fresh.projectItemId || !card.projectItemId || fresh.projectItemId !== card.projectItemId || fresh.boardStatus !== card.boardStatus || fresh.state !== card.state || JSON.stringify([...fresh.labels].sort()) !== JSON.stringify([...card.labels].sort())) throw new NoticeError({ code: 'cli.reconcile.stale' });
            await setProjectField(input.token, input.project, fresh.projectItemId, 'Status', expected, input.fetch);
            const after = await readProject(input.token, input.project, [card.repository], input.fetch);
            if (!after.ok) throw new NoticeError({ code: 'cli.reconcile.verify-failed' });
            const observed = after.read.cards.find((c) => normalizeIssueUrl(c.url) === normalizeIssueUrl(card.url));
            const afterRules = await input.freshRulesFor?.(card.repository);
            if (!observed || observed.projectItemId !== fresh.projectItemId || observed.boardStatus !== expected || observed.state !== fresh.state || JSON.stringify([...observed.labels].sort()) !== JSON.stringify([...fresh.labels].sort()) || !afterRules || JSON.stringify(afterRules) !== JSON.stringify(freshRules)) throw new NoticeError({ code: 'cli.reconcile.verify-failed' });
          },
        });
        break;
      }
      case 'merged-pr-not-linked': {
        const pull = input.pulls.find((p) => p.url === m.url);
        const number = Number(m.args.number);
        const card = pull && input.cards.find((c) => c.repository.toLowerCase() === pull.repository.toLowerCase() && c.number === number);
        if (!pull || !card) break;
        const marker = `<!-- weaver:pull-${pull.number} -->`;
        let already: boolean;
        try {
          already = await hasIssueComment(input.token, card.repository, card.number, marker, input.fetchFn);
        } catch {
          reports.push(item('proposed', false));
          break;
        }
        if (already) break;
        const ref = `${card.repository}#${card.number}`;
        actions.push({
          kind: 'issue.comment',
          target: ref,
          summary: { code: 'cli.reconcile.comment', args: { ref, pull: pull.number, task: String(m.args.task ?? '') } },
          reason: { code: 'cli.reconcile.comment-reason' },
          fingerprint: `${ref}|${pull.url}`,
          run: () =>
            addIssueComment(
              input.token,
              card.repository,
              card.number,
              `${attribution(locale, input.login)}\n\nPull request #${pull.number} (${pull.title}) names ${m.args.task} but does not close this Issue. Closing it stays with a person.\n${marker}`,
              input.fetchFn,
            ),
        });
        break;
      }
      case 'task-without-issue': {
        // A change to repository files, so it is offered as a pull request (DEC-012, TASK-053).
        const task = input.artifacts.find((a): a is TaskArtifact => a.kind === 'task' && a.path === m.path && a.id === m.args.task);
        const requirement = task && requirementForTask(task, input.artifacts);
        // A Project-only search cannot prove that no Issue exists outside this board. Link a unique
        // visible match, but never create another Issue from an incomplete identity search.
        const candidates = task ? input.cards.filter((card) => card.taskId === task.id && card.repository.toLowerCase() === (task.repository ?? requirement?.repository ?? '').toLowerCase()) : [];
        const planned = input.files && task && candidates.length === 1 && input.projectMembershipComplete !== false && input.workspaceComplete !== false ? await planLinkIssue(input.files, task, requirement, candidates) : undefined;
        if (planned) actions.push(...planned);
        else reports.push({ ...item('proposed', false), message: formatNotice({ code: 'cli.reconcile.link-review', args: { task: m.subject } }, locale) });
        break;
      }
      case 'card-without-file': {
        const card = byUrl.get(normalizeIssueUrl(m.url ?? ''));
        const planned = input.files && card ? await planDraftTask(input.files, card, input.artifacts) : undefined;
        if (planned) actions.push(...planned);
        else reports.push(item('proposed', false));
        break;
      }
      case 'card-file-unknown':
      case 'issue-project-unknown':
      case 'status-source-needs-decision':
      case 'pulls-incomplete':
      case 'projection-unmapped':
      case 'shared-issue':
      case 'broken-issue-link':
      // A difference from the contract changes a person's file or a board field, so it is only reported (DEC-016 item 9).
      case 'task-field-missing':
      case 'task-field-value':
      case 'task-field-differs':
      case 'task-field-in-file':
        reports.push(item('report', false));
        break;
    }
  }

  // A closed task Issue keeps its old status label when a pull request closes it (DEC-003: closed means Verified).
  for (const card of checkedCards) {
    const isTask = card.taskId !== undefined || card.labels.includes('task');
    const rules = input.rulesFor?.(card.repository);
    const plan = planMove(card, 'Verified', rules);
    if (card.state === 'closed' && isTask && !plan.unavailable && !plan.noop) {
      reports.push({ tier: 'report', kind: 'closed-without-verified', subject: `${card.repository}#${card.number}`, message: formatNotice({ code: 'cli.reconcile.closed-review', args: { ref: `${card.repository}#${card.number}` } }, locale), automated: false, url: card.url });
    }
  }

  // Stale cards need a person's judgment.
  const notices = cardNotices(checkedCards, input.artifacts, input.now, input.idleDaysFor, input.evidenceFor);
  for (const card of checkedCards) {
    for (const notice of notices.get(normalizeIssueUrl(card.url)) ?? []) {
      reports.push({
        tier: 'report',
        kind: notice.code,
        subject: `${card.repository}#${card.number}`,
        message: formatNotice(notice, locale),
        automated: false,
        url: card.url,
      });
    }
  }

  return { actions, reports };
}
