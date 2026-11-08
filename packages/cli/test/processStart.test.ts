import { describe, expect, it } from 'vitest';
import type { Fetch } from '@palab/weaver-github';
import { EXIT, run } from '../src';
import { setup } from './helpers';

const GUIDELINE_TEXT = 'version: 1\ncolumns:\n  source: board-status\nstale:\n  idle-days: 30\n';
const WITH_GUIDELINE = 'project: {owner: me, number: 1}\nrepositories:\n  - me/Weaver\nguideline:\n  repository: org/base\n  ref: main\n';

interface Options {
  /** The process file of me/Weaver: absent means none. */
  own?: string;
  /** The process file of the guideline repository: absent means 404. */
  guideline?: string;
  openPull?: boolean;
  guidelineFails?: boolean;
}

/** GitHub as the REST double of the helper does not know it: contents, pulls, refs, and the file write. */
function withApi(options: Options = {}, registry?: string) {
  const s = setup(registry ? { registry } : {});
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const original = s.deps.fetch as Fetch;
  const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body, text: async () => (typeof body === 'string' ? body : '') });
  const impl = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const method = init?.method ?? 'GET';
    if (url.includes('/contents/.weaver/process.yaml') && method === 'GET') {
      const isGuideline = url.includes('/repos/org/base/');
      if (isGuideline && options.guidelineFails) throw new Error('offline');
      const text = isGuideline ? options.guideline : options.own;
      return text === undefined ? json(404, {}) : json(200, text);
    }
    if (/\/repos\/me\/Weaver\/pulls\?/.test(url)) return json(200, options.openPull ? [{ head: { ref: 'docs/weaver-process-file' } }] : []);
    if (url.endsWith('/repos/me/Weaver') && method === 'GET') return json(200, { default_branch: 'main' });
    if (url.includes('/git/ref/heads/main')) return json(200, { object: { sha: 'abc123' } });
    if (url.endsWith('/git/refs') || url.includes('/contents/') || url.endsWith('/pulls')) {
      calls.push({ method, url, body: init?.body ? JSON.parse(init.body) : undefined });
      return json(201, url.endsWith('/pulls') ? { number: 5, html_url: 'https://github.com/me/Weaver/pull/5' } : {});
    }
    return original(url, init as never);
  };
  s.deps.fetch = impl as unknown as Fetch;
  return { ...s, calls };
}

const start = ['process', 'start', '--repository', 'me/Weaver'];

async function planned(s: ReturnType<typeof withApi>, extra: string[] = []) {
  const code = await run([...start, ...extra], s.deps);
  return { code, result: JSON.parse(s.out.join('')) };
}

describe('weaver process start', () => {
  it('shows the exact file and writes nothing until it is approved', async () => {
    const s = withApi({ guideline: GUIDELINE_TEXT }, WITH_GUIDELINE);
    const { code, result } = await planned(s);
    expect(code).toBe(EXIT.unconfirmed);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].kind).toBe('process.start');
    expect(result.actions[0].summary).toContain('me/Weaver');
    expect(result.actions[0].summary).toContain('# Started from the guideline org/base .weaver/process.yaml@main.');
    expect(result.actions[0].summary).toContain(GUIDELINE_TEXT);
    expect(result.actions[0].reason).toContain('org/base');
    expect(s.calls).toEqual([]);
  });

  it('opens a pull request with the guideline file as it is, after the id is approved', async () => {
    const dry = withApi({ guideline: GUIDELINE_TEXT }, WITH_GUIDELINE);
    const id = (await planned(dry)).result.actions[0].id;

    const s = withApi({ guideline: GUIDELINE_TEXT }, WITH_GUIDELINE);
    const { code } = await planned(s, ['--approve', id]);
    expect(code).toBe(EXIT.ok);
    expect(s.calls.map((c) => `${c.method} ${c.url.replace('https://api.github.com/repos/me/Weaver', '')}`)).toEqual([
      'POST /git/refs',
      'PUT /contents/.weaver/process.yaml',
      'POST /pulls',
    ]);
    expect(s.calls[0].body).toEqual({ ref: 'refs/heads/docs/weaver-process-file', sha: 'abc123' });
    const written = Buffer.from((s.calls[1].body as { content: string }).content, 'base64').toString('utf8');
    expect(written).toContain('# Started from the guideline org/base .weaver/process.yaml@main.');
    expect(written.endsWith(GUIDELINE_TEXT)).toBe(true);
    expect((s.calls[1].body as { branch: string }).branch).toBe('docs/weaver-process-file');
    expect(s.calls[2].body).toMatchObject({ head: 'docs/weaver-process-file', base: 'main' });
  });

  it('does not accept an approval for other text', async () => {
    const dry = withApi({ guideline: GUIDELINE_TEXT }, WITH_GUIDELINE);
    const id = (await planned(dry)).result.actions[0].id;
    const s = withApi({ guideline: `${GUIDELINE_TEXT}# changed\n` }, WITH_GUIDELINE);
    const { code } = await planned(s, ['--approve', id]);
    expect(code).toBe(EXIT.unconfirmed);
    expect(s.calls).toEqual([]);
  });

  it('refuses a repository that already has a process file, whatever the guideline says', async () => {
    const s = withApi({ own: 'version: 1\n', guideline: GUIDELINE_TEXT }, WITH_GUIDELINE);
    const code = await run(start, s.deps);
    expect(code).toBe(EXIT.failed);
    expect(JSON.parse(s.out.join('')).error.message).toContain('already has a process file');
    expect(s.calls).toEqual([]);
  });

  it('offers nothing more while the pull request is open', async () => {
    const s = withApi({ openPull: true, guideline: GUIDELINE_TEXT }, WITH_GUIDELINE);
    const code = await run(start, s.deps);
    expect(code).toBe(EXIT.failed);
    expect(JSON.parse(s.out.join('')).error.message).toContain('already open');
  });

  it('offers the defaults and says why when the guideline cannot be read', async () => {
    const s = withApi({ guidelineFails: true }, WITH_GUIDELINE);
    const { result } = await planned(s);
    expect(s.err.join('')).toContain('could not be read');
    expect(result.actions[0].summary).toContain('# Started from the defaults');
    expect(result.actions[0].summary).not.toContain('guideline org/base');
  });

  it('offers the defaults when the guideline file is not a valid process file', async () => {
    const s = withApi({ guideline: 'version: 9\n' }, WITH_GUIDELINE);
    const { result } = await planned(s);
    expect(s.err.join('')).toContain('not a valid process file');
    expect(result.actions[0].summary).toContain('# Started from the defaults');
  });

  it('without a guideline, offers the defaults that match how the cards are tracked', async () => {
    const s = withApi({});
    const { result } = await planned(s);
    // The cards of the test Project carry status labels.
    expect(result.actions[0].summary).toContain('carry status labels');
    expect(result.actions[0].summary).toContain('source: labels');
    expect(result.actions[0].reason).toContain('defaults');
  });

  it('needs a repository, and refuses one that is not shown', async () => {
    const none = withApi({});
    expect(await run(['process', 'start'], none.deps)).toBe(EXIT.usage);
    const other = withApi({});
    expect(await run(['process', 'start', '--repository', 'me/Other'], other.deps)).toBe(EXIT.usage);
  });
});
