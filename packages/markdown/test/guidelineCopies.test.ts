import { describe, expect, it } from 'vitest';
import { copyDay, guidelineCopyKey, readGuidelineCopies, serializeGuidelineCopies, type GuidelineCopies } from '../src';

const AT = '2026-11-08T09:00:00.000Z';

describe('guideline copies', () => {
  it('are written and read back unchanged', () => {
    const copies: GuidelineCopies = {
      'org/base|.weaver/process.yaml|': { text: 'version: 1\n', etag: '"e1"', readAt: AT },
      'org/other|p.yaml|v2': { text: '', missing: true, readAt: AT },
    };
    expect(readGuidelineCopies(serializeGuidelineCopies(copies))).toEqual(copies);
  });

  it('are none when there is no file, or it is not JSON, or not a mapping', () => {
    expect(readGuidelineCopies(undefined)).toEqual({});
    expect(readGuidelineCopies('')).toEqual({});
    expect(readGuidelineCopies('not json')).toEqual({});
    expect(readGuidelineCopies('[1, 2]')).toEqual({});
    expect(readGuidelineCopies('"x"')).toEqual({});
  });

  it('leave out an entry that is not sound and keep the rest', () => {
    const text = JSON.stringify({
      good: { text: 'a', readAt: AT },
      noTime: { text: 'a' },
      badTime: { text: 'a', readAt: 'yesterday' },
      noText: { readAt: AT },
      notAMapping: 3,
      etagNotText: { text: 'b', etag: 7, readAt: AT },
    });
    expect(readGuidelineCopies(text)).toEqual({ good: { text: 'a', readAt: AT }, etagNotText: { text: 'b', readAt: AT } });
  });

  it('are keyed by repository (without case), path, and ref, like the reference', () => {
    expect(guidelineCopyKey({ repository: 'Org/Base', path: 'a.yaml', ref: 'v1' })).toBe('org/base|a.yaml|v1');
    expect(guidelineCopyKey({ repository: 'org/base', path: 'a.yaml' })).toBe('org/base|a.yaml|');
  });

  it('say the day GitHub last confirmed them', () => {
    expect(copyDay({ readAt: AT })).toBe('2026-11-08');
  });
});
