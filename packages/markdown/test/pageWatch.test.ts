import { describe, expect, it } from 'vitest';
import {
  isFinalState,
  parsePageUrl,
  shouldRead,
  stateChanged,
  watchIsOver,
  WATCH_FOCUS_SECONDS,
  WATCH_INTERVAL_SECONDS,
  WATCH_MINUTES,
  type Watch,
} from '../src';

const ref = { kind: 'pull' as const, repository: 'o/r', number: 2 };
const watch = (extra: Partial<Watch> = {}): Watch => ({ ref, openedAt: 0, ...extra });
const seconds = (n: number): number => n * 1000;

describe('parsePageUrl', () => {
  it('reads a pull request and an Issue', () => {
    expect(parsePageUrl('https://github.com/ebrAIn-Lab-3B/weaver-trial/pull/2')).toEqual({ kind: 'pull', repository: 'ebrAIn-Lab-3B/weaver-trial', number: 2 });
    expect(parsePageUrl('https://github.com/o/r/issues/245')).toEqual({ kind: 'issue', repository: 'o/r', number: 245 });
  });

  it('reads an address that goes on to a tab, a comment, or a query', () => {
    expect(parsePageUrl('https://github.com/o/r/pull/2/files')?.number).toBe(2);
    expect(parsePageUrl('https://github.com/o/r/pull/2#issuecomment-1')?.number).toBe(2);
    expect(parsePageUrl('https://github.com/o/r/issues/7?x=1')?.number).toBe(7);
  });

  it('is nothing for any other address', () => {
    for (const url of ['https://github.com/o/r', 'https://github.com/o/r/pulls', 'https://github.com/o/r/pull/x', 'https://example.com/o/r/pull/2', 'http://github.com/o/r/pull/2', '']) {
      expect(parsePageUrl(url)).toBeUndefined();
    }
  });
});

describe('when a page is read', () => {
  it('reads the first time at once', () => {
    expect(shouldRead(watch(), 0, 'tick')).toBe(true);
    expect(shouldRead(watch(), 0, 'focus')).toBe(true);
  });

  it('waits a minute between ticks', () => {
    const w = watch({ readAt: 0, last: { state: 'open' } });
    expect(shouldRead(w, seconds(WATCH_INTERVAL_SECONDS - 1), 'tick')).toBe(false);
    expect(shouldRead(w, seconds(WATCH_INTERVAL_SECONDS), 'tick')).toBe(true);
  });

  it('reads when the window returns, but not more often than every ten seconds', () => {
    const w = watch({ readAt: 0, last: { state: 'open' } });
    expect(shouldRead(w, seconds(WATCH_FOCUS_SECONDS - 1), 'focus')).toBe(false);
    expect(shouldRead(w, seconds(WATCH_FOCUS_SECONDS), 'focus')).toBe(true);
  });

  it('stops after the page is merged or closed', () => {
    for (const state of ['merged', 'closed'] as const) {
      const w = watch({ readAt: 0, last: { state } });
      expect(isFinalState(w.last)).toBe(true);
      expect(watchIsOver(w, 1)).toBe(true);
      expect(shouldRead(w, seconds(3600), 'tick')).toBe(false);
    }
    expect(isFinalState({ state: 'open', checks: 'pending' })).toBe(false);
    expect(isFinalState(undefined)).toBe(false);
  });

  it('stops ten minutes after the page was opened, whatever its state', () => {
    const limit = WATCH_MINUTES * 60_000;
    const w = watch({ readAt: 0, last: { state: 'open' } });
    expect(shouldRead(w, limit, 'tick')).toBe(true);
    expect(shouldRead(w, limit + 1, 'tick')).toBe(false);
    expect(watchIsOver(w, limit + 1)).toBe(true);
  });
});

describe('stateChanged', () => {
  it('is false for the first read, which only sets what later reads are compared with', () => {
    expect(stateChanged(undefined, { state: 'merged' })).toBe(false);
  });

  it('is true when the state or the checks changed', () => {
    expect(stateChanged({ state: 'open', checks: 'pending' }, { state: 'open', checks: 'passing' })).toBe(true);
    expect(stateChanged({ state: 'open', checks: 'passing' }, { state: 'merged' })).toBe(true);
    expect(stateChanged({ state: 'open' }, { state: 'closed' })).toBe(true);
  });

  it('is false when nothing changed', () => {
    expect(stateChanged({ state: 'open', checks: 'passing' }, { state: 'open', checks: 'passing' })).toBe(false);
    expect(stateChanged({ state: 'open' }, { state: 'open' })).toBe(false);
  });
});
