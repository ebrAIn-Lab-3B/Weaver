import { describe, expect, it } from 'vitest';
import type { Fetch } from '@ebrain-lab/weaver-github';
import { hasTaskTitleCandidate, taskIssueCandidates, taskIssueInventory, taskPullInventory } from '../src/taskIssueInventory';
import { registrationMarker, taskReservationRefs } from '../src/taskReservation';

describe('repository task Issue inventory', () => {
  it('continues a short page when the Link header identifies the next page', async () => {
    const calls: string[] = [];
    const fetchImpl: Fetch = async (url) => {
      calls.push(url);
      const second = url.includes('page=2');
      return { ok: true, status: 200, headers: { get: () => second ? null : `<${url.replace('&page=1', '&page=2')}>; rel="next"` }, json: async () => [{ title: second ? '[TASK-002] second' : '[TASK-001] first' }] };
    };
    expect(await taskIssueInventory('t', 'owner/repo', fetchImpl)).toEqual(['[TASK-001] first', '[TASK-002] second']);
    expect(calls).toHaveLength(2);
  });

  it('rejects an unexpected next-page target', async () => {
    const fetchImpl: Fetch = async () => ({ ok: true, status: 200, headers: { get: () => '<https://other.example/page?page=2>; rel="next"' }, json: async () => [] });
    await expect(taskIssueInventory('t', 'owner/repo', fetchImpl)).rejects.toThrow('Unexpected pagination link');
  });

  it('confirms a numeric repository identity and follows the returned cursor', async () => {
    const seen: string[] = [];
    const fetchImpl: Fetch = async (url) => {
      seen.push(url);
      if (url.endsWith('/repos/owner/repo')) return { ok: true, status: 200, json: async () => ({ id: 42, full_name: 'owner/repo' }) };
      if (url.includes('/repositories/42/')) return { ok: true, status: 200, json: async () => [{ title: '[TASK-002] second' }] };
      return { ok: true, status: 200, headers: { get: () => '<https://api.github.com/repositories/42/issues?state=all&per_page=100&page=2&after=cursor>; rel="next"' }, json: async () => [{ title: '[TASK-001] first' }] };
    };
    expect(await taskIssueInventory('t', 'owner/repo', fetchImpl)).toEqual(['[TASK-001] first', '[TASK-002] second']);
    expect(seen[2]).toContain('after=cursor');
    const wrong: Fetch = async (url, init) => url.endsWith('/repos/owner/repo') ? { ok: true, status: 200, json: async () => ({ id: 43, full_name: 'owner/repo' }) } : fetchImpl(url, init);
    await expect(taskIssueInventory('t', 'owner/repo', wrong)).rejects.toThrow('Pagination repository mismatch');
  });

  it('does not fall back to numbered pages after a full cursor page without a next link', async () => {
    const fetchImpl: Fetch = async (url) => {
      if (url.endsWith('/repos/owner/repo')) return { ok: true, status: 200, json: async () => ({ id: 42, full_name: 'owner/repo' }) };
      if (url.includes('/repositories/42/')) return { ok: true, status: 200, json: async () => Array.from({ length: 100 }, () => ({ title: 'x' })) };
      return { ok: true, status: 200, headers: { get: () => '<https://api.github.com/repositories/42/issues?state=all&per_page=100&page=2&after=cursor>; rel="next"' }, json: async () => [] };
    };
    await expect(taskIssueInventory('t', 'owner/repo', fetchImpl)).rejects.toThrow('Pagination cursor incomplete');
  });
  it('constructs a valid GET request for the real Fetch API', async () => {
    await taskIssueInventory('token', 'owner/repo', async (url, init) => {
      const request = new Request(url, init);
      expect(request.method).toBe('GET');
      expect(request.body).toBeNull();
      return { ok: true, status: 200, json: async () => [] };
    });
  });
  it('reads every page and excludes pull requests', async () => {
    const calls: string[] = [];
    const fetchImpl: Fetch = async (url) => {
      calls.push(url);
      const items = calls.length === 1
        ? Array.from({ length: 100 }, (_, i) => ({ title: `[TASK-${String(i).padStart(3, '0')}] item` }))
        : [{ title: '[TASK-101] wanted' }, { title: '[TASK-102] pull', pull_request: {} }];
      return { ok: true, status: 200, json: async () => items };
    };
    const titles = await taskIssueInventory('token', 'owner/repo', fetchImpl);
    expect(calls).toHaveLength(2);
    expect(titles).toHaveLength(101);
    expect(hasTaskTitleCandidate(titles, 'Wanted')).toBe(true);
    expect(hasTaskTitleCandidate(titles, 'pull')).toBe(false);
  });

  it('rejects incomplete, inaccessible and malformed inventories', async () => {
    for (const response of [
      { ok: false, status: 403, json: async () => ({}) },
      { ok: true, status: 200, json: async () => [{ number: 1 }] },
      { ok: true, status: 200, json: async () => Array.from({ length: 100 }, () => ({ title: 'x' })) },
    ]) {
      await expect(taskIssueInventory('token', 'owner/repo', async () => response)).rejects.toThrow();
    }
  });
});

describe('Issue candidates for an uncertain create', () => {
  it('reads a later short page for a matching candidate', async () => {
    const fetchImpl: Fetch = async (url) => {
      const second = url.includes('page=2');
      return { ok: true, status: 200, headers: { get: () => second ? null : `<${url.replace('&page=1', '&page=2')}>; rel="next"` }, json: async () => second ? [{ title: '[TASK-001] Title', html_url: 'https://github.com/owner/repo/issues/1', body: null }] : [] };
    };
    expect(await taskIssueCandidates('t', 'owner/repo', 'Title', 'ref', fetchImpl)).toHaveLength(1);
  });
  it('returns all matching URLs and identifies the matching operation marker', async () => {
    const operation = taskReservationRefs('owner/repo', 'REQ-001', undefined, undefined, 'Title', 'TASK-001').operation;
    const fetchImpl: Fetch = async () => ({ ok: true, status: 200, json: async () => [
      { title: '[TASK-001] Title', html_url: 'https://github.com/owner/repo/issues/1', body: registrationMarker(operation, 'TASK-001') },
      { title: '[TASK-002] Title', html_url: 'https://github.com/owner/repo/issues/2', body: null },
    ] });
    expect(await taskIssueCandidates('t', 'owner/repo', 'Title', operation, fetchImpl)).toEqual([
      { task: 'TASK-001', url: 'https://github.com/owner/repo/issues/1', markerMatches: true },
      { task: 'TASK-002', url: 'https://github.com/owner/repo/issues/2', markerMatches: false },
    ]);
  });

  it('does not report candidates from an incomplete page', async () => {
    const fetchImpl: Fetch = async () => ({ ok: true, status: 200, json: async () => [{ title: '[TASK-001] Title', body: '' }] });
    await expect(taskIssueCandidates('t', 'owner/repo', 'Title', 'ref', fetchImpl)).rejects.toThrow();
  });
});

describe('repository PR inventory', () => {
  it('reads a later short page when the host advertises it', async () => {
    const fetchImpl: Fetch = async (url) => {
      const second = url.includes('page=2');
      return { ok: true, status: 200, headers: { get: () => second ? null : `<${url.replace('&page=1', '&page=2')}>; rel="next"` }, json: async () => second ? [{ title: 'TASK-131', head: { ref: 'task-131' } }] : [] };
    };
    expect(await taskPullInventory('t', 'owner/repo', fetchImpl)).toContain('TASK-131');
  });
  it('constructs a valid GET request for the real Fetch API', async () => {
    await taskPullInventory('token', 'owner/repo', async (url, init) => {
      const request = new Request(url, init);
      expect(request.method).toBe('GET');
      expect(request.body).toBeNull();
      return { ok: true, status: 200, json: async () => [] };
    });
  });
  it('reads beyond 100 PRs and retains title and branch identity', async () => {
    let calls = 0;
    const titles = await taskPullInventory('token', 'owner/repo', async () => {
      calls += 1;
      const entries = calls === 1 ? Array.from({ length: 100 }, (_, i) => ({ title: `PR ${i}`, head: { ref: `branch-${i}` } })) : [{ title: 'TASK-131', head: { ref: 'task-131' } }];
      return { ok: true, status: 200, json: async () => entries };
    });
    expect(calls).toBe(2);
    expect(titles).toContain('TASK-131');
    expect(titles).toContain('task-131');
  });

  it('rejects a failed later page rather than returning partial results', async () => {
    let calls = 0;
    await expect(taskPullInventory('token', 'owner/repo', async () => {
      calls += 1;
      return calls === 1
        ? { ok: true, status: 200, json: async () => Array.from({ length: 100 }, () => ({ title: 'x', head: { ref: 'y' } })) }
        : { ok: false, status: 403, json: async () => ({}) };
    })).rejects.toThrow();
  });
});
