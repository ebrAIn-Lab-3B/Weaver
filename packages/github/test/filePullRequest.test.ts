import { describe, expect, it } from 'vitest';
import { filePullRequestOpen, openFilePullRequest, type FetchFn } from '../src';

type Call = { method: string; url: string; body?: unknown; headers: Record<string, string> };

const REPO = 'https://api.github.com/repos/o/r';

/**
 * GitHub as a double. The answer for the repository's own address is kept apart (`repository`),
 * because that address is the beginning of every other one.
 */
function api(answers: Record<string, { status?: number; body?: unknown }>, repository?: { status?: number; body?: unknown }) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(init.body) : undefined, headers: init?.headers ?? {} });
    const key = Object.keys(answers).find((k) => `${method} ${url}`.includes(k));
    const answer = method === 'GET' && url === REPO && repository ? repository : key ? answers[key] : { status: 404, body: { message: 'Not Found' } };
    const status = answer.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => answer.body ?? {} };
  }) as unknown as FetchFn;
  return { fetchFn, calls };
}

const file = { path: '.weaver/process.yaml', content: 'version: 1\n', branch: 'docs/weaver-process-file', title: 'T', body: 'B', commitMessage: 'M' };
const repository = { body: { default_branch: 'trunk' } };
const happy = {
  'git/ref/heads/trunk': { body: { object: { sha: 'abc' } } },
  [`POST ${REPO}/git/refs`]: { status: 201 },
  [`PUT ${REPO}/contents/.weaver/process.yaml`]: { status: 201 },
  [`POST ${REPO}/pulls`]: { status: 201, body: { number: 9, html_url: 'https://github.com/o/r/pull/9' } },
};

describe('openFilePullRequest', () => {
  it('cuts a branch from the default branch, commits the file to it, and opens the pull request', async () => {
    const { fetchFn, calls } = api(happy, repository);
    expect(await openFilePullRequest('tok', 'o/r', file, fetchFn)).toEqual({ number: 9, url: 'https://github.com/o/r/pull/9' });
    expect(calls.map((c) => `${c.method} ${c.url.replace(REPO, '')}`)).toEqual([
      'GET ',
      'GET /git/ref/heads/trunk',
      'POST /git/refs',
      'PUT /contents/.weaver/process.yaml',
      'POST /pulls',
    ]);
    expect(calls[2].body).toEqual({ ref: 'refs/heads/docs/weaver-process-file', sha: 'abc' });
    expect(calls[3].body).toEqual({ message: 'M', content: Buffer.from('version: 1\n').toString('base64'), branch: 'docs/weaver-process-file' });
    expect(calls[4].body).toEqual({ title: 'T', head: 'docs/weaver-process-file', base: 'trunk', body: 'B' });
    expect(calls[0].headers.Authorization).toBe('Bearer tok');
  });

  it('never writes to the default branch', async () => {
    const { fetchFn, calls } = api(happy, repository);
    await openFilePullRequest('t', 'o/r', file, fetchFn);
    for (const call of calls.filter((c) => c.method !== 'GET')) expect(JSON.stringify(call.body)).not.toContain('"branch":"trunk"');
  });

  it('stops with the reason GitHub gives when the sign-in cannot write, and opens nothing', async () => {
    const { fetchFn, calls } = api({ ...happy, [`POST ${REPO}/git/refs`]: { status: 403, body: { message: 'Resource not accessible' } } }, repository);
    await expect(openFilePullRequest('t', 'o/r', file, fetchFn)).rejects.toMatchObject({ notice: { code: 'github.err.http-detail' } });
    expect(calls.some((c) => c.url.endsWith('/pulls'))).toBe(false);
  });

  it('reports a rejected sign-in', async () => {
    const { fetchFn } = api({}, { status: 401 });
    await expect(openFilePullRequest('t', 'o/r', file, fetchFn)).rejects.toMatchObject({ notice: { code: 'github.err.unauthorized' } });
  });
});

describe('filePullRequestOpen', () => {
  it('is true when a pull request from the branch is open', async () => {
    const { fetchFn, calls } = api({ pulls: { body: [{ head: { ref: 'docs/weaver-process-file' } }] } });
    expect(await filePullRequestOpen('t', 'o/r', 'docs/weaver-process-file', fetchFn)).toBe(true);
    expect(calls[0].url).toContain('head=o%3Adocs%2Fweaver-process-file');
  });

  it('is false for none, and for a list that cannot be read', async () => {
    expect(await filePullRequestOpen('t', 'o/r', 'b', api({ pulls: { body: [] } }).fetchFn)).toBe(false);
    expect(await filePullRequestOpen('t', 'o/r', 'b', api({ pulls: { status: 500 } }).fetchFn)).toBe(false);
  });
});
