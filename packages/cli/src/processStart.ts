import {
  type DeclaredGuideline,
  type Locale,
  type Notice,
  observeTracking,
  parseProcess,
  startingProcessText,
} from '@palab/weaver-markdown';
import {
  type FetchFn,
  PROCESS_FILE,
  fetchProcessFile,
  fetchRepositoryFile,
  filePullRequestOpen,
  openFilePullRequest,
} from '@palab/weaver-github';
import { attribution, type PlannedAction } from './actions';

/** The branch the starting file is offered on. */
export const PROCESS_START_BRANCH = 'docs/weaver-process-file';

export interface ProcessStartInput {
  token: string;
  login: string | undefined;
  locale: Locale;
  repository: string;
  /** The guideline that applies to the repository by the root or personal file (DEC-019 item 4). */
  guideline: DeclaredGuideline | undefined;
  /** The cards of the repository on the Project, to see how it is tracked. */
  cards: readonly { labels: readonly string[] }[];
  fetchFn?: FetchFn;
}

export type ProcessStartPlan =
  | { ok: true; action: PlannedAction; text: string; notes: Notice[] }
  | { ok: false; refusal: Notice };

/**
 * Plans one pull request that adds a starting process file to a repository that has none
 * (DEC-019 item 6). The exact text is in the summary, so what is approved is what is written, and
 * the approval id is made from that text. Nothing is written until the action is approved.
 *
 * With a guideline, the text is the guideline's process file as it is. When the guideline cannot be
 * read, the defaults that match how the repository is tracked are offered instead, and a note says why.
 */
export async function planProcessStart(input: ProcessStartInput): Promise<ProcessStartPlan> {
  const own = await fetchProcessFile(input.token, input.repository, {}, input.fetchFn);
  if (own.status === 'read') return { ok: false, refusal: { code: 'cli.process-start.has-file', args: { repository: input.repository } } };
  if (own.status === 'failed') return { ok: false, refusal: { code: 'cli.process-start.unreadable', args: { repository: input.repository } } };
  if (await filePullRequestOpen(input.token, input.repository, PROCESS_START_BRANCH, input.fetchFn)) {
    return { ok: false, refusal: { code: 'cli.process-start.already-open', args: { repository: input.repository, branch: PROCESS_START_BRANCH } } };
  }

  const notes: Notice[] = [];
  let guideline: { ref: DeclaredGuideline['ref']; text: string } | undefined;
  if (input.guideline) {
    const { ref } = input.guideline;
    const read = await fetchRepositoryFile(input.token, ref.repository, ref.path, { ref: ref.ref }, input.fetchFn);
    if (read.status === 'read') {
      const parsed = parseProcess(`${ref.repository}/${ref.path}`, read.text);
      if (parsed.issues.some((issue) => issue.severity === 'error')) {
        notes.push({ code: 'cli.process-start.guideline-invalid', args: { repository: ref.repository, path: ref.path } });
      } else {
        guideline = { ref, text: read.text };
      }
    } else {
      notes.push({ code: 'cli.process-start.guideline-unreadable', args: { repository: ref.repository, path: ref.path } });
    }
  }

  const text = startingProcessText({ ...(guideline ? { guideline } : {}), observed: observeTracking(input.cards) });
  const source: Notice = guideline
    ? { code: 'cli.process-start.from-guideline', args: { repository: guideline.ref.repository, path: guideline.ref.path, ref: guideline.ref.ref ?? '' } }
    : { code: 'cli.process-start.from-defaults' };

  const action: PlannedAction = {
    kind: 'process.start',
    target: `${input.repository} ${PROCESS_FILE}`,
    summary: { code: 'cli.process-start.summary', args: { repository: input.repository, path: PROCESS_FILE, text } },
    reason: source,
    fingerprint: `${input.repository}|${PROCESS_START_BRANCH}|${text}`,
    run: async () => {
      await openFilePullRequest(
        input.token,
        input.repository,
        {
          path: PROCESS_FILE,
          content: text,
          branch: PROCESS_START_BRANCH,
          title: 'docs: add a starting .weaver/process.yaml',
          commitMessage: `docs: add a starting ${PROCESS_FILE}\n\n${attribution(input.locale, input.login)}`,
          body: `${attribution(input.locale, input.login)}\n\nAdds ${PROCESS_FILE}, which tells Weaver how this repository tracks its work. The file belongs to this repository once merged; change it through a pull request. To start over, close this pull request.\n\n\`\`\`yaml\n${text}\`\`\``,
        },
        input.fetchFn,
      );
    },
  };
  return { ok: true, action, text, notes };
}
