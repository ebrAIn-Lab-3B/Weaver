import { Locale, Notice, t } from './i18n';
import { KanbanColumn } from './kanban';
import type { ProcessConfig } from './process';

/** What a repository expects as evidence (DEC-015). Without a process file these are today's rules (DEC-006). */
export type EvidenceRules = ProcessConfig['evidence'];

const DEFAULT_EVIDENCE: EvidenceRules = { pullRequest: 'required', closingPullRequest: true, exceptions: true };

/** The `evidence_exception` reason of a task, when the repository honors exceptions; otherwise none. */
export function honoredException(reason: string | undefined, rules: EvidenceRules = DEFAULT_EVIDENCE): string | undefined {
  return rules.exceptions ? reason : undefined;
}

export type ChecksState = 'passing' | 'failing' | 'pending' | 'none' | 'unknown';

export interface PullEvidence {
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  checks: ChecksState;
  /** Present when check-run retrieval failed or was incomplete. */
  checksError?: Notice;
  /** GitHub's closing association, not a conclusion drawn from pull request text. */
  link: 'closes' | 'mentions' | 'unknown';
  /** A textual closing claim is useful context but does not establish an association. */
  textClaimsClosing?: boolean;
  /** The head commit whose checks were inspected. */
  revision?: string;
  /** GitHub commit status contexts are separate from check runs. */
  statusContexts?: { state: 'success' | 'failure' | 'error' | 'pending' | 'none' | 'unknown'; apiUrl: string; count?: number };
}

export interface TaskEvidence {
  /** Pull requests that reference the task's Issue. A reference is a link, not proof. */
  pulls: PullEvidence[];
  /** Referenced PRs whose details could not be read; known observations remain usable. */
  unavailablePulls?: { url: string; error: Notice }[];
}

export interface CheckRunLike {
  status: string;
  conclusion: string | null;
}

const FAILING = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale']);

/** Collapses a commit's check runs into one state. */
export function summarizeChecks(runs: CheckRunLike[]): ChecksState {
  if (runs.length === 0) return 'none';
  if (runs.some((run) => run.status === 'completed' && run.conclusion && FAILING.has(run.conclusion))) return 'failing';
  if (runs.some((run) => run.status !== 'completed')) return 'pending';
  if (runs.some((run) => run.conclusion !== 'success')) return 'unknown';
  return 'passing';
}

/**
 * Gaps between where a task sits and the evidence behind it.
 * Evidence is only demanded once a task claims to be in review or verified;
 * it reports gaps and never decides acceptance.
 */
export function evidenceGaps(column: KanbanColumn, evidence: TaskEvidence | undefined, rules: EvidenceRules = DEFAULT_EVIDENCE): Notice[] {
  if (column !== 'Review' && column !== 'Verified') return [];
  if (!evidence) return [{ code: 'gap.evidence-not-loaded' }];
  // A repository that does not expect pull requests has no gap for the lack of one.
  const partial = (evidence.unavailablePulls?.length ?? 0) > 0;
  if (evidence.pulls.length === 0) return partial ? [{ code: 'gap.evidence-not-loaded' }] : rules.pullRequest === 'optional' ? [] : [{ code: 'gap.no-linked-pr' }];

  const gaps: Notice[] = partial ? [{ code: 'gap.evidence-not-loaded' }] : [];
  if (!partial && column === 'Verified' && !evidence.pulls.some((pull) => pull.state === 'merged')) {
    gaps.push({ code: 'gap.no-merged-pr' });
  } else if (
    !partial && column === 'Verified' &&
    rules.closingPullRequest &&
    !evidence.pulls.some((pull) => pull.state === 'merged' && (pull.link === 'closes' || pull.link === 'unknown'))
  ) {
    gaps.push({ code: 'gap.no-closing-pr' });
  }
  if (!partial && column === 'Verified' && rules.closingPullRequest && !evidence.pulls.some((pull) => pull.state === 'merged' && pull.link === 'closes') && evidence.pulls.some((pull) => pull.state === 'merged' && pull.link === 'unknown')) gaps.push({ code: 'gap.closing-unknown' });
  // closed without merge is not evidence either way
  const live = evidence.pulls.filter((pull) => pull.state !== 'closed');
  gaps.push(...groupedPullGap(live, 'failing', 'gap.checks-failing'));
  gaps.push(...groupedPullGap(live, 'pending', 'gap.checks-pending'));
  gaps.push(...groupedPullGap(live, 'none', 'gap.checks-none'));
  gaps.push(...groupedPullGap(live, 'unknown', 'gap.checks-unknown'));
  for (const [states, code] of [
    [['failure', 'error'], 'gap.status-failing'],
    [['pending'], 'gap.status-pending'],
    [['unknown'], 'gap.status-unknown'],
  ] as const) {
    const matching = live.filter((pull) => pull.statusContexts && (states as readonly string[]).includes(pull.statusContexts.state)).map((pull) => `#${pull.number}`);
    if (matching.length) gaps.push({ code, args: { prs: matching, count: matching.length } });
  }
  return gaps;
}

/** One notice per check state, so four old PRs do not produce four warnings. */
function groupedPullGap(
  pulls: PullEvidence[],
  state: ChecksState,
  code: 'gap.checks-failing' | 'gap.checks-pending' | 'gap.checks-none' | 'gap.checks-unknown',
): Notice[] {
  const matching = pulls.filter((pull) => pull.checks === state).map((pull) => `#${pull.number}`);
  return matching.length === 0 ? [] : [{ code, args: { prs: matching, count: matching.length } }];
}

export function describePull(pull: PullEvidence, locale: Locale = 'en'): string {
  return t('pull.summary', locale, {
    number: pull.number,
    state: t(`pull.state.${pull.state}`, locale),
    checks: t(`pull.checks.${pull.checks}`, locale),
    link: t(`pull.link.${pull.link}`, locale),
  });
}

const CLOSING_WORD = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)\b/gi;

/**
 * Whether PR text uses GitHub's closing keywords for this Issue ("Closes #5").
 * A plain "#5" or "TASK-005" is only a mention.
 */
export function closesIssue(text: string | null | undefined, issueNumber: number): boolean {
  if (!text) return false;
  for (const match of text.matchAll(CLOSING_WORD)) {
    if (Number(match[1]) === issueNumber) return true;
  }
  return false;
}
