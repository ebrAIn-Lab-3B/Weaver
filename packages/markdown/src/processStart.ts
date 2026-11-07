import { describeGuideline, type GuidelineRef } from './guideline';

/** How a repository tracks its work, as far as its cards show (DEC-019 item 6). */
export type ObservedTracking = 'labels' | 'board-status' | 'unknown';

/**
 * Looks at the cards of one repository: if any carries a `status:*` label, the repository tracks
 * its work by labels; if it has cards and none carries one, by the board Status. With no card
 * there is nothing to observe, and Weaver does not guess.
 */
export function observeTracking(cards: readonly { labels: readonly string[] }[]): ObservedTracking {
  if (cards.length === 0) return 'unknown';
  return cards.some((card) => card.labels.some((label) => label.toLowerCase().startsWith('status:'))) ? 'labels' : 'board-status';
}

const LABELS_BODY = `version: 1

columns:
  # Where a card's column comes from: the status labels (\`labels\`), or the Project board's Status (\`board-status\`).
  source: labels
  # Column -> status label, used when the source is \`labels\`.
  labels:
    Backlog: status:backlog
    Ready: status:ready
    In progress: status:in-progress
    Blocked: status:blocked
    Review: status:review
    Verified: status:verified

evidence:
  # A pull request is expected in Review and Verified (\`required\`), or not (\`optional\`).
  pull-request: required
  # Verified needs a merged pull request that closes the Issue.
  closing-pull-request: true
  # An \`evidence_exception\` in a task file is honored.
  exceptions: true

stale:
  # Days without a change before an open card in an active column is idle.
  idle-days: 14
`;

const BOARD_BODY = `version: 1

columns:
  # The Project board's Status decides the column.
  source: board-status
  # Board Status option -> column. Change the names to match the options of your board.
  board:
    Todo: Backlog
    In Progress: In progress
    Done: Verified

evidence:
  # A pull request is expected in Review and Verified (\`required\`), or not (\`optional\`).
  pull-request: required
  # Verified needs a merged pull request that closes the Issue.
  closing-pull-request: true
  exceptions: true

stale:
  # Days without a change before an open card in an active column is idle.
  idle-days: 14
`;

export interface StartingProcessInput {
  /** The guideline that applies, with the text of its process file as it was read. */
  guideline?: { ref: GuidelineRef; text: string };
  observed: ObservedTracking;
}

/**
 * The text of a starting process file for a repository that has none (DEC-019 item 6). With a
 * guideline it is the guideline's file as it is, under a first comment that names the repository,
 * path, and ref it started from. Without one it is the defaults that match how the repository is
 * tracked. It belongs to the repository from then on and is not kept in step with its source (item 7).
 */
export function startingProcessText(input: StartingProcessInput): string {
  if (input.guideline) {
    const { ref, text } = input.guideline;
    const header = `# Started from the guideline ${describeGuideline(ref)}.\n# This file now belongs to this repository; a later change to the guideline does not change it.\n`;
    return header + text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  }
  const header =
    input.observed === 'labels'
      ? '# Started from the defaults: the Issues of this repository carry status labels, so the columns come from them.\n'
      : input.observed === 'board-status'
        ? '# Started from the defaults: the Issues of this repository have no status labels, so the columns come from the board Status.\n'
        : '# Started from the defaults: this repository has no cards yet to look at, so these are the defaults of Weaver.\n';
  const note = '# This file belongs to this repository; change it through a reviewed pull request.\n';
  return header + note + (input.observed === 'board-status' ? BOARD_BODY : LABELS_BODY);
}
