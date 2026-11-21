import { describe, expect, it } from 'vitest';
import { loadWorkspace, mergeTasks, normalizeServerAddress, parseArtifact, renderTaskFile, repositoryFromRemote, requirementsByIssue, sameServer, viewTargetOf } from '../src';

const requirement = (title: string, task: string) => `---\nid: REQ-001\ntype: requirement\ntitle: ${title}\nstatus: draft\n---\n\n## Acceptance criteria\n- Work\n\n## Tasks\n- \`${task}\` Work\n`;
const task = (id: string, extra = '') => `---\nid: ${id}\ntype: task\ntitle: Work\nstatus: draft\nrequirement: REQ-001\n${extra}---\n`;
const files = [
  { path: 'a/req.md', text: requirement('A', 'TASK-001'), repository: 'org/a', sourceScope: 'a' },
  { path: 'b/req.md', text: requirement('B', 'TASK-002'), repository: 'org/b', sourceScope: 'b' },
  { path: 'a/task.md', text: task('TASK-001', 'issue: https://github.com/org/a/issues/1\n'), repository: 'org/a', sourceScope: 'a' },
  { path: 'b/task.md', text: task('TASK-002'), repository: 'org/b', sourceScope: 'b' },
];

describe('repository-qualified requirement references', () => {
  it('keeps identical IDs separate in validation, joins, navigation and issue links', () => {
    const loaded = loadWorkspace(files);
    expect(loaded.issues.filter(i => i.severity === 'error')).toEqual([]);
    const a = viewTargetOf(loaded.artifacts, 'a/task.md')?.requirement;
    const b = viewTargetOf(loaded.artifacts, 'b/task.md')?.requirement;
    expect(a?.path).toBe('a/req.md');
    expect(b?.path).toBe('b/req.md');
    expect(mergeTasks(a!, loaded.artifacts)[0].file?.path).toBe('a/task.md');
    expect(requirementsByIssue(loaded.artifacts).get('https://github.com/org/a/issues/1')?.path).toBe('a/req.md');
  });

  it('resolves explicit cross-repository references and refuses ambiguous legacy references', () => {
    const loaded = loadWorkspace([...files, { path: 'c/task.md', text: task('TASK-003', 'requirement_repository: org/b\n'), repository: 'org/c' }, { path: 'unknown/task.md', text: task('TASK-004') }]);
    expect(viewTargetOf(loaded.artifacts, 'c/task.md')?.requirement.path).toBe('b/req.md');
    expect(viewTargetOf(loaded.artifacts, 'unknown/task.md')).toBeUndefined();
    expect(loaded.issues.some(i => i.path === 'unknown/task.md' && i.code === 'ambiguous-requirement')).toBe(true);
  });

  it('detects duplicates in one repository and permits distinct local checkout scopes', () => {
    expect(loadWorkspace([files[0], { ...files[0], path: 'a/other.md' }]).issues.some(i => i.code === 'duplicate-id')).toBe(true);
    const local = loadWorkspace([{ path: 'a/r.md', text: requirement('A', 'TASK-001'), sourceScope: 'a' }, { path: 'b/r.md', text: requirement('B', 'TASK-002'), sourceScope: 'b' }]);
    expect(local.issues.some(i => i.code === 'duplicate-id')).toBe(false);
  });

  it('distinguishes equal repository names on different servers and resolves an explicit server', () => {
    const one = { path: 'one/req.md', text: requirement('One', 'TASK-001'), repository: 'org/shared', repositoryServer: 'git.one', sourceScope: 'one' };
    const two = { path: 'two/req.md', text: requirement('Two', 'TASK-002'), repository: 'ORG/shared', repositoryServer: 'git.two', sourceScope: 'two' };
    const cross = { path: 'three/task.md', text: task('TASK-003', 'requirement_repository: org/shared\nrequirement_server: GIT.TWO\n') };
    const ambiguous = { path: 'three/ambiguous.md', text: task('TASK-004', 'requirement_repository: org/shared\n') };
    const loaded = loadWorkspace([one, two, cross, ambiguous]);
    expect(loaded.issues.some(i => i.code === 'duplicate-id')).toBe(false);
    expect(viewTargetOf(loaded.artifacts, cross.path)?.requirement.path).toBe(two.path);
    expect(viewTargetOf(loaded.artifacts, ambiguous.path)).toBeUndefined();
    expect(loaded.issues.some(i => i.path === ambiguous.path && i.code === 'ambiguous-requirement' && String(i.args?.paths).includes('one/req.md'))).toBe(true);
    const unknown = loadWorkspace([one, { ...two, repositoryServer: undefined }, cross]);
    expect(viewTargetOf(unknown.artifacts, cross.path)).toBeUndefined();
    expect(unknown.issues.some(i => i.code === 'duplicate-id')).toBe(true);
  });

  it('parses and writes portable server-qualified references without credentials', () => {
    expect(repositoryFromRemote('https://user:secret@Git.Example.com:443/org/repo.git')).toEqual({ server: 'git.example.com:443', repository: 'org/repo' });
    expect(repositoryFromRemote('git@git.example.com:org/repo.git')).toEqual({ server: 'git.example.com', repository: 'org/repo' });
    expect(repositoryFromRemote('/local/path')).toBeUndefined();
    const text = renderTaskFile({ id: 'TASK-010', title: 'Task', requirement: 'REQ-001', requirementRepository: 'org/repo', requirementServer: 'git.example.com', issueUrl: 'https://example.com/1', issueNumber: 1, repository: 'org/other', criteria: [], assigneeType: 'agent' });
    expect(parseArtifact('task.md', text).artifact).toMatchObject({ requirementRepository: 'org/repo', requirementServer: 'git.example.com' });
    expect(parseArtifact('bad.md', task('TASK-010', 'requirement_server: https://example.com/user\n')).issues.some(i => i.code === 'invalid-repository-server')).toBe(true);
    expect(parseArtifact('missing.md', task('TASK-010', 'requirement_server: example.com\n')).issues.some(i => i.code === 'requirement-server-without-repository')).toBe(true);
  });

  it('distinguishes explicit ports, preserves default ports and normalizes IPv4 and IPv6', () => {
    expect(repositoryFromRemote('https://git.example:8443/org/repo.git')?.server).toBe('git.example:8443');
    expect(repositoryFromRemote('https://git.example:443/org/repo.git')?.server).toBe('git.example:443');
    expect(repositoryFromRemote('ssh://git@[2001:db8::1]:2222/org/repo.git')?.server).toBe('[2001:db8::1]:2222');
    expect(repositoryFromRemote('git@[2001:db8::1]:org/repo.git')?.server).toBe('[2001:db8::1]');
    expect(normalizeServerAddress('[2001:0DB8:0:0:0:0:0:1]:02222')).toBe('[2001:db8::1]:2222');
    expect(normalizeServerAddress('192.0.2.1:8443')).toBe('192.0.2.1:8443');
    for (const invalid of ['git.example:0', 'git.example:65536', 'git.example:abc', '[2001:::1]:22', '192.0.2.999', 'user@git.example:22', 'https://git.example']) expect(normalizeServerAddress(invalid)).toBeUndefined();
    expect(sameServer('GIT.EXAMPLE:08443', 'git.example:8443')).toBe(true);
    expect(sameServer('git.example', 'git.example:443')).toBe(false);
    expect(sameServer('git.example:443', 'git.example:22')).toBe(false);
    const text = renderTaskFile({ id: 'TASK-010', title: 'Task', requirement: 'REQ-001', requirementRepository: 'org/repo', requirementServer: '[2001:db8::1]:2222', issueUrl: 'https://example.com/1', issueNumber: 1, repository: 'org/other', criteria: [], assigneeType: 'agent' });
    expect(parseArtifact('task.md', text).artifact).toMatchObject({ requirementServer: '[2001:db8::1]:2222' });
  });

  it('resolves same-host different-port repositories without matching omitted ports', () => {
    const base = { repository: 'org/shared' };
    const one = { ...base, path: 'one/req.md', text: requirement('One', 'TASK-001'), repositoryServer: 'git.example:8443', sourceScope: 'one' };
    const two = { ...base, path: 'two/req.md', text: requirement('Two', 'TASK-002'), repositoryServer: 'git.example:9443', sourceScope: 'two' };
    const cross = { path: 'task.md', text: task('TASK-003', 'requirement_repository: org/shared\nrequirement_server: "git.example:9443"\n') };
    const loaded = loadWorkspace([one, two, cross]);
    expect(loaded.issues.some(i => i.code === 'duplicate-id')).toBe(false);
    expect(viewTargetOf(loaded.artifacts, cross.path)?.requirement.path).toBe(two.path);
    const missing = loadWorkspace([one, two, { ...cross, text: task('TASK-003', 'requirement_repository: org/shared\nrequirement_server: git.example\n') }]);
    expect(viewTargetOf(missing.artifacts, cross.path)).toBeUndefined();
  });
});
