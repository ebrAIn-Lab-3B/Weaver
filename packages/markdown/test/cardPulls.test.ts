import { describe, expect, it } from 'vitest';
import { mergeCardPulls, MAX_CARD_PULLS } from '../src';

const pull = (number: number, state: string, extra: Record<string, unknown> = {}) => ({ number, url: `https://github.com/o/r/pull/${number}`, title: `PR ${number}`, state, ...extra });

describe('mergeCardPulls', () => {
  it('reads the three states of GitHub as open, merged, and closed', () => {
    const result = mergeCardPulls([pull(1, 'OPEN'), pull(2, 'MERGED'), pull(3, 'CLOSED')]);
    expect(Object.fromEntries(result.map((p) => [p.number, p.state]))).toEqual({ 1: 'open', 2: 'merged', 3: 'closed' });
  });

  it('puts the open ones first and then the newest, whatever order they came in', () => {
    const result = mergeCardPulls([pull(10, 'MERGED'), pull(4, 'OPEN'), pull(12, 'CLOSED')]);
    expect(result.map((p) => p.number)).toEqual([4, 12, 10]);
  });

  it('counts a pull request that is in both lists once', () => {
    const result = mergeCardPulls([pull(5, 'OPEN')], [pull(5, 'OPEN'), pull(6, 'MERGED')]);
    expect(result.map((p) => p.number)).toEqual([5, 6]);
  });

  it('shows at most three, keeping the open ones before the merged ones', () => {
    const result = mergeCardPulls([pull(1, 'MERGED'), pull(2, 'MERGED'), pull(3, 'MERGED'), pull(4, 'MERGED')], [pull(2, 'OPEN')]);
    expect(MAX_CARD_PULLS).toBe(3);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ number: 2, state: 'open' });
  });

  it('leaves out what is not a pull request, or is not complete', () => {
    const result = mergeCardPulls([
      { number: 7, url: 'https://github.com/o/r/issues/7', title: 'an Issue', state: 'OPEN' },
      { url: 'https://github.com/o/r/pull/8', state: 'OPEN' },
      { number: 9, state: 'OPEN' },
      { number: 10, url: 'https://github.com/o/r/pull/10', state: 'DRAFT' },
      {},
      pull(11, 'open'),
    ]);
    expect(result.map((p) => p.number)).toEqual([11]);
  });

  it('is empty for no list, an empty list, or a list that was not asked', () => {
    expect(mergeCardPulls()).toEqual([]);
    expect(mergeCardPulls([], undefined)).toEqual([]);
  });

  it('keeps the title, and says an empty one as empty', () => {
    expect(mergeCardPulls([pull(1, 'OPEN', { title: undefined })])[0].title).toBe('');
    expect(mergeCardPulls([pull(1, 'OPEN')])[0].title).toBe('PR 1');
  });
});

describe('mergeCardPulls and the closing pull requests (TASK-114)', () => {
  it('marks the pull requests of the first list as closing, also when the second list has them too', () => {
    const result = mergeCardPulls([pull(5, 'MERGED')], [pull(5, 'MERGED'), pull(3, 'MERGED')]);
    expect(result.find((p) => p.number === 5)?.closes).toBe(true);
    expect(result.find((p) => p.number === 3)?.closes).toBeUndefined();
  });

  it('keeps a closing pull request among the three it shows, ahead of newer ones that only refer', () => {
    const result = mergeCardPulls([pull(2, 'MERGED')], [pull(9, 'MERGED'), pull(8, 'MERGED'), pull(7, 'MERGED')]);
    expect(result.map((p) => p.number)).toEqual([2, 9, 8]);
  });
});
