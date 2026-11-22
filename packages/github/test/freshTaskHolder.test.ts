import { describe, expect, it } from 'vitest';
import { readFreshTaskHolder } from '../src';

const identity = { path: 'docs/tasks/TASK-001.md', taskId: 'TASK-001', issueUrl: 'https://github.com/example/repo/issues/7' };
const task = `---
id: TASK-001
type: task
title: Example
requirement: REQ-001
issue: https://github.com/example/repo/issues/7
repository: example/repo
assignee: worker
assignee_type: agent
---
`;

describe('fresh task holder', () => {
  it('reads the linked task and fingerprints its exact contents', async () => {
    const result = await readFreshTaskHolder(identity, async () => task);
    expect(result).toMatchObject({ holder: 'worker', version: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect((await readFreshTaskHolder(identity, async () => task.replace('worker', 'person')))?.version).not.toBe(result?.version);
  });
  it('does not infer an owner from an unreadable, unrelated or unlinked task', async () => {
    expect(await readFreshTaskHolder(identity, async () => { throw Error('offline'); })).toBeUndefined();
    expect(await readFreshTaskHolder(identity, async () => task.replace('/issues/7', '/issues/8'))).toBeUndefined();
    expect(await readFreshTaskHolder(identity, async () => task.replace('issue: https://github.com/example/repo/issues/7\n', ''))).toBeUndefined();
    expect(await readFreshTaskHolder({ ...identity, taskId: 'TASK-002' }, async () => task)).toBeUndefined();
    expect(await readFreshTaskHolder(identity, async () => task.replace('repository: example/repo', 'repository: other/repo'))).toBeUndefined();
  });
  it('keeps a valid task without an owner distinct from an unreadable task', async () => {
    const result = await readFreshTaskHolder(identity, async () => task.replace('assignee: worker\n', '').replace('assignee_type: agent\n', ''));
    expect(result).toEqual({ version: expect.any(String) });
  });
});
