import { describe, expect, it, vi } from 'vitest';
import { readFreshEffectiveRoster } from '../src';

const reference = { repository: 'example/people', path: 'roster.yaml', ref: 'main' };
const personal = { version: 'local-v1', roster: { contributors: [{ id: 'person', kind: 'human' as const }] } };
const shared = 'contributors:\n  - id: worker\n    kind: agent\n    tool: example\n    roles: [build]\n    reach: {type: label, value: work:worker}\n';
const fetchText = (text: string, status = 200) => vi.fn(async () => new Response(text, { status })) as unknown as typeof fetch;

describe('fresh effective roster', () => {
  it('reads the shared file and overlays the fresh personal roster', async () => {
    const fetcher = fetchText(shared);
    const result = await readFreshEffectiveRoster('token', reference, async () => personal, fetcher);
    expect(result?.contributors.map((c) => c.id)).toEqual(['worker', 'person']);
    expect(result?.version).toMatch(/^[0-9a-f]{64}$/);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('does not use a cached copy when a shared file is missing, unreadable or incomplete', async () => {
    expect(await readFreshEffectiveRoster('t', reference, async () => personal, fetchText('', 404))).toBeUndefined();
    expect(await readFreshEffectiveRoster('t', reference, async () => personal, fetchText('contributors: [broken]'))).toBeUndefined();
    expect(await readFreshEffectiveRoster('t', reference, async () => undefined, fetchText(shared))).toBeUndefined();
  });
  it('changes its version when either the source or local overlay changes', async () => {
    const a = await readFreshEffectiveRoster('t', reference, async () => personal, fetchText(shared));
    const b = await readFreshEffectiveRoster('t', reference, async () => ({ ...personal, version: 'local-v2' }), fetchText(shared));
    const c = await readFreshEffectiveRoster('t', reference, async () => personal, fetchText(shared.replace('work:worker', 'work:other')));
    expect(a?.version).not.toBe(b?.version); expect(a?.version).not.toBe(c?.version);
  });
  it('supports a deliberately local-only roster without a network read', async () => {
    const fetcher = vi.fn();
    const result = await readFreshEffectiveRoster('t', undefined, async () => personal, fetcher as unknown as typeof fetch);
    expect(result?.contributors.map((c) => c.id)).toEqual(['person']); expect(fetcher).not.toHaveBeenCalled();
  });
});
