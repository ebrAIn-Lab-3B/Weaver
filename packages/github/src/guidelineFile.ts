import { guidelineCopyKey, type GuidelineCopy, type GuidelineRef, type Notice } from '@palab/weaver-markdown';
import type { FetchFn } from './issue';
import { refreshRosterFile, RosterCacheEntry, RosterRefresh } from './rosterFile';

/**
 * What a host keeps of a guideline's process file between runs (DEC-019 item 8): the text, the ETag
 * it came with, and when GitHub last confirmed it. It has the shape of a kept roster file and is
 * read the same way: kept on the person's computer and never in a repository.
 */
export type GuidelineCacheEntry = RosterCacheEntry;
export type GuidelineRefresh = RosterRefresh;

/**
 * Asks whether the guideline's file changed since the kept copy. An unchanged file answers 304 and
 * renews the age; a file that cannot be asked leaves the old copy as it is, so a guideline keeps
 * working offline. This only reads: nothing is ever written to the guideline's repository.
 */
export function refreshGuidelineFile(
  token: string,
  ref: GuidelineRef,
  before: GuidelineCacheEntry | undefined,
  now: Date = new Date(),
  fetchFn?: FetchFn,
): Promise<GuidelineRefresh> {
  return refreshRosterFile(token, ref, before, now, fetchFn);
}

/** Where a host keeps the copies. A host fills it from its file before reading and saves it after. */
export interface GuidelineCopyStore {
  get(key: string): GuidelineCopy | undefined;
  set(key: string, copy: GuidelineCopy): void;
}

/** A store that lives only as long as the program: the copies of a host that keeps none. */
export function memoryCopies(initial: Record<string, GuidelineCopy> = {}): GuidelineCopyStore & { all(): Record<string, GuidelineCopy> } {
  const copies = new Map(Object.entries(initial));
  return { get: (key) => copies.get(key), set: (key, copy) => void copies.set(key, copy), all: () => Object.fromEntries(copies) };
}

export type GuidelineRead =
  /** GitHub was asked, and this is the text (new, or confirmed unchanged). */
  | { status: 'read'; text: string; readAt: string }
  /** GitHub could not be asked; the kept copy is used and `readAt` says how old it is. */
  | { status: 'copy'; text: string; readAt: string; error: Notice }
  /** GitHub says the file is not there. */
  | { status: 'missing' }
  /** GitHub could not be asked and there is no copy to fall back on. */
  | { status: 'failed'; error: Notice };

/**
 * Reads a guideline's process file (DEC-019 item 8). GitHub is asked each time with the ETag of the
 * kept copy, which costs almost nothing when nothing changed, so what is offered is current. With no
 * network, the kept copy is used and says how old it is; with no copy either, there is no guideline.
 * The store gets the new answer, or keeps the old one when nothing new could be learned.
 */
export async function readGuideline(
  token: string,
  ref: GuidelineRef,
  store: GuidelineCopyStore,
  now: Date = new Date(),
  fetchFn?: FetchFn,
): Promise<GuidelineRead> {
  const key = guidelineCopyKey(ref);
  const before = store.get(key);
  const result = await refreshGuidelineFile(token, ref, before, now, fetchFn);
  if (result.error) {
    return before && !before.missing ? { status: 'copy', text: before.text, readAt: before.readAt, error: result.error } : { status: 'failed', error: result.error };
  }
  const entry = result.entry;
  if (entry) store.set(key, entry);
  if (!entry || entry.missing) return { status: 'missing' };
  return { status: 'read', text: entry.text, readAt: entry.readAt };
}
