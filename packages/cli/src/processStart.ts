import type { DeclaredGuideline, Locale, Notice } from '@ebrain-lab/weaver-markdown';
import { type FetchFn, type GuidelineCopyStore, PROCESS_FILE, PROCESS_START_BRANCH, openFilePullRequest, prepareProcessStart, processStartPullRequest } from '@ebrain-lab/weaver-github';
import { attribution, type PlannedAction } from './actions';

export { PROCESS_START_BRANCH };

export interface ProcessStartInput {
  token: string;
  login: string | undefined;
  locale: Locale;
  repository: string;
  guideline: DeclaredGuideline | undefined;
  cards: readonly { labels: readonly string[] }[];
  /** The guideline copies kept on this computer (DEC-019 item 8). */
  copies?: GuidelineCopyStore;
  now?: Date;
  fetchFn?: FetchFn;
}

export type ProcessStartPlan =
  | { ok: true; action: PlannedAction; text: string; notes: Notice[] }
  | { ok: false; refusal: Notice };

/**
 * Plans one pull request that adds a starting process file to a repository that has none
 * (DEC-019 item 6). The exact text is in the summary, so what is approved is what is written, and
 * the approval id is made from that text. Nothing is written until the action is approved.
 */
export async function planProcessStart(input: ProcessStartInput): Promise<ProcessStartPlan> {
  const prepared = await prepareProcessStart({ token: input.token, repository: input.repository, guideline: input.guideline, cards: input.cards, copies: input.copies, now: input.now, fetchFn: input.fetchFn });
  if (!prepared.ok) return prepared;
  const { text } = prepared;
  const action: PlannedAction = {
    kind: 'process.start',
    target: `${input.repository} ${PROCESS_FILE}`,
    summary: { code: 'cli.process-start.summary', args: { repository: input.repository, path: PROCESS_FILE, text } },
    reason: prepared.source,
    fingerprint: `${input.repository}|${PROCESS_START_BRANCH}|${text}`,
    run: async () => {
      await openFilePullRequest(input.token, input.repository, processStartPullRequest(text, attribution(input.locale, input.login)), input.fetchFn);
    },
  };
  return { ok: true, action, text, notes: prepared.notes };
}
