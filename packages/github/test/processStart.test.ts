import { describe, expect, it } from 'vitest';
import { memoryCopies, PROCESS_START_BRANCH, prepareProcessStart, processStartPullRequest, readGuideline, type FetchFn } from '../src';

const GUIDELINE_TEXT = 'version: 1\nstale:\n  idle-days: 30\n';
const guideline = { ref: { repository: 'org/base', path: '.weaver/process.yaml' }, source: 'root' as const };

/** GitHub as a double: the process file of each repository, and whether a pull request is open. */
function github(files: Record<string, string | 'offline'>, openPull = false) {
  const asked: string[] = [];
  const fetchFn = (async (url: string) => {
    asked.push(url);
    if (url.includes('/pulls?')) return { ok: true, status: 200, json: async () => (openPull ? [{ head: { ref: PROCESS_START_BRANCH } }] : []) };
    const repository = /\/repos\/([^/]+\/[^/]+)\/contents\//.exec(url)?.[1] ?? '';
    const file = files[repository];
    if (file === 'offline') throw new Error('offline');
    if (file === undefined) return { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => file };
  }) as unknown as FetchFn;
  return { fetchFn, asked };
}

const input = (fetchFn: FetchFn, extra: Partial<Parameters<typeof prepareProcessStart>[0]> = {}) => ({
  token: 't',
  repository: 'me/app',
  guideline: undefined,
  cards: [{ labels: ['status:ready'] }],
  fetchFn,
  ...extra,
});

describe('prepareProcessStart', () => {
  it('uses the guideline file as it is', async () => {
    const { fetchFn } = github({ 'org/base': GUIDELINE_TEXT });
    const result = await prepareProcessStart(input(fetchFn, { guideline }));
    expect(result).toMatchObject({ ok: true, notes: [], source: { code: 'cli.process-start.from-guideline' } });
    expect(result.ok && result.text.endsWith(GUIDELINE_TEXT)).toBe(true);
  });

  it('refuses a repository that has a process file, and does not ask the guideline', async () => {
    const { fetchFn, asked } = github({ 'me/app': 'version: 1\n', 'org/base': GUIDELINE_TEXT });
    expect(await prepareProcessStart(input(fetchFn, { guideline }))).toEqual({ ok: false, refusal: { code: 'cli.process-start.has-file', args: { repository: 'me/app' } } });
    expect(asked.some((url) => url.includes('/org/base/'))).toBe(false);
  });

  it('refuses when it is not known whether the repository has a file', async () => {
    const { fetchFn } = github({ 'me/app': 'offline' });
    expect(await prepareProcessStart(input(fetchFn))).toMatchObject({ ok: false, refusal: { code: 'cli.process-start.unreadable' } });
  });

  it('refuses while a pull request is open', async () => {
    const { fetchFn } = github({}, true);
    expect(await prepareProcessStart(input(fetchFn))).toMatchObject({ ok: false, refusal: { code: 'cli.process-start.already-open' } });
  });

  it('falls back to the defaults, with a note, when the guideline cannot be read', async () => {
    const { fetchFn } = github({ 'org/base': 'offline' });
    const result = await prepareProcessStart(input(fetchFn, { guideline }));
    expect(result).toMatchObject({ ok: true, source: { code: 'cli.process-start.from-defaults' }, notes: [{ code: 'cli.process-start.guideline-unreadable' }] });
  });

  it('falls back to the defaults, with a note, when the guideline is not a valid process file', async () => {
    const { fetchFn } = github({ 'org/base': 'version: 9\n' });
    expect(await prepareProcessStart(input(fetchFn, { guideline }))).toMatchObject({ ok: true, notes: [{ code: 'cli.process-start.guideline-invalid' }] });
  });

  it('without a guideline, matches the defaults to how the cards are tracked', async () => {
    const { fetchFn } = github({});
    const labels = await prepareProcessStart(input(fetchFn));
    const board = await prepareProcessStart(input(fetchFn, { cards: [{ labels: ['bug'] }] }));
    expect(labels.ok && labels.text).toContain('source: labels');
    expect(board.ok && board.text).toContain('source: board-status');
  });
});

describe('processStartPullRequest', () => {
  it('adds the file on its own branch and puts the whole text in the pull request', () => {
    const pull = processStartPullRequest('version: 1\n', 'Made by Weaver.');
    expect(pull).toMatchObject({ path: '.weaver/process.yaml', branch: PROCESS_START_BRANCH, content: 'version: 1\n' });
    expect(pull.body).toContain('Made by Weaver.');
    expect(pull.body).toContain('version: 1');
    expect(pull.commitMessage.endsWith('Made by Weaver.')).toBe(true);
  });
});

describe('the kept guideline copy (DEC-019 item 8)', () => {
  const key = 'org/base|.weaver/process.yaml|';

  it('is kept when GitHub is asked, so the next run can use it', async () => {
    const copies = memoryCopies();
    const { fetchFn } = github({ 'org/base': GUIDELINE_TEXT });
    await prepareProcessStart(input(fetchFn, { guideline, copies, now: new Date('2026-11-08T09:00:00Z') }));
    expect(copies.get(key)).toEqual({ text: GUIDELINE_TEXT, readAt: '2026-11-08T09:00:00.000Z' });
  });

  it('is used, with a note that says how old it is, when GitHub cannot be asked', async () => {
    const copies = memoryCopies({ [key]: { text: GUIDELINE_TEXT, readAt: '2026-11-05T09:00:00.000Z' } });
    const { fetchFn } = github({ 'org/base': 'offline' });
    const result = await prepareProcessStart(input(fetchFn, { guideline, copies }));
    expect(result.ok && result.text.endsWith(GUIDELINE_TEXT)).toBe(true);
    expect(result).toMatchObject({ ok: true, source: { code: 'cli.process-start.from-guideline' }, notes: [{ code: 'cli.process-start.guideline-copy', args: { when: '2026-11-05' } }] });
    expect(copies.get(key)?.readAt).toBe('2026-11-05T09:00:00.000Z');
  });

  it('gives way to the defaults, with a note, when there is no copy and GitHub cannot be asked', async () => {
    const { fetchFn } = github({ 'org/base': 'offline' });
    expect(await prepareProcessStart(input(fetchFn, { guideline, copies: memoryCopies() }))).toMatchObject({
      ok: true,
      source: { code: 'cli.process-start.from-defaults' },
      notes: [{ code: 'cli.process-start.guideline-unreadable' }],
    });
  });

  it('says the file is not there when GitHub says so, and does not fall back to an old copy', async () => {
    const copies = memoryCopies({ [key]: { text: GUIDELINE_TEXT, readAt: '2026-11-05T09:00:00.000Z' } });
    const { fetchFn } = github({});
    const result = await prepareProcessStart(input(fetchFn, { guideline, copies }));
    expect(result).toMatchObject({ ok: true, source: { code: 'cli.process-start.from-defaults' }, notes: [{ code: 'cli.process-start.guideline-missing' }] });
    expect(copies.get(key)?.missing).toBe(true);
  });
});

describe('readGuideline', () => {
  it('asks with the ETag of the kept copy and renews its age when nothing changed', async () => {
    const calls: Record<string, string>[] = [];
    const fetchFn = (async (_url: string, init?: { headers?: Record<string, string> }) => {
      calls.push(init?.headers ?? {});
      return { ok: false, status: 304, headers: { get: () => null }, text: async () => '' };
    }) as unknown as FetchFn;
    const copies = memoryCopies({ 'org/base|a.yaml|': { text: 'version: 1\n', etag: '"e1"', readAt: '2026-11-01T00:00:00.000Z' } });
    const read = await readGuideline('t', { repository: 'org/base', path: 'a.yaml' }, copies, new Date('2026-11-08T00:00:00Z'), fetchFn);
    expect(calls[0]['If-None-Match']).toBe('"e1"');
    expect(read).toEqual({ status: 'read', text: 'version: 1\n', readAt: '2026-11-08T00:00:00.000Z' });
    expect(copies.get('org/base|a.yaml|')?.etag).toBe('"e1"');
  });
});
