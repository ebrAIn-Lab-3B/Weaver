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
  it('verifies and fingerprints a requirement-only Issue link', async () => {
    const taskWithoutIssue = task.replace('issue: https://github.com/example/repo/issues/7\n', 'status: draft\n');
    const reqPath = 'docs/REQ-001.md';
    const requirement = `---\nid: REQ-001\ntype: requirement\ntitle: Example\nstatus: draft\nrepository: example/repo\n---\n\n## Tasks\n\n- \`TASK-001\` Work — [Issue #7](https://github.com/example/repo/issues/7)\n`;
    const input = { ...identity, requirement: { path: reqPath, id: 'REQ-001' } };
    const read = async (file: string) => file === reqPath ? requirement : taskWithoutIssue;
    const result = await readFreshTaskHolder(input, read);
    expect(result).toMatchObject({ holder: 'worker' });
    const changed = await readFreshTaskHolder(input, async (file) => file === reqPath ? requirement + '\nChanged\n' : taskWithoutIssue);
    expect(changed?.version).not.toBe(result?.version);
    const different = requirement.replace('/issues/7', '/issues/8');
    expect(await readFreshTaskHolder(input, async (file) => file === reqPath ? different : taskWithoutIssue)).toBeUndefined();
    const duplicate = requirement + '- `TASK-002` Other — [Issue #7](https://github.com/example/repo/issues/7)\n';
    expect(await readFreshTaskHolder(input, async (file) => file === reqPath ? duplicate : taskWithoutIssue)).toBeUndefined();
    expect(await readFreshTaskHolder(input, async (file) => file === reqPath ? requirement.replace('repository: example/repo', 'repository: other/repo') : taskWithoutIssue)).toBeUndefined();
    expect(await readFreshTaskHolder(input, async (file) => file === reqPath ? requirement : taskWithoutIssue.replace('repository: example/repo\n', ''))).toBeUndefined();
    expect(await readFreshTaskHolder(input, async (file) => file === reqPath ? requirement : taskWithoutIssue.replace('repository: example/repo', 'repository: example/repo\nrepository_server: git.example'))).toBeUndefined();
    expect(await readFreshTaskHolder(input, async (file) => file === reqPath ? requirement.replace('repository: example/repo', 'repository: example/repo\nrepository_server: git.example') : taskWithoutIssue)).toBeUndefined();
    expect(await readFreshTaskHolder(input, async (file) => file === reqPath ? requirement : taskWithoutIssue.replace('requirement: REQ-001', 'requirement: REQ-001\nrequirement_server: git.example'))).toBeUndefined();
    const crossServerTask = taskWithoutIssue.replace('requirement: REQ-001', 'requirement: REQ-001\nrequirement_repository: other/specs\nrequirement_server: git.example');
    const crossServerRequirement = requirement.replace('repository: example/repo', 'repository: other/specs\nrepository_server: git.example');
    expect(await readFreshTaskHolder(input, async (file) => file === reqPath ? crossServerRequirement : crossServerTask)).toMatchObject({ holder: 'worker' });
  });
  it('does not let a requirement override a conflicting direct Issue link', async () => {
    const input = { ...identity, requirement: { path: 'req.md', id: 'REQ-001' } };
    expect(await readFreshTaskHolder(input, async () => task.replace('/issues/7', '/issues/8'))).toBeUndefined();
  });
  it('reads a reviewer without replacing the implementation owner', async () => {
    const result = await readFreshTaskHolder(identity, async () => task.replace('assignee: worker', 'reviewer: reviewer\nassignee: worker'));
    expect(result).toMatchObject({ holder: 'worker', reviewer: 'reviewer' });
  });
  it('keeps a valid task without an owner distinct from an unreadable task', async () => {
    const result = await readFreshTaskHolder(identity, async () => task.replace('assignee: worker\n', '').replace('assignee_type: agent\n', ''));
    expect(result).toEqual({ version: expect.any(String) });
  });
});
