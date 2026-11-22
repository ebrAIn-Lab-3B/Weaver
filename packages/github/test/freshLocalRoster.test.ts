import { describe, expect, it } from 'vitest';
import { readFreshLocalRoster, type LocalFileRead } from '../src';
import { rootConfigCandidates } from '@ebrain-lab/weaver-markdown';
import * as path from 'node:path';

const start = path.resolve('workspace', 'project');
const personalPath = path.resolve('personal', 'config.yaml');
const root = rootConfigCandidates(start, personalPath)[0];
const text = (who: string) => `project: {owner: example, number: 1}\nroster:\n  contributors:\n    - {id: ${who}, kind: human}\n`;
function files(values: Record<string, LocalFileRead>) { return async (file: string): Promise<LocalFileRead> => values[file] ?? { status: 'missing' }; }

describe('fresh local roster', () => {
  it('rereads and combines root and personal roster sources', async () => {
    const result = await readFreshLocalRoster(start, personalPath, files({ [root]: { status: 'read', text: text('root') }, [personalPath]: { status: 'read', text: text('personal') } }));
    expect(result?.roster?.contributors.map((c) => c.id)).toEqual(['root', 'personal']);
    expect(result?.version).toMatch(/^[0-9a-f]{64}$/);
  });
  it('fails closed for unreadable or malformed configuration instead of falling back', async () => {
    expect(await readFreshLocalRoster(start, personalPath, files({ [root]: { status: 'failed' }, [personalPath]: { status: 'read', text: text('personal') } }))).toBeUndefined();
    expect(await readFreshLocalRoster(start, personalPath, files({ [root]: { status: 'read', text: 'project: [' }, [personalPath]: { status: 'read', text: text('personal') } }))).toBeUndefined();
    expect(await readFreshLocalRoster(start, personalPath, files({ [personalPath]: { status: 'failed' } }))).toBeUndefined();
  });
  it('does not ignore malformed roster references or roles', async () => {
    const invalidRef = 'project: {owner: example, number: 1}\nroster:\n  from: {repository: invalid, path: roster.yaml}\n';
    const invalidRoles = 'project: {owner: example, number: 1}\nroster:\n  contributors:\n    - {id: person, kind: human, roles: broken}\n';
    expect(await readFreshLocalRoster(start, personalPath, files({ [personalPath]: { status: 'read', text: invalidRef } }))).toBeUndefined();
    expect(await readFreshLocalRoster(start, personalPath, files({ [personalPath]: { status: 'read', text: invalidRoles } }))).toBeUndefined();
  });
  it('fingerprints changed local source text and preserves its shared reference', async () => {
    const config = 'project: {owner: example, number: 1}\nroster:\n  from: {repository: example/people, path: roster.yaml}\n';
    const a = await readFreshLocalRoster(start, personalPath, files({ [personalPath]: { status: 'read', text: config } }));
    const b = await readFreshLocalRoster(start, personalPath, files({ [personalPath]: { status: 'read', text: config + '\n# changed\n' } }));
    expect(a?.reference).toEqual({ repository: 'example/people', path: 'roster.yaml' });
    expect(a?.version).not.toBe(b?.version);
  });
});
