/** A GitHub page that Weaver can follow: a pull request or an Issue. */
export interface PageRef {
  kind: 'pull' | 'issue';
  repository: string;
  number: number;
}

export type PageStateName = 'open' | 'merged' | 'closed';
export type PageChecksState = 'passing' | 'failing' | 'pending' | 'none';

/** What is known of a page: its state, and for an open pull request the state of its checks. */
export interface PageState {
  state: PageStateName;
  checks?: PageChecksState;
}

/** Weaver reads the state of a page it opened for this long, and no longer (DEC-020 item 6). */
export const WATCH_MINUTES = 10;
/** The wait between two reads while the window is in front (DEC-020 item 6). */
export const WATCH_INTERVAL_SECONDS = 60;
/** The shortest wait between two reads when the window comes back to the front, so switching windows quickly does not ask GitHub every time. */
export const WATCH_FOCUS_SECONDS = 10;

/** The pull request or Issue that an address names, or nothing for any other address. */
export function parsePageUrl(url: string): PageRef | undefined {
  const found = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/(pull|issues)\/(\d+)(?:[/?#].*)?$/i.exec(url.trim());
  if (!found) return undefined;
  return { kind: found[2].toLowerCase() === 'pull' ? 'pull' : 'issue', repository: found[1], number: Number(found[3]) };
}

/** A page Weaver is following: when it was opened, when it was last read, and what the last read said. */
export interface Watch {
  ref: PageRef;
  /** Milliseconds since the epoch. */
  openedAt: number;
  readAt?: number;
  last?: PageState;
}

/** A merged or closed page does not change again that matters here, so it is not read any more. */
export function isFinalState(state: PageState | undefined): boolean {
  return state?.state === 'merged' || state?.state === 'closed';
}

/** True when the page is finished (merged or closed) or has been followed for as long as DEC-020 allows. */
export function watchIsOver(watch: Watch, now: number): boolean {
  return isFinalState(watch.last) || now - watch.openedAt > WATCH_MINUTES * 60_000;
}

export type ReadReason = 'tick' | 'focus';

/**
 * Whether to ask GitHub about a page now. The first read is always allowed; after that a timer tick
 * waits a minute and a window coming back to the front waits ten seconds. A page that is over is not read.
 */
export function shouldRead(watch: Watch, now: number, reason: ReadReason): boolean {
  if (watchIsOver(watch, now)) return false;
  if (watch.readAt === undefined) return true;
  const waited = (now - watch.readAt) / 1000;
  return waited >= (reason === 'focus' ? WATCH_FOCUS_SECONDS : WATCH_INTERVAL_SECONDS);
}

/**
 * True when a read shows something the Overview should show. The first read only sets what later
 * ones are compared with, so a page that was already merged when it was opened changes nothing.
 */
export function stateChanged(before: PageState | undefined, after: PageState): boolean {
  if (before === undefined) return false;
  return before.state !== after.state || before.checks !== after.checks;
}
