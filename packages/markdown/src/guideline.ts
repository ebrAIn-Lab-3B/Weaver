import type { AddIssue } from './roster';

/**
 * Where an operating guideline is read from: a folder or file in a repository, at a branch, tag,
 * or commit (DEC-019 item 3). The fields and defaults are those of a roster reference (DEC-017).
 */
export interface GuidelineRef {
  repository: string;
  /** The process file of the guideline. */
  path: string;
  /** Left out: the default branch of the repository. */
  ref?: string;
}

/** The path read when a reference names none. */
export const DEFAULT_GUIDELINE_PATH = '.weaver/process.yaml';

/** Where a reference was declared. A repository's own process file is the nearest, the personal file the farthest (DEC-019 item 4). */
export type GuidelineSource = 'process' | 'root' | 'personal';

export interface DeclaredGuideline {
  ref: GuidelineRef;
  source: GuidelineSource;
  /** The file that declared it, when the caller knew it. */
  file?: string;
}

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const KNOWN = ['repository', 'path', 'ref'];

const isMapping = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined);

/**
 * Reads `guideline: {repository, path, ref}`. Only `repository` is required. A reference that is
 * wrong is reported as a warning and ignored: a bad pointer must never stop Weaver from working.
 */
export function readGuidelineRef(data: unknown, add: AddIssue, field: string): GuidelineRef | undefined {
  if (data === undefined || data === null) return undefined;
  const repository = isMapping(data) ? str(data.repository) : undefined;
  const given = isMapping(data) ? data.path : undefined;
  const path = given === undefined || given === null ? DEFAULT_GUIDELINE_PATH : str(given);
  if (!isMapping(data) || !repository || !REPOSITORY.test(repository) || !path || path.startsWith('/') || path.split('/').includes('..')) {
    add('warning', 'guideline-invalid-reference', { field });
    return undefined;
  }
  for (const key of Object.keys(data)) if (!KNOWN.includes(key)) add('warning', 'unknown-field', { field: `${field}.${key}` });
  const ref = str(data.ref);
  return { repository, path, ...(ref ? { ref } : {}) };
}

/** The label of a reference as it is shown: `owner/name path@ref`. */
export function describeGuideline(ref: GuidelineRef): string {
  return `${ref.repository} ${ref.path}${ref.ref ? `@${ref.ref}` : ''}`;
}

/** The key a host keeps a copy under: repository, path, and ref, without regard to case in the repository. */
export function guidelineCacheKey(ref: GuidelineRef): string {
  return `${ref.repository.toLowerCase()}|${ref.path}|${ref.ref ?? ''}`;
}

/**
 * The guideline that applies: the first one declared, from the repository's process file, then the
 * nearest root file, then the personal file (DEC-019 item 4). Layers are given nearest first.
 */
export function chooseGuideline(layers: readonly (DeclaredGuideline | undefined)[]): DeclaredGuideline | undefined {
  return layers.find((layer) => layer !== undefined);
}
