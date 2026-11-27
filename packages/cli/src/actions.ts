import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { formatNotice, Locale, MessageKey, Notice, t } from '@ebrain-lab/weaver-markdown';
import { errorNotice, NoticeError } from '@ebrain-lab/weaver-github';
import { Deps, EXIT, SCHEMA } from './contract';

/**
 * One write, described before it runs (DEC-008). Nothing in `run` happens until the action is
 * approved, so a plan can be built, shown, and thrown away without touching GitHub or a file.
 */
export interface PlannedAction {
  /** What kind of change, such as `project.add`. */
  kind: string;
  /** What it changes, such as `me/Weaver#12`. */
  target: string;
  /** The exact change, as a person should read it. */
  summary: Notice;
  /** Why the steward proposes it. */
  reason: Notice;
  /**
   * What the approval id is made from, when the summary reads differently by language or holds text
   * that is not the change itself. Without it the id comes from the kind, target, and English summary.
   */
  fingerprint?: string;
  /** Known identity, also reported if the write fails or waits for approval. */
  identifiers?: Record<string, string>;
  /** Actions that must have succeeded first; this one is skipped otherwise. */
  dependsOn?: PlannedAction[];
  run(): Promise<void | { identifiers: Record<string, string> }>;
}

export type Outcome = 'done' | 'failed' | 'declined' | 'unconfirmed' | 'skipped';

export interface ActionResult {
  id: string;
  kind: string;
  target: string;
  summary: string;
  reason: string;
  outcome: Outcome;
  /** The error of a failed action. */
  message?: string;
  identifiers?: Record<string, string>;
}

/** One line of the local action log: who or what did it, to what, and why. */
export interface LogEntry {
  time: string;
  actor: string;
  onBehalfOf?: string;
  action: string;
  target: string;
  reason: string;
  outcome: 'done' | 'failed';
  message?: string;
}

export interface ActionLog {
  append(entry: LogEntry): Promise<void>;
}

/**
 * The approval token of an action: it names the kind, the target, and the exact change, so an
 * approval of one action cannot be reused for another.
 */
export function actionId(action: Pick<PlannedAction, 'kind' | 'target' | 'summary' | 'fingerprint'>): string {
  const text = `${action.kind}\n${action.target}\n${action.fingerprint ?? formatNotice(action.summary, 'en')}`;
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/** `~/.weaver/actions.jsonl`, or under `WEAVER_HOME`. Never inside a repository. */
export function defaultLogPath(env: Record<string, string | undefined>): string {
  return path.join(env.WEAVER_HOME ?? path.join(os.homedir(), '.weaver'), 'actions.jsonl');
}

export function fileActionLog(file: string): ActionLog {
  return {
    async append(entry) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8');
    },
  };
}

/** The line that anything created on GitHub carries, so the steward's work is told from the user's. */
export function attribution(locale: Locale, login: string | undefined): string {
  return login ? t('steward.attribution', locale, { login }) : t('steward.attribution-anonymous', locale);
}

export interface ExecuteContext {
  locale: Locale;
  /** Ids the user approved ahead of time, from `--approve`. */
  approved: ReadonlySet<string>;
  interactive: boolean;
  ask(question: string): Promise<boolean>;
  log: ActionLog;
  actor: string;
  onBehalfOf?: string;
  now(): Date;
  /** Where the plan is shown while it waits: the error stream, so standard output stays JSON. */
  note(text: string): void;
}

/** The error in the chosen language when it carries a notice, otherwise its text as it is (for example what `git` printed). */
const errorText = (error: unknown, locale: Locale): string =>
  error instanceof NoticeError ? formatNotice(errorNotice(error), locale) : error instanceof Error ? error.message : String(error);

/**
 * Runs the plan one action at a time. An action runs only when its id was approved up front or the
 * person says yes to it. An action that was neither approved nor answered is `unconfirmed`, one
 * that was refused is `declined`, and neither changes anything. The first failure stops the rest.
 */
export async function executeActions(actions: readonly PlannedAction[], ctx: ExecuteContext): Promise<ActionResult[]> {
  const results = new Map<PlannedAction, ActionResult>();
  let stopped = false;

  for (const action of actions) {
    const id = actionId(action);
    const result: ActionResult = {
      id,
      kind: action.kind,
      target: action.target,
      summary: formatNotice(action.summary, ctx.locale),
      reason: formatNotice(action.reason, ctx.locale),
      outcome: 'skipped',
      ...(action.identifiers ? { identifiers: { ...action.identifiers } } : {}),
    };
    results.set(action, result);

    // An action waits for its prerequisites. While a prerequisite is only waiting for approval, the
    // action is still shown, so a person or an agent sees the whole plan and every id at once.
    const needed = (action.dependsOn ?? []).map((other) => results.get(other)?.outcome);
    const prerequisitesDone = needed.every((outcome) => outcome === 'done');
    const prerequisitesWaiting = !prerequisitesDone && needed.every((outcome) => outcome === 'done' || outcome === 'unconfirmed');
    if (stopped || (!prerequisitesDone && !prerequisitesWaiting)) continue;

    ctx.note(`${t('cli.action-line', ctx.locale, { id, kind: result.kind, target: result.target, summary: result.summary, reason: result.reason })}\n`);

    if (prerequisitesWaiting) {
      result.outcome = 'unconfirmed';
      continue;
    }

    let approved = ctx.approved.has(id);
    if (!approved && ctx.interactive) {
      approved = await ctx.ask(t('cli.confirm', ctx.locale));
      if (!approved) {
        result.outcome = 'declined';
        continue;
      }
    }
    if (!approved) {
      result.outcome = 'unconfirmed';
      continue;
    }

    const entry = { time: ctx.now().toISOString(), actor: ctx.actor, ...(ctx.onBehalfOf ? { onBehalfOf: ctx.onBehalfOf } : {}), action: action.kind, target: action.target, reason: formatNotice(action.reason, 'en') };
    try {
      const details = await action.run();
      if (action.identifiers) result.identifiers = { ...result.identifiers, ...action.identifiers };
      if (details) result.identifiers = { ...result.identifiers, ...details.identifiers };
      result.outcome = 'done';
      await ctx.log.append({ ...entry, outcome: 'done' });
    } catch (error) {
      if (action.identifiers) result.identifiers = { ...result.identifiers, ...action.identifiers };
      result.outcome = 'failed';
      result.message = errorText(error, ctx.locale);
      stopped = true;
      // The log reads the same for everyone, so it keeps English.
      await ctx.log.append({ ...entry, outcome: 'failed', message: errorText(error, 'en') }).catch(() => undefined);
    }
  }
  return [...results.values()];
}

/** A failure comes first, then a refusal, then waiting for approval; nothing to do is a success. */
export function exitCodeOf(results: readonly ActionResult[]): number {
  if (results.some((r) => r.outcome === 'failed')) return EXIT.failed;
  if (results.some((r) => r.outcome === 'declined')) return EXIT.declined;
  if (results.some((r) => r.outcome === 'unconfirmed')) return EXIT.unconfirmed;
  return EXIT.ok;
}

/** Everything a write command prints at the end, and the exit code it returns. */
export interface Skipped {
  ref: string;
  reason: string;
}

/** Something found that no action fixes: it is listed for a person (or for a later task) to deal with. */
export interface ReportItem {
  /** `proposed`: DEC-012 proposes a fix that is not automated yet. `report`: a person has to judge it. */
  tier: 'proposed' | 'report';
  kind: string;
  subject: string;
  message: string;
  automated: boolean;
  path?: string;
  url?: string;
}

export interface FinishOptions {
  skipped?: readonly Skipped[];
  report?: readonly ReportItem[];
  /** The run only showed a plan, as asked: waiting for approval is then not a failure to act. */
  dryRun?: boolean;
  /** Diagnostic context returned for reconciliation. */
  context?: unknown;
  recheck?: unknown;
  /** A file PR is proposed, not merged; task registration remains incomplete. */
  registration?: boolean;
  existingPull?: boolean;
  verifiedRegistration?: boolean;
  registrationRecheck?: boolean;
}

export function finishActions(
  results: readonly ActionResult[],
  deps: Pick<Deps, 'out' | 'err'>,
  locale: Locale,
  text: boolean,
  options: FinishOptions = {},
): number {
  const { skipped = [], report = [], dryRun = false, context, recheck, registration = false, existingPull = false, verifiedRegistration = false, registrationRecheck = false } = options;
  const recheckIncomplete = typeof recheck === 'object' && recheck !== null && 'status' in recheck && (recheck.status === 'unavailable' || recheck.status === 'incomplete');
  const actionCode = dryRun && exitCodeOf(results) === EXIT.unconfirmed ? EXIT.ok : exitCodeOf(results);
  const pendingRegistration = registration && actionCode === EXIT.ok && (existingPull || results.some((result) => result.kind === 'files.pull-request' && result.outcome === 'done'));
  const needsRegistrationRecheck = registration && registrationRecheck && actionCode === EXIT.ok && results.some((result) => result.outcome === 'done');
  const code = recheckIncomplete && actionCode === EXIT.ok ? EXIT.failed : pendingRegistration || needsRegistrationRecheck ? EXIT.unconfirmed : actionCode;
  if (text) {
    if (context !== undefined) deps.out(`${t(registration ? 'cli.task-create.context' : 'cli.reconcile.context', locale)}\t${JSON.stringify(context)}\n`);
    if (recheck !== undefined) deps.out(`${t('cli.reconcile.recheck', locale)}\t${JSON.stringify(recheck)}\n`);
    for (const s of skipped) deps.err(`${t(`cli.skip.${s.reason}` as MessageKey, locale)}\t${s.ref}\n`);
    for (const r of results) deps.out(`${t(`cli.outcome.${r.outcome}`, locale)}\t${r.kind}\t${r.target}${r.identifiers ? `\t${JSON.stringify(r.identifiers)}` : ''}${r.message ? `\t${r.message}` : ''}\n`);
    if (pendingRegistration) deps.out(`${t('cli.task-create.files-pending', locale)}\n`);
    if (needsRegistrationRecheck) deps.out(`${t('cli.task-create.recheck-registration', locale)}\n`);
    if (verifiedRegistration) deps.out(`${t('cli.task-create.registration-verified', locale)}\n`);
    for (const r of report) deps.out(`${r.tier}\t${r.kind}\t${r.subject}\t${r.message}\n`);
    const waiting = results.filter((r) => r.outcome === 'unconfirmed').map((r) => r.id);
    if (waiting.length) deps.err(`${t('cli.unconfirmed-hint', locale, { ids: waiting.join(',') })}\n`);
  } else {
    const waiting = results.some((r) => r.outcome === 'unconfirmed');
    const status = actionCode === EXIT.failed ? 'failed' : recheckIncomplete || needsRegistrationRecheck ? 'incomplete' : pendingRegistration ? 'pending' : verifiedRegistration ? 'done' : results.length === 0 ? 'nothing' : code === EXIT.failed ? 'failed' : code === EXIT.declined ? 'declined' : waiting ? (dryRun ? 'plan' : 'unconfirmed') : 'done';
    deps.out(`${JSON.stringify({ schema: SCHEMA, status, actions: results, skipped, report, ...(needsRegistrationRecheck ? { message: t('cli.task-create.recheck-registration', locale) } : pendingRegistration ? { message: t('cli.task-create.files-pending', locale) } : verifiedRegistration ? { message: t('cli.task-create.registration-verified', locale) } : {}), ...(context !== undefined ? { context } : {}), ...(recheck !== undefined ? { recheck } : {}) })}\n`);
  }
  return code;
}

/** The ids of `--approve a,b,c`. */
export function parseApproved(value: string | undefined): Set<string> {
  return new Set((value ?? '').split(',').map((id) => id.trim()).filter(Boolean));
}
