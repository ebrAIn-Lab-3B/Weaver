import { describe, expect, it } from 'vitest';
import { checkFolderUpdate, draftTaskFile, parseArtifact, requirementDirectoryOf, requirementIdsIn, taskDirectoryOf } from '../src';

const REQUIREMENT = `---
id: REQ-018
type: requirement
title: Finish work without leaving Weaver
status: draft
owner: team
repository: o/r
---

# Finish work

## Acceptance criteria

- It works.

## Tasks

- \`TASK-090\` Open a page — [GitHub Issue #241](https://github.com/o/r/issues/241)

Origin: the maintainer.
`;

const card = { taskId: 'TASK-098', title: '[TASK-098] Open the first link', number: 270, url: 'https://github.com/o/r/issues/270', repository: 'o/r', assignees: [] as string[] };
const requirement = { id: 'REQ-018', path: 'docs/requirements/REQ-018-x.md', text: REQUIREMENT };

describe('requirementIdsIn and the folders', () => {
  it('names the requirements of a text once each, in order', () => {
    expect(requirementIdsIn('For REQ-018 and REQ-004, again REQ-018. Not REQ-1 or XREQ-0199.')).toEqual(['REQ-018', 'REQ-004']);
    expect(requirementIdsIn('no requirement here')).toEqual([]);
  });

  it('finds the folder of the task files of a repository, and falls back to docs/tasks', () => {
    expect(taskDirectoryOf(['work/tasks/TASK-001.md', 'work/tasks/TASK-002.md'])).toBe('work/tasks');
    expect(taskDirectoryOf(['docs/requirements/REQ-001.md'])).toBe('docs/tasks');
    expect(taskDirectoryOf([])).toBe('docs/tasks');
  });

  it('finds the folder of the requirement files the same way', () => {
    expect(requirementDirectoryOf(['reqs/REQ-001-first.md'])).toBe('reqs');
    expect(requirementDirectoryOf([])).toBe('docs/requirements');
  });
});

describe('draftTaskFile (DEC-024 item 4)', () => {
  it('drafts the task file and the requirement with the line that lists it', () => {
    const draft = draftTaskFile({ card, requirement, taskDirectory: 'docs/tasks' });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.taskPath).toBe('docs/tasks/TASK-098.md');
    expect(draft.title).toBe('Open the first link');
    expect(draft.line).toBe('- `TASK-098` Open the first link — [GitHub Issue #270](https://github.com/o/r/issues/270)');
    expect(draft.requirementPath).toBe('docs/requirements/REQ-018-x.md');
    // The line is added after the last task, and nothing else of the requirement changes.
    expect(draft.requirementText).toContain(`${draft.line}\n`);
    expect(draft.requirementText.indexOf('TASK-090')).toBeLessThan(draft.requirementText.indexOf('TASK-098'));
    expect(draft.requirementText.replace(`${draft.line}\n`, '')).toBe(REQUIREMENT);
  });

  it('writes a task file that Weaver reads back as the task of that card', () => {
    const draft = draftTaskFile({ card, requirement, taskDirectory: 'docs/tasks' });
    if (!draft.ok) throw new Error('not drafted');
    const parsed = parseArtifact(draft.taskPath, draft.taskText);
    expect(parsed.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(parsed.artifact).toMatchObject({ kind: 'task', id: 'TASK-098', requirement: 'REQ-018', issue: 'https://github.com/o/r/issues/270', repository: 'o/r' });
  });

  it('gives a card with an assignee to a human, and one without to an agent, and leaves the criteria for the reviewer', () => {
    const agent = draftTaskFile({ card, requirement, taskDirectory: 'docs/tasks' });
    const human = draftTaskFile({ card: { ...card, assignees: ['ada', 'bob'] }, requirement, taskDirectory: 'docs/tasks' });
    if (!agent.ok || !human.ok) throw new Error('not drafted');
    expect(agent.taskText).toContain('assignee_type: agent');
    expect(agent.taskText).not.toContain('assignee:');
    expect(human.taskText).toContain('assignee_type: human');
    expect(human.taskText).toContain('assignee: ada');
    expect(agent.taskText).not.toContain('criteria:');
  });

  it('uses the task folder it is given', () => {
    const draft = draftTaskFile({ card, requirement, taskDirectory: 'work/tasks' });
    expect(draft.ok && draft.taskPath).toBe('work/tasks/TASK-098.md');
  });

  it('refuses a title that cannot go into a task file', () => {
    expect(draftTaskFile({ card: { ...card, title: '[TASK-098] Decide: the thing' }, requirement, taskDirectory: 'docs/tasks' })).toEqual({ ok: false, reason: 'bad-title' });
    expect(draftTaskFile({ card: { ...card, title: '[TASK-098]   ' }, requirement, taskDirectory: 'docs/tasks' })).toEqual({ ok: false, reason: 'bad-title' });
  });

  it('refuses a requirement that has no list of tasks to add the line to', () => {
    const bare = { ...requirement, text: '---\nid: REQ-018\n---\n\n# No tasks section\n' };
    expect(draftTaskFile({ card, requirement: bare, taskDirectory: 'docs/tasks' })).toEqual({ ok: false, reason: 'no-tasks-section' });
  });

  it('replaces the sentence that says no task exists yet, as `weaver task create` does', () => {
    const first = { ...requirement, text: REQUIREMENT.replace(/- `TASK-090`.*\n/, 'Tasks are not created yet.\n') };
    const draft = draftTaskFile({ card, requirement: first, taskDirectory: 'docs/tasks' });
    expect(draft.ok && draft.requirementText).toContain('## Tasks\n\n- `TASK-098`');
    expect(draft.ok && draft.requirementText).not.toContain('not created yet');
  });
});

describe('checkFolderUpdate (DEC-024 item 3)', () => {
  const clean = { branch: 'main', upstream: 'origin/main', ahead: 0, behind: 3, changed: 0 };

  it('allows a fast-forward when the branch follows the remote, has nothing of its own, and the tree is clean', () => {
    expect(checkFolderUpdate(clean)).toEqual({ ok: true, behind: 3, branch: 'main', upstream: 'origin/main' });
  });

  it('refuses, saying why, in the order of what the person can do about it', () => {
    expect(checkFolderUpdate({ ...clean, branch: undefined })).toEqual({ ok: false, reason: 'detached' });
    expect(checkFolderUpdate({ ...clean, upstream: undefined })).toEqual({ ok: false, reason: 'no-upstream' });
    expect(checkFolderUpdate({ ...clean, changed: 2 })).toEqual({ ok: false, reason: 'changed' });
    expect(checkFolderUpdate({ ...clean, ahead: 1 })).toEqual({ ok: false, reason: 'ahead' });
    expect(checkFolderUpdate({ ...clean, behind: 0 })).toEqual({ ok: false, reason: 'up-to-date' });
  });

  it('refuses a branch that is not the default branch, since the task file is on the default branch', () => {
    expect(checkFolderUpdate({ ...clean, branch: 'feat/x', upstream: 'origin/feat/x', behind: 0, defaultBranch: 'main' })).toEqual({ ok: false, reason: 'not-default' });
    expect(checkFolderUpdate({ ...clean, defaultBranch: 'main' }).ok).toBe(true);
  });

  it('never touches a change of the person, even when the folder is also behind', () => {
    expect(checkFolderUpdate({ ...clean, changed: 1, behind: 9 }).ok).toBe(false);
  });

  it('never merges: a branch with a commit of its own is refused even when it is also behind', () => {
    expect(checkFolderUpdate({ ...clean, ahead: 2, behind: 5 })).toEqual({ ok: false, reason: 'ahead' });
  });
});
