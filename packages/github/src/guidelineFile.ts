import type { GuidelineRef } from '@palab/weaver-markdown';
import type { FetchFn } from './issue';
import { refreshRosterFile, RosterCacheEntry, RosterRefresh } from './rosterFile';

/**
 * What a host keeps of a guideline's process file between runs (DEC-019 item 8): the text, the ETag
 * it came with, and when GitHub last confirmed it. It has the shape of a kept roster file and is
 * read the same way: drawn from the copy at once, asked again in the background, kept on the
 * person's computer and never in a repository.
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
