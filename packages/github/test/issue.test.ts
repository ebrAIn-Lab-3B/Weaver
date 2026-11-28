import { describe, expect, it } from 'vitest';
import { planMove } from '@ebrain-lab/weaver-markdown';
import { addIssueComment, applyMove, fetchCandidatePullEvidence, fetchEvidence, fetchIssue, fetchPull, hasIssueComment, setBoardStatus, setIssueAssignees, type FetchFn } from '../src';

const ISSUE = 'https://github.com/me/Weaver/issues/5';

type Call = { method: string; url: string; body?: unknown };

/** A fetch that answers by route and remembers every call. */
function routes(answer: (call: Call) => { status?: number; json?: unknown }) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init?: { method?: string; body?: string }) => {
    const call: Call = { method: init?.method ?? 'GET', url, ...(init?.body ? { body: JSON.parse(init.body) } : {}) };
    calls.push(call);
    const reply = answer(call);
    const status = reply.status ?? 200;
    return { ok: status < 400, status, json: async () => reply.json ?? {} };
  }) as unknown as FetchFn;
  return { fetchFn, calls };
}

describe('fetchIssue', () => {
  it('refuses malformed state and incomplete labels instead of assuming an open Issue', async () => {
    const issue = { number: 5, title: 'T', html_url: ISSUE, state: 'open', labels: [{ name: 'task' }] };
    for (const change of [{ state: undefined }, { state: 'unknown' }, { labels: [{ name: null }] }, { number: 0 }, { assignees: [{}] }]) {
      const result = await fetchIssue('t', ISSUE, routes(() => ({ json: { ...issue, ...change } })).fetchFn);
      expect(result).toMatchObject({ ok: false, error: { code: 'github.err.issue-incomplete' } });
    }
  });
  it('reads the number, title, state, labels, and assignees', async () => {
    const { fetchFn } = routes(() => ({
      json: { number: 5, title: 'T', html_url: ISSUE, state: 'open', labels: [{ name: 'task' }, 'status:review'], assignees: [{ login: 'me' }] },
    }));
    const result = await fetchIssue('t', ISSUE, fetchFn);
    expect(result).toEqual({ ok: true, issue: { number: 5, title: 'T', url: ISSUE, state: 'open', labels: ['task', 'status:review'], assignees: ['me'] } });
  });

  it('turns a missing Issue, a bad address, and a network failure into notices', async () => {
    expect(await fetchIssue('t', ISSUE, routes(() => ({ status: 404 })).fetchFn)).toMatchObject({ ok: false, error: { code: 'github.err.not-found' } });
    expect(await fetchIssue('t', 'nope', routes(() => ({})).fetchFn)).toMatchObject({ ok: false, error: { code: 'github.err.not-issue-url' } });
    const broken = (async () => {
      throw new Error('offline');
    }) as unknown as FetchFn;
    expect(await fetchIssue('t', ISSUE, broken)).toMatchObject({ ok: false, error: { code: 'github.err.network' } });
  });
});

describe('applyMove', () => {
  const plan = planMove({ state: 'open', labels: ['task', 'status:review'] }, 'Verified');
  const answer = (call: Call) => {
    if (call.url.endsWith('/graphql')) {
      const query = (call.body as { query: string }).query;
      if (query.includes('projectItems(first:10){nodes{id project')) {
        return { json: { data: { repository: { issue: { projectItems: { nodes: [{ id: 'ITEM', project: { id: 'PROJECT', title: 'Board', field: { id: 'FIELD', options: [{ id: 'DONE', name: 'Done' }] } } }] } } } } } };
      }
      return { json: { data: {} } };
    }
    return {};
  };

  it('removes the old label, adds the new one, closes the Issue, and sets the board Status, in that order', async () => {
    const { fetchFn, calls } = routes(answer);
    const steps = await applyMove('t', ISSUE, plan, fetchFn);
    expect(steps.every((s) => s.ok)).toBe(true);
    expect(calls.map((c) => `${c.method} ${c.url.replace('https://api.github.com', '')}`)).toEqual([
      'DELETE /repos/me/Weaver/issues/5/labels/status%3Areview',
      'POST /repos/me/Weaver/issues/5/labels',
      'PATCH /repos/me/Weaver/issues/5',
      'POST /graphql',
      'POST /graphql',
    ]);
    expect(calls[1].body).toEqual({ labels: ['status:verified'] });
    expect(calls[2].body).toEqual({ state: 'closed', state_reason: 'completed' });
    expect(calls[4].body).toMatchObject({ variables: { p: 'PROJECT', i: 'ITEM', f: 'FIELD', o: 'DONE' } });
  });

  it('stops at the first failure and reports the steps that ran', async () => {
    const { fetchFn, calls } = routes((call) => (call.method === 'POST' && call.url.endsWith('/labels') ? { status: 403 } : answer(call)));
    const steps = await applyMove('t', ISSUE, plan, fetchFn);
    expect(steps.map((s) => s.ok)).toEqual([true, false]);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('skips the board step for an Issue that is not on a board', async () => {
    const { fetchFn } = routes((call) => (call.url.endsWith('/graphql') ? { json: { data: { repository: { issue: { projectItems: { nodes: [] } } } } } } : {}));
    const steps = await applyMove('t', ISSUE, plan, fetchFn);
    expect(steps[steps.length - 1]).toMatchObject({ ok: true, skipped: true });
  });
});

describe('fetchEvidence', () => {
  it('finds the pull requests that reference the Issue and how they stand', async () => {
    const { fetchFn } = routes((call) => {
      if (call.url.includes('/timeline')) {
        return {
          json: [
            {
              event: 'cross-referenced',
              source: { issue: { number: 7, title: 'feat: five', html_url: 'https://github.com/me/Weaver/pull/7', repository_url: 'https://api.github.com/repos/me/Weaver', pull_request: {} } },
            },
          ],
        };
      }
      if (call.url.endsWith('/pulls/7')) return { json: { state: 'closed', merged_at: '2026-11-01T00:00:00Z', body: 'Closes #5', head: { sha: 'abc' } } };
      if (call.url.endsWith('/graphql')) return { json: { data: { repository: { pullRequest: { closingIssuesReferences: { nodes: [{ number: 5, repository: { nameWithOwner: 'me/Weaver' } }], pageInfo: { hasNextPage: false, endCursor: null } } } } } } };
      return { json: { total_count: 1, check_runs: [{ status: 'completed', conclusion: 'success' }] } };
    });
    const result = await fetchEvidence('t', ISSUE, fetchFn);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence.pulls).toMatchObject([{ number: 7, state: 'merged', link: 'closes', textClaimsClosing: true, revision: 'abc' }]);
  });

  it('distinguishes a text claim from a complete, repository-qualified closing association and an unavailable read', async () => {
    const base = (relationship: unknown) => routes((call) => {
      if (call.url.includes('/timeline')) return { json: [{ event: 'cross-referenced', source: { issue: { number: 7, title: 'feat', html_url: 'https://github.com/me/Weaver/pull/7', repository_url: 'https://api.github.com/repos/me/Weaver', pull_request: {} } } }] };
      if (call.url.endsWith('/pulls/7')) return { json: { state: 'closed', merged_at: '2026-11-01T00:00:00Z', body: 'Closes #5', head: { sha: 'abc' } } };
      if (call.url.endsWith('/graphql')) return { json: relationship };
      return { json: { total_count: 0, check_runs: [] } };
    }).fetchFn;
    const other = { data: { repository: { pullRequest: { closingIssuesReferences: { nodes: [{ number: 5, repository: { nameWithOwner: 'other/repo' } }], pageInfo: { hasNextPage: false, endCursor: null } } } } } };
    const nonClosing = await fetchEvidence('t', ISSUE, base(other));
    expect(nonClosing).toMatchObject({ ok: true, evidence: { pulls: [{ link: 'mentions', textClaimsClosing: true, checks: 'none' }] } });
    const unavailable = await fetchEvidence('t', ISSUE, base({ errors: [{ message: 'forbidden' }] }));
    expect(unavailable).toMatchObject({ ok: true, evidence: { pulls: [{ link: 'unknown', textClaimsClosing: true }] } });
    const truncated = { data: { repository: { pullRequest: { closingIssuesReferences: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } } } } } };
    expect(await fetchEvidence('t', ISSUE, base(truncated))).toMatchObject({ ok: true, evidence: { pulls: [{ link: 'unknown' }] } });
  });

  it('follows closing-reference pages before reporting a missing association', async () => {
    const { fetchFn, calls } = routes((call) => {
      if (call.url.includes('/timeline')) return { json: [{ event: 'cross-referenced', source: { issue: { number: 7, title: 'feat', html_url: 'https://github.com/me/Weaver/pull/7', repository_url: 'https://api.github.com/repos/me/Weaver', pull_request: {} } } }] };
      if (call.url.endsWith('/pulls/7')) return { json: { state: 'closed', merged_at: '2026-11-01T00:00:00Z', body: '', head: { sha: 'abc' } } };
      if (call.url.endsWith('/graphql')) {
        const after = (call.body as { variables: { after: string | null } }).variables.after;
        const refs = after === null ? { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'next' } } : { nodes: [{ number: 5, repository: { nameWithOwner: 'me/Weaver' } }], pageInfo: { hasNextPage: false, endCursor: null } };
        return { json: { data: { repository: { pullRequest: { closingIssuesReferences: refs } } } } };
      }
      return { json: { total_count: 0, check_runs: [] } };
    });
    expect(await fetchEvidence('t', ISSUE, fetchFn)).toMatchObject({ ok: true, evidence: { pulls: [{ link: 'closes' }] } });
    expect(calls.filter((call) => call.url.endsWith('/graphql'))).toHaveLength(2);
  });

  it('refuses to infer evidence from a truncated timeline or check-run list', async () => {
    const timeline = routes(() => ({ json: Array.from({ length: 100 }, () => ({ event: 'commented' })) }));
    expect(await fetchEvidence('t', ISSUE, timeline.fetchFn)).toMatchObject({ ok: false, error: { code: 'github.err.evidence-incomplete' } });
    const checks = routes((call) => {
      if (call.url.includes('/timeline')) return { json: [{ event: 'cross-referenced', source: { issue: { number: 7, title: 'feat', html_url: 'https://github.com/me/Weaver/pull/7', repository_url: 'https://api.github.com/repos/me/Weaver', pull_request: {} } } }] };
      if (call.url.endsWith('/pulls/7')) return { json: { state: 'closed', merged_at: '2026-11-01T00:00:00Z', body: '', head: { sha: 'abc' } } };
      return { json: { total_count: 2, check_runs: [{ status: 'completed', conclusion: 'success' }] } };
    });
    expect(await fetchEvidence('t', ISSUE, checks.fetchFn)).toMatchObject({ ok: false, error: { code: 'github.err.evidence-incomplete' } });
  });

  it('reads an advertised short timeline page and rejects unexpected next links', async () => {
    for (const next of ['https://api.github.com/repos/me/Weaver/issues/5/timeline?per_page=100&page=2', 'https://api.github.com/repos/me/other/issues/5/timeline?per_page=100&page=2']) {
      const base = routes(() => ({ json: { total_count: 0, check_runs: [] } })).fetchFn;
      const fetchFn = (async (url: string, init?: RequestInit) => {
        if (url.includes('/timeline')) {
          const first = url.endsWith('page=1');
          return { ok: true, status: 200, headers: new Headers(first ? { link: `<${next}>; rel="next"` } : {}), json: async () => [{ event: 'commented' }] } as Response;
        }
        return base(url, init);
      }) as FetchFn;
      const result = await fetchEvidence('t', ISSUE, fetchFn);
      expect(result.ok).toBe(next.includes('/me/Weaver/'));
      if (!result.ok) expect(result.error.code).toBe('github.err.evidence-incomplete');
    }
  });

  it('turns a failed call into a notice', async () => {
    const result = await fetchEvidence('t', ISSUE, routes(() => ({ status: 500 })).fetchFn);
    expect(result).toMatchObject({ ok: false, error: { code: 'github.err.http' } });
  });

  it('does not hide inaccessible or inconsistent cross-reference identity', async () => {
    const missing = routes(() => ({ json: [{ event: 'cross-referenced', source: {} }] }));
    expect(await fetchEvidence('t', ISSUE, missing.fetchFn)).toMatchObject({ ok: false, error: { code: 'github.err.evidence-incomplete' } });
    const mismatch = routes(() => ({ json: [{ event: 'cross-referenced', source: { issue: { number: 7, title: 'work', html_url: 'https://github.com/other/repo/pull/7', repository_url: 'https://api.github.com/repos/me/Weaver', pull_request: {} } } }] }));
    expect(await fetchEvidence('t', ISSUE, mismatch.fetchFn)).toMatchObject({ ok: false, error: { code: 'github.err.evidence-incomplete' } });
  });
});

describe('candidate pull evidence', () => {
  it('retains an unmerged PR state without treating candidate discovery as a timeline reference', async () => {
    const { fetchFn } = routes((call) => {
      if (call.url.endsWith('/pulls/9')) return { json: { state: 'open', merged_at: null, body: 'work', head: { sha: 'abc' } } };
      if (call.url.endsWith('/graphql')) return { json: { data: { repository: { pullRequest: { closingIssuesReferences: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } } };
      return { json: { total_count: 0, check_runs: [] } };
    });
    expect(await fetchCandidatePullEvidence('t', ISSUE, { title: 'work (TASK-005)', url: 'https://github.com/me/Weaver/pull/9' }, fetchFn)).toMatchObject({ ok: true, pull: { state: 'open', checks: 'none', link: 'mentions', revision: 'abc' } });
  });
});

describe('fetchPull and addIssueComment', () => {
  it('says whether a pull request was merged', async () => {
    const merged = routes(() => ({ json: { number: 7, title: 'feat', html_url: 'https://github.com/me/Weaver/pull/7', merged_at: '2026-11-01T00:00:00Z' } }));
    expect(await fetchPull('t', 'me/Weaver', 7, merged.fetchFn)).toEqual({ number: 7, title: 'feat', url: 'https://github.com/me/Weaver/pull/7', merged: true });
    const open = routes(() => ({ json: { number: 8, title: 'wip', html_url: 'u', merged_at: null } }));
    expect((await fetchPull('t', 'me/Weaver', 8, open.fetchFn)).merged).toBe(false);
  });

  it('fails with what GitHub answered', async () => {
    await expect(fetchPull('t', 'me/Weaver', 9, routes(() => ({ status: 404 })).fetchFn)).rejects.toThrow('#9 of me/Weaver was not found');
    await expect(fetchPull('t', 'me/Weaver', 9, routes(() => ({ status: 500 })).fetchFn)).rejects.toThrow('500');
  });

  it('posts a comment to the Issue', async () => {
    const { fetchFn, calls } = routes(() => ({ status: 201 }));
    await addIssueComment('t', 'me/Weaver', 5, 'hello', fetchFn);
    expect(calls).toEqual([{ method: 'POST', url: 'https://api.github.com/repos/me/Weaver/issues/5/comments', body: { body: 'hello' } }]);
    await expect(addIssueComment('t', 'me/Weaver', 5, 'x', routes(() => ({ status: 403 })).fetchFn)).rejects.toThrow('403');
  });
});

describe('setBoardStatus and hasIssueComment', () => {
  const items = (options: { name: string }[]) => ({
    json: { data: { repository: { issue: { projectItems: { nodes: [{ id: 'ITEM', project: { id: 'PROJECT', title: 'Board', field: { id: 'FIELD', options: options.map((o, i) => ({ id: `O${i}`, name: o.name })) } } }] } } } } },
  });

  it('sets the Status on the board the Issue is on', async () => {
    const { fetchFn, calls } = routes((call) => ((call.body as { query?: string } | undefined)?.query?.includes('projectItems(first:10){nodes{id project') ? items([{ name: 'Todo' }, { name: 'Done' }]) : { json: { data: {} } }));
    const notice = await setBoardStatus('t', ISSUE, 'Done', fetchFn);
    expect(notice).toMatchObject({ code: 'step.updated-boards' });
    expect(calls[1].body).toMatchObject({ variables: { p: 'PROJECT', i: 'ITEM', f: 'FIELD', o: 'O1' } });
  });

  it('has nothing to set for an Issue on no board, and fails when the board has no such option', async () => {
    const none = routes(() => ({ json: { data: { repository: { issue: { projectItems: { nodes: [] } } } } } }));
    expect(await setBoardStatus('t', ISSUE, 'Done', none.fetchFn)).toEqual({ code: 'step.skipped-no-board' });
    const noOption = routes(() => items([{ name: 'Todo' }]));
    await expect(setBoardStatus('t', ISSUE, 'Done', noOption.fetchFn)).rejects.toThrow();
    await expect(setBoardStatus('t', 'nope', 'Done', none.fetchFn)).rejects.toThrow();
  });

  it('finds a marker among the comments of an Issue', async () => {
    const { fetchFn, calls } = routes(() => ({ json: [{ body: 'hello' }, { body: 'note <!-- weaver:pull-7 -->' }] }));
    expect(await hasIssueComment('t', 'me/Weaver', 5, '<!-- weaver:pull-7 -->', fetchFn)).toBe(true);
    expect(await hasIssueComment('t', 'me/Weaver', 5, '<!-- weaver:pull-8 -->', fetchFn)).toBe(false);
    expect(calls[0].url).toContain('/repos/me/Weaver/issues/5/comments');
    await expect(hasIssueComment('t', 'me/Weaver', 5, 'x', routes(() => ({ status: 500 })).fetchFn)).rejects.toThrow('500');
  });
});

describe('setIssueAssignees', () => {
  it('sets the assignees of the Issue', async () => {
    const { fetchFn, calls } = routes(() => ({ json: { assignees: [{ login: 'Maria-Dev' }] } }));
    await setIssueAssignees('t', 'me/Weaver', 5, ['maria-dev'], fetchFn);
    expect(calls).toEqual([{ method: 'PATCH', url: 'https://api.github.com/repos/me/Weaver/issues/5', body: { assignees: ['maria-dev'] } }]);
  });

  it('fails when GitHub quietly dropped a login, and when the call is refused', async () => {
    await expect(setIssueAssignees('t', 'me/Weaver', 5, ['stranger'], routes(() => ({ json: { assignees: [] } })).fetchFn)).rejects.toThrow('stranger');
    await expect(setIssueAssignees('t', 'me/Weaver', 5, ['x'], routes(() => ({ status: 403 })).fetchFn)).rejects.toThrow('403');
  });

  it('can clear the assignees', async () => {
    const { fetchFn, calls } = routes(() => ({ json: { assignees: [] } }));
    await setIssueAssignees('t', 'me/Weaver', 5, [], fetchFn);
    expect(calls[0].body).toEqual({ assignees: [] });
  });
});
