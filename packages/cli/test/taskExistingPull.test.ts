import { describe, expect, it } from 'vitest';
import type { Fetch } from '@ebrain-lab/weaver-github';
import { observeExistingTaskPull, observeMergedTaskPull } from '../src/taskExistingPull';

const sha = 'a'.repeat(40);
const pull = { number: 7, html_url: 'https://github.com/owner/repo/pull/7', state: 'open', head: { ref: 'docs/task-001-work', sha, repo: { full_name: 'owner/repo' } }, base: { ref: 'main', repo: { full_name: 'owner/repo' } } };
const input = { token: 't', repository: 'owner/repo', branch: 'docs/task-001-work', taskId: 'TASK-001', taskPath: 'docs/tasks/TASK-001.md', requirementPath: 'docs/requirements/REQ-001.md', expectedTask: 'task contents\n', expectedRequirementLine: '- `TASK-001` issue link' };

function mock(options: { task?: string; requirement?: string; secondSha?: string; duplicate?: boolean; failContent?: boolean } = {}): Fetch {
  return async (url, init) => {
    expect(new Request(url, init).body).toBeNull();
    if (url.endsWith('/repos/owner/repo')) return { ok: true, status: 200, json: async () => ({ default_branch: 'main' }) };
    if (url.includes('/pulls?')) return { ok: true, status: 200, json: async () => options.duplicate ? [pull, pull] : [pull] };
    if (url.endsWith('/pulls/7')) return { ok: true, status: 200, json: async () => ({ ...pull, head: { ...pull.head, sha: options.secondSha ?? sha } }) };
    if (url.includes('/contents/')) {
      if (options.failContent) return { ok: false, status: 403, json: async () => ({}) };
      const text = url.includes('/tasks/') ? options.task ?? input.expectedTask : options.requirement ?? `# Requirement\n${input.expectedRequirementLine}\n`;
      return { ok: true, status: 200, json: async () => ({ type: 'file', encoding: 'base64', content: Buffer.from(text).toString('base64') }) };
    }
    throw new Error('Unexpected request');
  };
}

describe('existing task PR inspection', () => {
  it('observes the exact open PR and both files at the same immutable head', async () => {
    await expect(observeExistingTaskPull({ ...input, fetch: mock() })).resolves.toEqual({ url: pull.html_url, head: sha });
  });

  it('fails closed for conflicting content, ambiguous PRs, failed reads and a changed head', async () => {
    for (const options of [{ task: 'changed' }, { requirement: 'missing link' }, { requirement: `${input.expectedRequirementLine}\n- \`TASK-001\` other issue` }, { duplicate: true }, { failContent: true }, { secondSha: 'b'.repeat(40) }]) {
      await expect(observeExistingTaskPull({ ...input, fetch: mock(options) })).rejects.toThrow();
    }
  });
});

describe('merged registration inspection', () => {
  function mergedMock(options: { changedDefault?: boolean; compare?: string; merged?: boolean; changedFiles?: boolean } = {}): Fetch {
    let revisionReads = 0;
    const revision = 'b'.repeat(40);
    const mergeCommit = 'c'.repeat(40);
    const mergedPull = { ...pull, state: 'closed', merged_at: options.merged === false ? null : '2026-11-28T00:00:00Z', merge_commit_sha: mergeCommit };
    return async (url, init) => {
      expect(new Request(url, init).body).toBeNull();
      if (url.endsWith('/repos/owner/repo')) return { ok: true, status: 200, json: async () => ({ default_branch: 'main' }) };
      if (url.endsWith('/commits/main')) { revisionReads += 1; return { ok: true, status: 200, json: async () => ({ sha: options.changedDefault && revisionReads > 1 ? 'd'.repeat(40) : revision }) }; }
      if (url.includes('/pulls?')) return { ok: true, status: 200, json: async () => [mergedPull] };
      if (url.endsWith('/pulls/7')) return { ok: true, status: 200, json: async () => mergedPull };
      if (url.includes('/compare/')) return { ok: true, status: 200, json: async () => ({ status: options.compare ?? 'ahead' }) };
      if (url.includes('/contents/')) {
        const text = url.includes('/tasks/') ? options.changedFiles ? 'wrong' : input.expectedTask : input.expectedRequirementLine;
        return { ok: true, status: 200, json: async () => ({ type: 'file', encoding: 'base64', content: Buffer.from(text).toString('base64') }) };
      }
      throw new Error('Unexpected request');
    };
  }

  it('confirms a merged PR, ancestor and matching files at an unchanged default revision', async () => {
    await expect(observeMergedTaskPull({ ...input, fetch: mergedMock() })).resolves.toEqual({ url: pull.html_url, revision: 'b'.repeat(40), mergeCommit: 'c'.repeat(40) });
  });

  it('fails closed when the PR is unmerged, ancestry differs, files differ or default moves', async () => {
    for (const options of [{ merged: false }, { compare: 'diverged' }, { changedFiles: true }, { changedDefault: true }]) {
      await expect(observeMergedTaskPull({ ...input, fetch: mergedMock(options) })).rejects.toThrow();
    }
  });
});
