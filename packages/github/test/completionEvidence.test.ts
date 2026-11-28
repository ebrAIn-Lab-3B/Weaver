import { describe, expect, it } from 'vitest';
import { fetchCompletionEvidence, fetchPullInventory, type FetchFn } from '../src';

const issueUrl = 'https://github.com/example/repo/issues/5';
const now = new Date('2026-11-28T00:00:00Z');
const issue = { number: 5, title: 'Task', html_url: issueUrl, state: 'closed', labels: ['state:done'], assignees: [] };
const crossReference = { event: 'cross-referenced', source: { issue: { number: 7, title: 'work', html_url: 'https://github.com/example/repo/pull/7', repository_url: 'https://api.github.com/repos/example/repo', pull_request: {} } } };
const claim = (id: number, body: string) => ({ html_url: `${issueUrl}#issuecomment-${id}`, user: { login: id === 1 ? 'author' : 'reviewer' }, body, created_at: '2026-11-27T00:00:00Z', updated_at: '2026-11-27T00:00:00Z' });

function fixture(options: { comments?: unknown; reviews?: unknown; commentsStatus?: number; checksStatus?: number } = {}) {
  const urls: string[] = [];
  const fetchFn = (async (input: string, init?: { body?: string }) => {
    urls.push(input);
    let json: unknown;
    let status = 200;
    if (input.endsWith('/graphql')) json = { data: { repository: { pullRequest: { closingIssuesReferences: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } };
    else if (input.includes('/timeline')) json = [crossReference];
    else if (input.includes('/comments')) { json = options.comments ?? [claim(1, 'I ran tests'), claim(2, 'The independent run could not be repeated')]; status = options.commentsStatus ?? 200; }
    else if (input.includes('/reviews')) json = options.reviews ?? [];
    else if (input.includes('/check-runs')) { json = { total_count: 0, check_runs: [] }; status = options.checksStatus ?? 200; }
    else if (input.endsWith('/pulls/7')) json = { state: 'closed', merged_at: '2026-11-27T00:00:00Z', body: 'Closes #5', head: { sha: 'abc123' } };
    else json = issue;
    return { ok: status < 400, status, json: async () => json };
  }) as unknown as FetchFn;
  return { fetchFn, urls };
}

describe('completion evidence observations', () => {
  it('keeps Issue, closing relation, checks, attributed claims and absent formal reviews distinct', async () => {
    const { fetchFn } = fixture();
    const result = await fetchCompletionEvidence('token', issueUrl, now, fetchFn);
    expect(result).toMatchObject({ readAt: now.toISOString(), issue: { ok: true, issue: { state: 'closed' } }, pulls: { status: 'read', value: [{ state: 'merged', link: 'mentions', textClaimsClosing: true, checks: 'none', revision: 'abc123' }] }, reviews: [{ revision: 'abc123', observation: { status: 'read', value: [] } }] });
    expect(result.comments).toMatchObject({ status: 'read', value: [{ author: 'author', body: 'I ran tests' }, { author: 'reviewer', body: 'The independent run could not be repeated' }] });
  });

  it('distinguishes access failure and malformed review data from empty collections', async () => {
    const denied = fixture({ commentsStatus: 403, reviews: [{}] });
    const result = await fetchCompletionEvidence('token', issueUrl, now, denied.fetchFn);
    expect(result.comments).toMatchObject({ status: 'unavailable', error: { code: 'github.err.http' } });
    expect(result.reviews?.[0].observation).toMatchObject({ status: 'unavailable', error: { code: 'github.err.evidence-incomplete' } });
  });

  it('retains merge, association and review observations when check runs are inaccessible', async () => {
    const denied = fixture({ checksStatus: 403 });
    const result = await fetchCompletionEvidence('token', issueUrl, now, denied.fetchFn);
    expect(result.pulls).toMatchObject({ status: 'read', value: [{ state: 'merged', link: 'mentions', checks: 'unknown', checksError: { code: 'github.err.http' } }] });
    expect(result.reviews).toMatchObject([{ observation: { status: 'read', value: [] } }]);
  });

  it('reads an additional page after a full page and preserves review provenance', async () => {
    const first = Array.from({ length: 100 }, (_, i) => claim(i + 1, `claim ${i}`));
    const base = fixture();
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (url.includes('/comments')) return { ok: true, status: 200, json: async () => url.endsWith('page=1') ? first : [] } as Response;
      if (url.includes('/reviews')) return { ok: true, status: 200, json: async () => [{ html_url: 'https://github.com/example/repo/pull/7#pullrequestreview-1', user: { login: 'reviewer' }, state: 'APPROVED', submitted_at: '2026-11-27T00:00:00Z', commit_id: 'old-sha', body: 'Looks good' }] } as Response;
      return base.fetchFn(url, init);
    }) as FetchFn;
    const result = await fetchCompletionEvidence('token', issueUrl, now, fetchFn);
    expect(result.comments.status === 'read' && result.comments.value).toHaveLength(100);
    expect(result.reviews?.[0]).toMatchObject({ revision: 'abc123', observation: { status: 'read', value: [{ author: 'reviewer', revision: 'old-sha', state: 'APPROVED' }] } });
  });

  it('follows advertised short pages and refuses an unexpected or cursor-based next page', async () => {
    for (const target of ['https://api.github.com/repos/example/repo/issues/5/comments?per_page=100&page=2', 'https://api.github.com/repos/example/other/issues/5/comments?per_page=100&page=2', 'https://api.github.com/repos/example/repo/issues/5/comments?per_page=100&after=cursor']) {
      const base = fixture();
      const fetchFn = (async (url: string, init?: RequestInit) => {
        if (url.includes('/comments')) {
          const first = url.endsWith('page=1');
          return { ok: true, status: 200, headers: new Headers(first ? { link: `<${target}>; rel="next"` } : {}), json: async () => first ? [claim(1, 'first')] : [claim(2, 'second')] } as Response;
        }
        return base.fetchFn(url, init);
      }) as FetchFn;
      const result = await fetchCompletionEvidence('token', issueUrl, now, fetchFn);
      if (target.endsWith('page=2') && target.includes('/example/repo/')) expect(result.comments).toMatchObject({ status: 'read', value: [{ body: 'first' }, { body: 'second' }] });
      else expect(result.comments).toMatchObject({ status: 'unavailable', error: { code: 'github.err.evidence-incomplete' } });
    }
  });

  it('bounds concurrent PR and review observations without dropping or reordering results', async () => {
    let activePulls = 0, activeReviews = 0, maxPulls = 0, maxReviews = 0;
    const events = Array.from({ length: 9 }, (_, index) => ({ event: 'cross-referenced', source: { issue: { number: index + 1, title: `PR ${index + 1}`, html_url: `https://github.com/example/repo/pull/${index + 1}`, repository_url: 'https://api.github.com/repos/example/repo', pull_request: {} } } }));
    const fetchFn = (async (url: string) => {
      const reply = (json: unknown) => ({ ok: true, status: 200, json: async () => json }) as Response;
      if (url.includes('/timeline')) return reply(events);
      if (url.includes('/comments')) return reply([]);
      if (url.endsWith('/graphql')) return reply({ data: { repository: { pullRequest: { closingIssuesReferences: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } });
      if (url.includes('/check-runs')) return reply({ total_count: 0, check_runs: [] });
      if (url.includes('/status?')) return reply({ total_count: 0, statuses: [], state: 'pending' });
      if (url.includes('/reviews')) {
        activeReviews++; maxReviews = Math.max(maxReviews, activeReviews);
        await new Promise((resolve) => setTimeout(resolve, 5)); activeReviews--;
        return reply([]);
      }
      if (/\/pulls\/\d+$/.test(url)) {
        activePulls++; maxPulls = Math.max(maxPulls, activePulls);
        await new Promise((resolve) => setTimeout(resolve, 5)); activePulls--;
        return reply({ state: 'closed', merged_at: '2026-11-27T00:00:00Z', body: '', head: { sha: 'abc123' } });
      }
      return reply(issue);
    }) as FetchFn;
    const result = await fetchCompletionEvidence('token', issueUrl, now, fetchFn);
    expect(result.pulls.status).toBe('read');
    if (result.pulls.status === 'read') expect(result.pulls.value.map((pull) => pull.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.reviews).toHaveLength(9);
    expect(maxPulls).toBeLessThanOrEqual(4);
    expect(maxReviews).toBeLessThanOrEqual(4);
    expect(maxPulls).toBeGreaterThan(1);
  });
});

describe('all-state pull inventory', () => {
  it('follows an advertised short page and keeps open and closed candidates', async () => {
    const pulls = [1, 2].map((number) => ({ number, title: `PR ${number}`, html_url: `https://github.com/example/repo/pull/${number}`, body: null, head: { ref: `task-00${number}` } }));
    const fetchFn = (async (url: string) => {
      const first = url.endsWith('page=1');
      return { ok: true, status: 200, headers: new Headers(first ? { link: '<https://api.github.com/repos/example/repo/pulls?state=all&per_page=100&page=2>; rel="next"' } : {}), json: async () => first ? [pulls[0]] : [pulls[1]] } as Response;
    }) as FetchFn;
    expect(await fetchPullInventory('t', 'example/repo', fetchFn)).toMatchObject({ status: 'read', value: [{ number: 1 }, { number: 2 }] });
  });

  it('fails closed when a next page changes the state filter', async () => {
    const fetchFn = (async () => ({ ok: true, status: 200, headers: new Headers({ link: '<https://api.github.com/repos/example/repo/pulls?state=closed&per_page=100&page=2>; rel="next"' }), json: async () => [] })) as unknown as FetchFn;
    expect(await fetchPullInventory('t', 'example/repo', fetchFn)).toMatchObject({ status: 'unavailable', error: { code: 'github.err.evidence-incomplete' } });
  });

  it('verifies a numeric repository link before reading the next page', async () => {
    for (const fullName of ['example/repo', 'example/other']) {
      const fetchFn = (async (url: string) => {
        if (url === 'https://api.github.com/repos/example/repo') return { ok: true, status: 200, json: async () => ({ id: 123, full_name: fullName }) } as Response;
        const first = url.endsWith('page=1');
        return { ok: true, status: 200, headers: new Headers(first ? { link: '<https://api.github.com/repositories/123/pulls?state=all&per_page=100&page=2>; rel="next"' } : {}), json: async () => [] } as Response;
      }) as FetchFn;
      const result = await fetchPullInventory('t', 'example/repo', fetchFn);
      expect(result.status).toBe(fullName === 'example/repo' ? 'read' : 'unavailable');
    }
  });
});
