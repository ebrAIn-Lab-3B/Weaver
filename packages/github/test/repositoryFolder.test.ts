import { describe, expect, it } from 'vitest';
import { listRepositoryFolder, openFilesChangePullRequest, taskFileState, type FetchFn } from '../src';

type Call = { method: string; url: string; body?: unknown };

/** GitHub as a double: the first key that the request contains is the answer; anything else is 404. */
function github(answers: [string, { status?: number; body?: unknown } | 'offline'][]) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(init.body) : undefined });
    const found = answers.find(([key]) => `${method} ${url}`.includes(key));
    const answer = found ? found[1] : { status: 404, body: { message: 'Not Found' } };
    if (answer === 'offline') throw new Error('offline');
    const status = answer.status ?? 200;
    return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => answer.body ?? {}, text: async () => (typeof answer.body === 'string' ? answer.body : '') };
  }) as unknown as FetchFn;
  return { fetchFn, calls };
}

const REPO = 'https://api.github.com/repos/o/r';

describe('listRepositoryFolder', () => {
  it('lists the files of a folder and leaves out its sub-folders', async () => {
    const { fetchFn } = github([['/contents/docs/requirements', { body: [{ type: 'file', name: 'REQ-001-a.md' }, { type: 'dir', name: 'old' }, { type: 'file', name: 'REQ-002-b.md' }] }]]);
    expect(await listRepositoryFolder('t', 'o/r', 'docs/requirements', fetchFn)).toEqual({ status: 'read', names: ['REQ-001-a.md', 'REQ-002-b.md'] });
  });

  it('says missing for a folder that is not there, and failed for a failure, never throwing', async () => {
    expect(await listRepositoryFolder('t', 'o/r', 'docs/requirements', github([]).fetchFn)).toEqual({ status: 'missing' });
    expect(await listRepositoryFolder('t', 'o/r', 'x', github([['/contents/x', { status: 500 }]]).fetchFn)).toMatchObject({ status: 'failed', error: { code: 'github.err.http', args: { status: 500 } } });
    expect(await listRepositoryFolder('t', 'o/r', 'x', github([['/contents/x', 'offline']]).fetchFn)).toMatchObject({ status: 'failed', error: { code: 'github.err.network' } });
  });

  it('says missing when the path is a file and not a folder', async () => {
    expect(await listRepositoryFolder('t', 'o/r', 'README.md', github([['/contents/README.md', { body: { type: 'file' } }]]).fetchFn)).toEqual({ status: 'missing' });
  });
});

describe('taskFileState (DEC-024 item 1)', () => {
  it('says the file is on GitHub when it is there, absent when it is not, and unknown when GitHub cannot be asked', async () => {
    const there = github([['/contents/docs/tasks/TASK-098.md', { body: 'text' }]]);
    expect(await taskFileState('t', 'o/r', 'TASK-098', 'docs/tasks', there.fetchFn)).toBe('on-github');
    expect(there.calls[0].url).toBe(`${REPO}/contents/docs/tasks/TASK-098.md`);
    expect(await taskFileState('t', 'o/r', 'TASK-098', 'docs/tasks', github([]).fetchFn)).toBe('absent');
    expect(await taskFileState('t', 'o/r', 'TASK-098', 'docs/tasks', github([['/contents/', 'offline']]).fetchFn)).toBe('unknown');
    expect(await taskFileState('t', 'o/r', 'TASK-098', 'docs/tasks', github([['/contents/', { status: 500 }]]).fetchFn)).toBe('unknown');
  });

  it('asks in the task folder it is given', async () => {
    const { fetchFn, calls } = github([]);
    await taskFileState('t', 'o/r', 'TASK-007', 'work/tasks', fetchFn);
    expect(calls[0].url).toBe(`${REPO}/contents/work/tasks/TASK-007.md`);
  });
});

describe('openFilesChangePullRequest', () => {
  const change = {
    files: [
      { path: 'docs/tasks/TASK-098.md', content: 'task\n' },
      { path: 'docs/requirements/REQ-018-x.md', content: 'requirement\n' },
    ],
    branch: 'docs/task-098-from-the-card',
    title: 'T',
    body: 'B',
    commitMessage: 'M',
  };
  const flow = (existing: Record<string, string | undefined>) =>
    github([
      ['git/ref/heads/main', { body: { object: { sha: 'abc' } } }],
      ['POST https://api.github.com/repos/o/r/git/refs', { status: 201 }],
      ...Object.entries(existing).map(([path, sha]): [string, { status?: number; body?: unknown }] => [`GET ${REPO}/contents/${path}?ref=`, sha ? { body: { sha } } : { status: 404, body: { message: 'Not Found' } }]),
      ['PUT ', { status: 201 }],
      [`POST ${REPO}/pulls`, { status: 201, body: { number: 12, html_url: 'https://github.com/o/r/pull/12' } }],
      [`GET ${REPO}`, { body: { default_branch: 'main' } }],
    ]);

  it('adds a new file and changes an existing one against its version, then opens the pull request', async () => {
    const { fetchFn, calls } = flow({ 'docs/tasks/TASK-098.md': undefined, 'docs/requirements/REQ-018-x.md': 'sha-of-req' });
    expect(await openFilesChangePullRequest('t', 'o/r', change, fetchFn)).toEqual({ number: 12, url: 'https://github.com/o/r/pull/12' });
    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(2);
    expect(puts[0].body).toEqual({ message: 'M', content: Buffer.from('task\n').toString('base64'), branch: 'docs/task-098-from-the-card' });
    expect(puts[1].body).toEqual({ message: 'M', content: Buffer.from('requirement\n').toString('base64'), branch: 'docs/task-098-from-the-card', sha: 'sha-of-req' });
    expect(calls[calls.length - 1]).toMatchObject({ method: 'POST', body: { title: 'T', head: 'docs/task-098-from-the-card', base: 'main', body: 'B' } });
  });

  it('writes only on its own branch, never on the default branch', async () => {
    const { fetchFn, calls } = flow({ 'docs/tasks/TASK-098.md': undefined, 'docs/requirements/REQ-018-x.md': 'sha' });
    await openFilesChangePullRequest('t', 'o/r', change, fetchFn);
    for (const call of calls.filter((c) => c.method !== 'GET')) expect(JSON.stringify(call.body)).not.toContain('"branch":"main"');
  });

  it('stops with the reason of GitHub, and opens no pull request, when a file cannot be written', async () => {
    const { fetchFn, calls } = github([
      ['git/ref/heads/main', { body: { object: { sha: 'abc' } } }],
      ['POST https://api.github.com/repos/o/r/git/refs', { status: 201 }],
      ['PUT ', { status: 403, body: { message: 'Resource not accessible' } }],
      [`GET ${REPO}`, { body: { default_branch: 'main' } }],
    ]);
    await expect(openFilesChangePullRequest('t', 'o/r', change, fetchFn)).rejects.toMatchObject({ notice: { code: 'github.err.http-detail' } });
    expect(calls.some((c) => c.url.endsWith('/pulls'))).toBe(false);
  });

  it('does not hide an error that is not "not found" when it looks for the version of a file', async () => {
    const { fetchFn } = github([
      ['git/ref/heads/main', { body: { object: { sha: 'abc' } } }],
      ['POST https://api.github.com/repos/o/r/git/refs', { status: 201 }],
      ['GET https://api.github.com/repos/o/r/contents/', { status: 500, body: { message: 'boom' } }],
      [`GET ${REPO}`, { body: { default_branch: 'main' } }],
    ]);
    await expect(openFilesChangePullRequest('t', 'o/r', change, fetchFn)).rejects.toMatchObject({ notice: { args: { status: 500 } } });
  });
});
