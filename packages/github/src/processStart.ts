import { copyDay, type DeclaredGuideline, type GuidelineRef, type Notice, observeTracking, parseProcess, startingProcessText } from '@ebrain-lab/weaver-markdown';
import type { FetchFn } from './issue';
import { filePullRequestOpen, type NewFilePullRequest } from './filePullRequest';
import { fetchProcessFile, PROCESS_FILE } from './processFile';
import { type GuidelineCopyStore, memoryCopies, readGuideline } from './guidelineFile';

/** The branch the starting file is offered on. */
export const PROCESS_START_BRANCH = 'docs/weaver-process-file';

export interface PrepareProcessStart {
  token: string;
  repository: string;
  /** The guideline that applies to the repository by the root or personal file (DEC-019 item 4). */
  guideline: DeclaredGuideline | undefined;
  /** The cards of the repository on the Project, to see how it is tracked. */
  cards: readonly { labels: readonly string[] }[];
  /** The guideline copies kept on this computer. Without them nothing is kept and a guideline that cannot be asked is not used. */
  copies?: GuidelineCopyStore;
  now?: Date;
  fetchFn?: FetchFn;
}

export type ProcessStartPrepared =
  /** `source` says where the text came from; `notes` say why the guideline was not used, if it was not. */
  | { ok: true; text: string; source: Notice; guideline?: GuidelineRef; notes: Notice[] }
  | { ok: false; refusal: Notice };

/**
 * Works out the starting process file to offer a repository that has none (DEC-019 item 6), without
 * writing anything: the tool and the editor both show this text first and write it only after a yes.
 *
 * It refuses a repository that has a file (a guideline never changes one), one whose file could not
 * be read (so it is not known whether it has one), and one with an open pull request for the file.
 * With a guideline the text is that guideline's process file as it is; when the guideline cannot be
 * read or is not a valid process file, the defaults that match how the cards are tracked are used and
 * a note says why.
 */
export async function prepareProcessStart(input: PrepareProcessStart): Promise<ProcessStartPrepared> {
  const own = await fetchProcessFile(input.token, input.repository, {}, input.fetchFn);
  if (own.status === 'read') return { ok: false, refusal: { code: 'cli.process-start.has-file', args: { repository: input.repository } } };
  if (own.status === 'failed') return { ok: false, refusal: { code: 'cli.process-start.unreadable', args: { repository: input.repository } } };
  if (await filePullRequestOpen(input.token, input.repository, PROCESS_START_BRANCH, input.fetchFn)) {
    return { ok: false, refusal: { code: 'cli.process-start.already-open', args: { repository: input.repository, branch: PROCESS_START_BRANCH } } };
  }

  const notes: Notice[] = [];
  let guideline: { ref: GuidelineRef; text: string } | undefined;
  if (input.guideline) {
    const { ref } = input.guideline;
    const read = await readGuideline(input.token, ref, input.copies ?? memoryCopies(), input.now, input.fetchFn);
    const where = { repository: ref.repository, path: ref.path };
    if (read.status === 'read' || read.status === 'copy') {
      const parsed = parseProcess(`${ref.repository}/${ref.path}`, read.text);
      if (parsed.issues.some((issue) => issue.severity === 'error')) {
        notes.push({ code: 'cli.process-start.guideline-invalid', args: where });
      } else {
        guideline = { ref, text: read.text };
        if (read.status === 'copy') notes.push({ code: 'cli.process-start.guideline-copy', args: { ...where, when: copyDay(read) } });
      }
    } else if (read.status === 'missing') {
      notes.push({ code: 'cli.process-start.guideline-missing', args: where });
    } else {
      notes.push({ code: 'cli.process-start.guideline-unreadable', args: where });
    }
  }

  const text = startingProcessText({ ...(guideline ? { guideline } : {}), observed: observeTracking(input.cards) });
  const source: Notice = guideline
    ? { code: 'cli.process-start.from-guideline', args: { repository: guideline.ref.repository, path: guideline.ref.path, ref: guideline.ref.ref ?? '' } }
    : { code: 'cli.process-start.from-defaults' };
  return { ok: true, text, source, ...(guideline ? { guideline: guideline.ref } : {}), notes };
}

/** The pull request that adds the starting file. `attribution` is the line that says who and what made it. */
export function processStartPullRequest(text: string, attribution: string): NewFilePullRequest {
  return {
    path: PROCESS_FILE,
    content: text,
    branch: PROCESS_START_BRANCH,
    title: `docs: add a starting ${PROCESS_FILE}`,
    commitMessage: `docs: add a starting ${PROCESS_FILE}\n\n${attribution}`,
    body: `${attribution}\n\nAdds ${PROCESS_FILE}, which tells Weaver how this repository tracks its work. The file belongs to this repository once merged; change it through a pull request. To start over, close this pull request.\n\n\`\`\`yaml\n${text}\`\`\``,
  };
}
