import { describe, expect, it } from 'vitest';
import { fetchPageState, summarizeChecks, type FetchFn } from '../src';

/** GitHub as a double: an answer for each address that contains the key; anything else is 404. */
function github(answers: Record<string, { status?: number; body?: unknown } | 'offline'>) {
  const asked: string[] = [];
  const fetchFn = (async (url: string) => {
    asked.push(url);
    const key = Object.keys(answers).find((k) => url.includes(k));
    const answer = key ? answers[key] : { status: 404, body: {} };
    if (answer === 'offline') throw new Error('offline');
    const status = answer.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => answer.body ?? {} };
  }) as unknown as FetchFn;
  return { fetchFn, asked };
}

const pull = { kind: 'pull' as const, repository: 'o/r', number: 2 };
const issue = { kind: 'issue' as const, repository: 'o/r', number: 7 };

describe('summarizeChecks', () => {
  it('is none for no check runs, pending while any runs, failing when any went wrong, else passing', () => {
    expect(summarizeChecks([])).toBe('none');
    expect(summarizeChecks([{ status: 'completed', conclusion: 'success' }, { status: 'in_progress' }])).toBe('pending');
    expect(summarizeChecks([{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'failure' }])).toBe('failing');
    expect(summarizeChecks([{ status: 'completed', conclusion: 'cancelled' }])).toBe('failing');
    expect(summarizeChecks([{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'skipped' }])).toBe('passing');
  });
});

describe('fetchPageState', () => {
  it('reads a merged pull request, by its merge, without asking about checks', async () => {
    const { fetchFn, asked } = github({ '/pulls/2': { body: { state: 'closed', merged: true, head: { sha: 'abc' } } } });
    expect(await fetchPageState('t', pull, fetchFn)).toEqual({ ok: true, state: { state: 'merged' } });
    expect(asked).toHaveLength(1);
  });

  it('reads a pull request that was closed without a merge', async () => {
    const { fetchFn } = github({ '/pulls/2': { body: { state: 'closed', merged: false, merged_at: null, head: { sha: 'abc' } } } });
    expect(await fetchPageState('t', pull, fetchFn)).toEqual({ ok: true, state: { state: 'closed' } });
  });

  it('reads an open pull request with the state of its checks', async () => {
    const { fetchFn, asked } = github({
      '/pulls/2': { body: { state: 'open', merged: false, head: { sha: 'abc' } } },
      '/commits/abc/check-runs': { body: { check_runs: [{ status: 'completed', conclusion: 'success' }] } },
    });
    expect(await fetchPageState('t', pull, fetchFn)).toEqual({ ok: true, state: { state: 'open', checks: 'passing' } });
    expect(asked[1]).toContain('/commits/abc/check-runs');
  });

  it('keeps the state of an open pull request when its checks cannot be read', async () => {
    const { fetchFn } = github({ '/pulls/2': { body: { state: 'open', head: { sha: 'abc' } } }, '/commits/abc/check-runs': { status: 403 } });
    expect(await fetchPageState('t', pull, fetchFn)).toEqual({ ok: true, state: { state: 'open' } });
  });

  it('reads an Issue as open or closed', async () => {
    expect(await fetchPageState('t', issue, github({ '/issues/7': { body: { state: 'open' } } }).fetchFn)).toEqual({ ok: true, state: { state: 'open' } });
    expect(await fetchPageState('t', issue, github({ '/issues/7': { body: { state: 'closed' } } }).fetchFn)).toEqual({ ok: true, state: { state: 'closed' } });
  });

  it('answers with a notice when the page cannot be read, and never throws', async () => {
    expect(await fetchPageState('t', pull, github({ '/pulls/2': { status: 404 } }).fetchFn)).toMatchObject({ ok: false, error: { code: 'github.err.http', args: { status: 404 } } });
    expect(await fetchPageState('t', pull, github({ '/pulls/2': { status: 401 } }).fetchFn)).toMatchObject({ ok: false, error: { code: 'github.err.unauthorized' } });
    expect(await fetchPageState('t', pull, github({ '/pulls/2': 'offline' }).fetchFn)).toMatchObject({ ok: false, error: { code: 'github.err.network' } });
  });

  it('asks with the token and reads only', async () => {
    const calls: { method?: string; auth?: string }[] = [];
    const fetchFn = (async (_url: string, init?: { method?: string; headers?: Record<string, string> }) => {
      calls.push({ method: init?.method, auth: init?.headers?.Authorization });
      return { ok: true, status: 200, json: async () => ({ state: 'open' }) };
    }) as unknown as FetchFn;
    await fetchPageState('tok', issue, fetchFn);
    expect(calls).toEqual([{ method: undefined, auth: 'Bearer tok' }]);
  });
});
