import { guidelineCacheKey, type GuidelineRef } from './guideline';

/**
 * What a host keeps of a guideline's process file between runs (DEC-019 item 8): the text, the ETag
 * it came with, and when GitHub last confirmed it. It is kept in the personal folder, next to the
 * personal configuration, and never in a repository.
 */
export interface GuidelineCopy {
  text: string;
  etag?: string;
  /** The file was not there when it was last asked. */
  missing?: true;
  /** An ISO time: the last time GitHub said this text is current. */
  readAt: string;
}

/** The copies by key (`guidelineCacheKey`): one per repository, path, and ref. */
export type GuidelineCopies = Record<string, GuidelineCopy>;

const isMapping = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads the kept copies from the text of `guidelines.json`. The file is a convenience that a person
 * may delete or break, so anything that is not sound is left out and the rest is kept.
 */
export function readGuidelineCopies(text: string | undefined): GuidelineCopies {
  if (!text) return {};
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {};
  }
  if (!isMapping(data)) return {};
  const copies: GuidelineCopies = {};
  for (const [key, value] of Object.entries(data)) {
    if (!isMapping(value) || typeof value.readAt !== 'string' || Number.isNaN(Date.parse(value.readAt))) continue;
    if (value.missing === true) {
      copies[key] = { text: '', missing: true, readAt: value.readAt };
    } else if (typeof value.text === 'string') {
      copies[key] = { text: value.text, ...(typeof value.etag === 'string' ? { etag: value.etag } : {}), readAt: value.readAt };
    }
  }
  return copies;
}

/** The text of `guidelines.json` for the copies. */
export function serializeGuidelineCopies(copies: GuidelineCopies): string {
  return `${JSON.stringify(copies, null, 2)}\n`;
}

/** The key a copy of this reference is kept under. */
export const guidelineCopyKey = (ref: GuidelineRef): string => guidelineCacheKey(ref);

/** The day GitHub last confirmed a copy, as `YYYY-MM-DD`, for saying how old it is. */
export function copyDay(copy: Pick<GuidelineCopy, 'readAt'>): string {
  return copy.readAt.slice(0, 10);
}
