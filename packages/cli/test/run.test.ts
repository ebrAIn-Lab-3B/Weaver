import { describe, expect, it } from 'vitest';
import type { Fetch } from '@ebrain-lab/weaver-github';
import { addTaskToRequirement, actionId, EXIT, nextTaskNumber, parseArgs, parseColumn, parsePullRef, planProjectAdd, renderTaskFile, run, slugOf, taskListLine } from '../src';
import { FILES, issue, setup, withGitHub } from './helpers';

describe('parseArgs', () => {
  it('splits the command, options, and flags', () => {
    const args = parseArgs(['list', '--root', 'x', '--text']);
    expect('unknown' in args).toBe(false);
    if ('unknown' in args) return;
    expect(args.command).toBe('list');
    expect(args.options.root).toBe('x');
    expect(args.flags.has('text')).toBe(true);
  });

  it('reports an option it does not know', () => {
    expect(parseArgs(['list', '--bogus'])).toEqual({ unknown: '--bogus' });
  });
});

describe('weaver list', () => {
  it('prints every card as JSON with its task, requirement, and stale marks', async () => {
    const { deps, out } = setup();
    expect(await run(['list'], deps)).toBe(EXIT.ok);
    const result = JSON.parse(out.join(''));
    expect(result.schema).toBe(1);
    expect(result.project).toEqual({ owner: 'me', number: 1, title: 'Board' });
    expect(result.cards).toHaveLength(2);
    const ten = result.cards.find((c: { number: number }) => c.number === 10);
    expect(ten).toMatchObject({ repository: 'me/Weaver', column: 'In progress', task: { id: 'TASK-010', path: 'tasks/TASK-010.md' }, requirement: { id: 'REQ-001' } });
    expect(ten.stale).toEqual(['idle']);
  });

  it('filters by column and repository, and prints text on request', async () => {
    const { deps, out } = setup();
    expect(await run(['list', '--column', 'review'], deps)).toBe(EXIT.ok);
    expect(JSON.parse(out.join('')).cards).toHaveLength(0);
    out.length = 0;
    expect(await run(['list', '--text', '--repository', 'ME/weaver'], deps)).toBe(EXIT.ok);
    expect(out.join('').split('\n').filter(Boolean)).toHaveLength(2);
    expect(out.join('')).toContain('me/Weaver#10\tIn progress\t[TASK-010] Card 10');
  });
});

describe('weaver show', () => {
  it('shows a card by task id with its task, requirement, and pull requests', async () => {
    const { deps, out } = setup();
    expect(await run(['show', 'TASK-010'], deps)).toBe(EXIT.ok);
    const result = JSON.parse(out.join(''));
    expect(result.card.number).toBe(10);
    expect(result.task).toMatchObject({ id: 'TASK-010', assignee: 'claude-code', assigneeType: 'agent' });
    expect(result.requirement).toMatchObject({ id: 'REQ-001', title: 'First' });
    expect(result.pulls).toEqual([{ number: 7, title: 'feat: ten (TASK-010)', url: 'https://github.com/me/Weaver/pull/7', closes: true }]);
  });

  it('accepts owner/name#number and an Issue address', async () => {
    for (const ref of ['me/weaver#11', 'https://github.com/me/Weaver/issues/11/']) {
      const { deps, out } = setup();
      expect(await run(['show', ref], deps)).toBe(EXIT.ok);
      expect(JSON.parse(out.join('')).card.number).toBe(11);
    }
  });

  it('still answers when the pull requests cannot be read, and says so', async () => {
    const { deps, out } = setup({ pullsFail: true });
    expect(await run(['show', 'me/Weaver#10'], deps)).toBe(EXIT.ok);
    const result = JSON.parse(out.join(''));
    expect(result.pulls).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it('marks an unqualified closing reference incomplete instead of asserting absence', async () => {
    const { deps, out } = setup();
    const original = deps.fetch as Fetch;
    deps.fetch = async (url, init) => {
      if (url.endsWith('/graphql') && init?.body && (JSON.parse(init.body).query as string).includes('pullRequests(states:MERGED')) return { ok: true, status: 200, json: async () => ({ data: { repository: { pullRequests: { pageInfo: { hasNextPage: false }, nodes: [{ number: 7, title: 'feat: ten (TASK-010)', url: 'https://github.com/me/Weaver/pull/7', headRefName: 'task-010', closingIssuesReferences: { pageInfo: { hasNextPage: false }, nodes: [{ number: 10 }] } }] } } } }) };
      return original(url, init);
    };
    expect(await run(['show', 'TASK-010'], deps)).toBe(EXIT.ok);
    const result = JSON.parse(out.join(''));
    expect(result.pulls).toMatchObject([{ number: 7, closes: false, closingIncomplete: true }]);
    expect(result.warnings[0]).toContain('not confirmed absent');
  });

  it('exits with not-found for an unknown card', async () => {
    const { deps, out } = setup();
    expect(await run(['show', 'TASK-999'], deps)).toBe(EXIT.notFound);
    expect(JSON.parse(out.join('')).error.code).toBe('cli.not-found');
  });
});

describe('weaver evidence inspect', () => {
  it('observes a closed shared Issue without inferring verification from a non-closing merged PR', async () => {
    const s = setup();
    s.deps.files = async () => [...FILES, { path: 'tasks/TASK-011.md', text: FILES[1].text.replaceAll('TASK-010', 'TASK-011').replace('assignee: claude-code', 'assignee: other\ntests: self-reported passing\nevidence_exception: approved exception') }];
    const original = s.deps.fetch as Fetch;
    s.deps.fetch = async (url, init) => {
      const reply = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
      if (url.endsWith('/issues/10')) return reply({ number: 10, title: 'Card ten', html_url: 'https://github.com/me/Weaver/issues/10', state: 'closed', labels: ['status:in-progress'], assignees: [] });
      if (url.includes('/issues/10/timeline')) return reply([{ event: 'cross-referenced', source: { issue: { number: 7, title: 'work', html_url: 'https://github.com/me/Weaver/pull/7', repository_url: 'https://api.github.com/repos/me/Weaver', pull_request: {} } } }]);
      if (url.includes('/issues/10/comments')) return reply([{ html_url: 'https://github.com/me/Weaver/issues/10#issuecomment-1', user: { login: 'reviewer' }, body: 'Could not repeat the claimed test', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' }]);
      if (url.endsWith('/pulls/7')) return reply({ state: 'closed', merged_at: '2026-11-01T00:00:00Z', body: 'Closes #10', head: { sha: 'abc' } });
      if (url.includes('/check-runs')) return reply({ total_count: 0, check_runs: [] });
      if (url.includes('/pulls/7/reviews')) return reply([]);
      if (url.endsWith('/graphql') && init?.body && (JSON.parse(init.body).query as string).includes('closingIssuesReferences(first:100')) return reply({ data: { repository: { pullRequest: { closingIssuesReferences: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } });
      return original(url, init);
    };
    expect(await run(['evidence', 'inspect', 'TASK-010'], s.deps)).toBe(EXIT.ok);
    const result = JSON.parse(s.out.join(''));
    expect(result).toMatchObject({ sharedIssue: true, membership: 'present', independentTests: { status: 'unverified', commentSource: 'read', taskClaims: [{ path: 'tasks/TASK-011.md', text: 'self-reported passing' }] }, observation: { issue: { ok: true, issue: { state: 'closed' } }, pulls: { status: 'read', value: [{ state: 'merged', link: 'mentions', checks: 'none' }] }, reviews: [{ observation: { status: 'read', value: [] } }] } });
    expect(result.tasks).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'TASK-011', testClaim: 'self-reported passing', evidenceException: 'approved exception', exceptionHonored: true })]));
    expect(result.observation.comments.value[0]).toMatchObject({ author: 'reviewer', body: 'Could not repeat the claimed test' });
    expect(result.issueComparison).toMatchObject({ status: 'conflicting', projectState: 'open', issueState: 'closed', projectReadAt: '2026-11-01T00:00:00.000Z', issueReadAt: '2026-11-01T00:00:00.000Z' });
    expect(result.placement.reliability).toBe('uncertain');
    expect(result.findings.map((finding: { kind: string }) => finding.kind)).toEqual(expect.arrayContaining(['merged-not-closing', 'no-checks', 'no-formal-review', 'shared-issue', 'issue-observations-conflict']));
    expect(s.writes.some((write) => write.includes('mutation'))).toBe(false);
  });

  it('supports Korean guidance and reports inaccessible evidence instead of an empty result', async () => {
    const s = setup();
    expect(await run(['evidence', 'inspect', 'TASK-010', '--lang', 'ko'], s.deps)).toBe(EXIT.ok);
    const result = JSON.parse(s.out.join(''));
    expect(result.guidance).toContain('추론하지 않습니다');
    expect(result.independentTests).toMatchObject({ status: 'unavailable', commentSource: 'unavailable' });
    expect(result.observation.pulls).toMatchObject({ status: 'unavailable' });
    expect(result.observation.reviews).toBeNull();
    expect(result.issueComparison.status).toBe('unavailable');
    expect(result.placement.reliability).toBe('uncertain');
    expect(result.findings.find((finding: { kind: string }) => finding.kind === 'pulls-unavailable').message).toContain('불완전');
  });

  it('flags failing and pending check runs in both languages for referenced and candidate PRs', async () => {
    for (const candidate of [false, true]) for (const [state, status, conclusion] of [['failing', 'completed', 'failure'], ['pending', 'in_progress', null]] as const) for (const lang of ['en', 'ko']) {
      const s = setup();
      const original = s.deps.fetch as Fetch;
      s.deps.fetch = async (url, init) => {
        const reply = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
        if (url.endsWith('/issues/10')) return reply({ number: 10, title: 'Task', html_url: 'https://github.com/me/Weaver/issues/10', state: 'open', labels: [], assignees: [] });
        if (url.includes('/issues/10/timeline')) return reply(candidate ? [] : [{ event: 'cross-referenced', source: { issue: { number: 7, title: 'work', html_url: 'https://github.com/me/Weaver/pull/7', repository_url: 'https://api.github.com/repos/me/Weaver', pull_request: {} } } }]);
        if (url.includes('/issues/10/comments') || url.includes('/pulls/7/reviews')) return reply([]);
        if (url.includes('/pulls?state=all')) return reply(candidate ? [{ number: 7, title: 'TASK-010', html_url: 'https://github.com/me/Weaver/pull/7', body: '', head: { ref: 'task-010' } }] : []);
        if (url.endsWith('/pulls/7')) return reply({ state: 'open', merged_at: null, body: '', head: { sha: 'head7' } });
        if (url.includes('/check-runs')) return reply({ total_count: 1, check_runs: [{ status, conclusion }] });
        if (url.endsWith('/graphql') && init?.body && (JSON.parse(init.body).query as string).includes('closingIssuesReferences(first:100')) return reply({ data: { repository: { pullRequest: { closingIssuesReferences: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } });
        return original(url, init);
      };
      expect(await run(['evidence', 'inspect', 'TASK-010', '--lang', lang], s.deps)).toBe(EXIT.ok);
      const result = JSON.parse(s.out.join(''));
      const finding = result.findings.find((item: { kind: string }) => item.kind === `checks-${state}`);
      expect(finding).toMatchObject({ url: 'https://github.com/me/Weaver/pull/7' });
      expect(finding.message).toContain(lang === 'ko' ? '체크' : 'check');
    }
  });

  it('marks a placement observed only when Project and direct Issue facts agree', async () => {
    const s = setup();
    const original = s.deps.fetch as Fetch;
    s.deps.fetch = async (url, init) => {
      if (url.endsWith('/issues/10')) return { ok: true, status: 200, json: async () => ({ number: 10, title: 'Task', html_url: 'https://github.com/me/Weaver/issues/10', state: 'open', labels: ['status:in-progress'], assignees: [] }) };
      if (url.includes('/issues/10/timeline') || url.includes('/issues/10/comments')) return { ok: true, status: 200, json: async () => [] };
      return original(url, init);
    };
    expect(await run(['evidence', 'inspect', 'TASK-010'], s.deps)).toBe(EXIT.ok);
    const result = JSON.parse(s.out.join(''));
    expect(result.issueComparison.status).toBe('consistent');
    expect(result.placement.reliability).toBe('observed');
    expect(result.findings.map((finding: { kind: string }) => finding.kind)).not.toContain('issue-observations-conflict');
  });

  it('reports each configured source and does not honor a disabled exception', async () => {
    for (const source of ['labels', 'board-status'] as const) {
      const s = setup();
      s.deps.files = async () => [FILES[0], { ...FILES[1], text: FILES[1].text.replace('assignee: claude-code', 'assignee: claude-code\nevidence_exception: accepted for review') }];
      const original = s.deps.fetch as Fetch;
      s.deps.fetch = async (url, init) => {
        if (url.includes('/contents/.weaver/process.yaml')) return { ok: true, status: 200, headers: { get: () => null }, text: async () => `columns:\n  source: ${source}\n${source === 'board-status' ? '  board:\n    In Progress: In progress\n' : ''}evidence:\n  exceptions: false\n` } as never;
        return original(url, init);
      };
      expect(await run(['evidence', 'inspect', 'TASK-010'], s.deps)).toBe(EXIT.ok);
      const result = JSON.parse(s.out.join(''));
      expect(result.process.columns.source).toBe(source);
      expect(result.tasks[0]).toMatchObject({ evidenceException: 'accepted for review', exceptionHonored: false });
      expect(result.placement).toBeTruthy();
    }
  });

  it('reads a linked Issue directly when a complete Project inventory has no card', async () => {
    const s = setup();
    const original = s.deps.fetch as Fetch;
    s.deps.fetch = async (url, init) => {
      if (url.endsWith('/graphql') && init?.body && (JSON.parse(init.body).query as string).includes('projectV2')) return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { title: 'Board', items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [issue(11)] } } } } }) };
      if (url.endsWith('/issues/10')) return { ok: true, status: 200, json: async () => ({ number: 10, title: 'Task', html_url: 'https://github.com/me/Weaver/issues/10', state: 'closed', labels: [], assignees: [] }) };
      if (url.includes('/issues/10/timeline') || url.includes('/issues/10/comments')) return { ok: true, status: 200, json: async () => [] };
      return original(url, init);
    };
    expect(await run(['evidence', 'inspect', 'TASK-010'], s.deps)).toBe(EXIT.ok);
    const result = JSON.parse(s.out.join(''));
    expect(result.membership).toBe('absent');
    expect(result.placement).toBeNull();
    expect(result.observation.issue).toMatchObject({ ok: true, issue: { state: 'closed' } });
    expect(result.observation.pulls).toMatchObject({ status: 'read', value: [] });
    expect(result.independentTests.status).toBe('no-structured-task-claim-or-issue-comments');
  });

  it('inspects a task-matched merged PR separately without inventing a timeline reference', async () => {
    const s = setup();
    const original = s.deps.fetch as Fetch;
    s.deps.fetch = async (url, init) => {
      const reply = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
      if (url.endsWith('/issues/10')) return reply({ number: 10, title: 'Task', html_url: 'https://github.com/me/Weaver/issues/10', state: 'closed', labels: [], assignees: [] });
      if (url.includes('/issues/10/timeline') || url.includes('/issues/10/comments')) return reply([]);
      if (url.includes('/pulls?state=all')) return reply([{ number: 7, title: 'feat: ten (TASK-010)', html_url: 'https://github.com/me/Weaver/pull/7', body: '', head: { ref: 'feat/task-010' } }]);
      if (url.endsWith('/pulls/7')) return reply({ state: 'closed', merged_at: '2026-11-01T00:00:00Z', body: '', head: { sha: 'head7' } });
      if (url.includes('/check-runs')) return reply({ total_count: 0, check_runs: [] });
      if (url.includes('/pulls/7/reviews')) return reply([{ html_url: 'https://github.com/me/Weaver/pull/7#pullrequestreview-1', user: { login: 'reviewer' }, state: 'APPROVED', body: '', submitted_at: '2026-11-01T00:00:00Z', commit_id: 'older' }]);
      if (url.endsWith('/graphql') && init?.body && (JSON.parse(init.body).query as string).includes('closingIssuesReferences(first:100')) return reply({ data: { repository: { pullRequest: { closingIssuesReferences: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } });
      return original(url, init);
    };
    expect(await run(['evidence', 'inspect', 'TASK-010'], s.deps)).toBe(EXIT.ok);
    const result = JSON.parse(s.out.join(''));
    expect(result.observation.pulls).toEqual({ status: 'read', value: [] });
    expect(result.candidateEvidence).toMatchObject([{ url: 'https://github.com/me/Weaver/pull/7', pull: { ok: true, closingAssociation: 'not-closing', facts: { checks: 'none', revision: 'head7', state: 'merged' } }, reviews: { status: 'read', value: [{ revision: 'older' }] } }]);
    expect(result.candidateEvidence[0].pull.facts).not.toHaveProperty('link');
    expect(result.findings.map((finding: { kind: string }) => finding.kind)).toContain('other-pr');
    expect(result.findings.map((finding: { kind: string }) => finding.kind)).toContain('no-checks');
    expect(result.findings.map((finding: { kind: string }) => finding.kind)).toContain('review-different-revision');
  });

  it('resolves a requirement entry when the task file has no Issue and rejects conflicting links', async () => {
    const missing = setup();
    missing.deps.files = async () => [FILES[0], { ...FILES[1], text: FILES[1].text.replace('issue: https://github.com/me/Weaver/issues/10\n', 'status: draft\n') }];
    expect(await run(['evidence', 'inspect', 'TASK-010'], missing.deps)).toBe(EXIT.ok);
    expect(JSON.parse(missing.out.join('')).tasks).toEqual([expect.objectContaining({ id: 'TASK-010' })]);

    const conflicting = setup();
    conflicting.deps.files = async () => [FILES[0], { ...FILES[1], text: FILES[1].text.replace('/issues/10', '/issues/11') }];
    expect(await run(['evidence', 'inspect', 'TASK-010'], conflicting.deps)).toBe(EXIT.usage);
    expect(JSON.parse(conflicting.out.join('')).error.code).toBe('cli.ambiguous');
  });

  it('finds a requirement-only task even when neither its file nor Project card exists', async () => {
    const s = setup();
    s.deps.files = async () => [FILES[0]];
    const original = s.deps.fetch as Fetch;
    s.deps.fetch = async (url, init) => {
      if (url.endsWith('/graphql') && init?.body && (JSON.parse(init.body).query as string).includes('projectV2')) return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { title: 'Board', items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } } }) };
      if (url.endsWith('/issues/10')) return { ok: true, status: 200, json: async () => ({ number: 10, title: 'Task', html_url: 'https://github.com/me/Weaver/issues/10', state: 'closed', labels: [], assignees: [] }) };
      if (url.includes('/issues/10/timeline') || url.includes('/issues/10/comments')) return { ok: true, status: 200, json: async () => [] };
      return original(url, init);
    };
    expect(await run(['evidence', 'inspect', 'TASK-010'], s.deps)).toBe(EXIT.ok);
    const result = JSON.parse(s.out.join(''));
    expect(result).toMatchObject({ membership: 'absent', observation: { issue: { ok: true, issue: { state: 'closed' } } }, tasks: [{ id: 'TASK-010', path: null, requirementPath: 'requirements/REQ-001.md', file: 'absent' }] });
    s.out.length = 0;
    s.deps.files = async () => [FILES[0], { path: 'tasks/broken.md', text: '---\ntype: task\nid: [\n---\n' }];
    expect(await run(['evidence', 'inspect', 'TASK-010'], s.deps)).toBe(EXIT.ok);
    expect(JSON.parse(s.out.join('')).tasks[0]).toMatchObject({ id: 'TASK-010', file: 'unknown' });
    s.out.length = 0;
    s.deps.files = async () => [{ ...FILES[0], text: `${FILES[0].text}- \`TASK-011\` Also linked — [Issue #10](https://github.com/me/Weaver/issues/10)\n` }];
    expect(await run(['evidence', 'inspect', 'https://github.com/me/Weaver/issues/10'], s.deps)).toBe(EXIT.ok);
    const shared = JSON.parse(s.out.join(''));
    expect(shared.sharedIssue).toBe(true);
    expect(shared.tasks.map((task: { id: string }) => task.id).sort()).toEqual(['TASK-010', 'TASK-011']);
    expect(shared.findings.map((finding: { kind: string }) => finding.kind)).toContain('shared-issue');
  });
});

describe('failures', () => {
  it('reports a missing registry, a missing token, and a bad command as JSON, or as text with --text', async () => {
    let s = setup({ registry: '' });
    expect(await run(['list'], s.deps)).toBe(EXIT.failed);
    expect(JSON.parse(s.out.join('')).error.code).toBe('cli.no-setup');

    s = setup({ token: undefined });
    expect(await run(['list'], s.deps)).toBe(EXIT.failed);
    expect(JSON.parse(s.out.join('')).error.code).toBe('cli.no-token');

    s = setup();
    expect(await run(['frobnicate'], s.deps)).toBe(EXIT.usage);
    expect(JSON.parse(s.out.join('')).error.code).toBe('cli.unknown-command');

    s = setup({ token: undefined });
    expect(await run(['list', '--text'], s.deps)).toBe(EXIT.failed);
    expect(s.out).toEqual([]);
    expect(s.err.join('')).toContain('gh auth login');
  });

  it('asks for a card, prints help, and answers in Korean on request', async () => {
    let s = setup();
    expect(await run(['show'], s.deps)).toBe(EXIT.usage);
    expect(JSON.parse(s.out.join('')).error.code).toBe('cli.missing-argument');

    s = setup();
    expect(await run(['--help'], s.deps)).toBe(EXIT.ok);
    expect(s.out.join('')).toContain('weaver <command>');

    s = setup({ token: undefined });
    expect(await run(['list', '--lang', 'ko'], s.deps)).toBe(EXIT.failed);
    expect(JSON.parse(s.out.join('')).error.message).toContain('토큰');
  });

  it('reads the language from WEAVER_LANG', async () => {
    const s = setup({ token: undefined });
    s.deps.env.WEAVER_LANG = 'ko';
    await run(['list'], s.deps);
    expect(JSON.parse(s.out.join('')).error.message).toContain('토큰');
  });
});

describe('weaver project add', () => {
  const ISSUE = 'https://github.com/me/Weaver/issues/12';
  const mutations = (writes: string[]) => writes.filter((q) => q.includes('addProjectV2ItemById'));

  it('shows the plan and adds nothing until the user approved that action', async () => {
    const { deps, out, err, writes } = setup();
    expect(await run(['project', 'add', ISSUE], deps)).toBe(EXIT.unconfirmed);
    const result = JSON.parse(out.join(''));
    expect(result).toMatchObject({ status: 'unconfirmed', actions: [{ kind: 'project.add', target: 'me/Weaver#12', outcome: 'unconfirmed' }] });
    expect(err.join('')).toContain('Add Issue me/Weaver#12 to the Project me/1.');
    expect(mutations(writes)).toEqual([]);
  });

  it('adds the Issue after the id of that action was approved, and records it in the log', async () => {
    const first = setup();
    await run(['project', 'add', ISSUE], first.deps);
    const id = JSON.parse(first.out.join('')).actions[0].id;

    const { deps, out, writes, logged } = setup();
    expect(await run(['project', 'add', 'me/Weaver#12', '--approve', id], deps)).toBe(EXIT.ok);
    expect(JSON.parse(out.join('')).status).toBe('done');
    expect(mutations(writes)).toHaveLength(1);
    expect(logged).toMatchObject([{ actor: 'steward', onBehalfOf: 'me', action: 'project.add', target: 'me/Weaver#12', outcome: 'done' }]);
  });

  it('does not take an approval of another Issue', async () => {
    const { deps, writes } = setup();
    expect(await run(['project', 'add', ISSUE, '--approve', 'deadbeef0000'], deps)).toBe(EXIT.unconfirmed);
    expect(mutations(writes)).toEqual([]);
  });

  it('asks at a terminal and honors a no', async () => {
    const { deps, writes } = setup();
    deps.interactive = true;
    deps.ask = async () => false;
    expect(await run(['project', 'add', ISSUE], deps)).toBe(EXIT.declined);
    expect(mutations(writes)).toEqual([]);
  });

  it('leaves out an Issue already on the Project, of another repository, or not an Issue', async () => {
    const { deps, out } = setup();
    expect(await run(['project', 'add', 'me/Weaver#10', 'me/Other#1', 'not-an-issue'], deps)).toBe(EXIT.ok);
    const result = JSON.parse(out.join(''));
    expect(result.status).toBe('nothing');
    expect(result.skipped).toEqual([
      { ref: 'me/Weaver#10', reason: 'already-on-project' },
      { ref: 'me/Other#1', reason: 'not-registered' },
      { ref: 'not-an-issue', reason: 'invalid' },
    ]);
  });

  it('asks for an Issue', async () => {
    const { deps, out } = setup();
    expect(await run(['project', 'add'], deps)).toBe(EXIT.usage);
    expect(JSON.parse(out.join('')).error.code).toBe('cli.missing-argument');
  });
});

describe('planProjectAdd', () => {
  it('plans each Issue once, whichever way it is written', () => {
    const plan = planProjectAdd(['me/Weaver#12', 'https://github.com/me/Weaver/issues/12/', 'me/weaver#12'], {
      token: 't',
      project: { owner: 'me', number: 1 },
      repositories: ['me/Weaver'],
      onProject: [],
    });
    expect(plan.actions).toHaveLength(1);
    expect(actionId(plan.actions[0])).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('weaver task create', () => {
  const ARGS = ['task', 'create', '--title', 'Add the export button', '--requirement', 'REQ-001', '--criteria', 'AC-001,ac-002', '--assignee', 'claude-code'];

  it('requires a server to disambiguate a requirement and does not modify another Git server', async () => {
    const source = [
      { ...FILES[0], repository: 'me/Weaver', repositoryServer: 'github.com' },
      { ...FILES[0], path: 'other/REQ-001.md', repository: 'me/Weaver', repositoryServer: 'git.example.com' },
    ];
    const ambiguous = setup();
    ambiguous.deps.files = async () => source;
    expect(await run(ARGS, ambiguous.deps)).toBe(EXIT.usage);
    expect(JSON.parse(ambiguous.out.join('')).error.code).toBe('cli.requirement-ambiguous');
    const other = setup();
    other.deps.files = async () => source;
    expect(await run([...ARGS, '--requirement-repository', 'me/Weaver', '--requirement-server', 'git.example.com'], other.deps)).toBe(EXIT.usage);
    expect(JSON.parse(other.out.join('')).error.code).toBe('cli.requirement-other-server');
    const github = setup();
    github.deps.files = async () => source;
    expect(await run([...ARGS, '--requirement-repository', 'me/Weaver', '--requirement-server', 'github.com'], github.deps)).toBe(EXIT.unconfirmed);
  });

  it('distinguishes server ports before attempting the GitHub-only write workflow', async () => {
    const s = setup();
    s.deps.files = async () => [
      { ...FILES[0], repository: 'me/Weaver', repositoryServer: 'git.example:8443' },
      { ...FILES[0], path: 'other/REQ-001.md', repository: 'me/Weaver', repositoryServer: 'git.example:9443' },
    ];
    expect(await run([...ARGS, '--requirement-repository', 'me/Weaver', '--requirement-server', 'GIT.EXAMPLE:09443'], s.deps)).toBe(EXIT.usage);
    expect(JSON.parse(s.out.join('')).error).toMatchObject({ code: 'cli.requirement-other-server', message: expect.stringContaining('git.example:9443') });
    expect(s.writes.filter(w => w.startsWith('REST'))).toEqual([]);
  });

  async function approvedIds() {
    const first = setup();
    await run(ARGS, first.deps);
    return JSON.parse(first.out.join('')).actions.map((a: { id: string }) => a.id) as string[];
  }

  it('shows the three actions, with the next free number, and creates nothing until they are approved', async () => {
    const { deps, out, err, writes, shell } = setup();
    expect(await run(ARGS, deps)).toBe(EXIT.unconfirmed);
    const result = JSON.parse(out.join(''));
    expect(result.actions.map((a: { kind: string }) => a.kind)).toEqual(['issue.create', 'project.add', 'files.pull-request']);
    expect(err.join('')).toContain('[TASK-041] Add the export button');
    expect(err.join('')).toContain('tasks/TASK-041.md');
    expect(writes.filter((w) => w.startsWith('REST') || w.includes('addProjectV2ItemById'))).toEqual([]);
    expect(shell.filter((s) => s.args[0] === 'push' || s.args[0] === 'worktree')).toEqual([]);
  });

  it('binds approval to task criteria and assignment as well as the visible target', async () => {
    const first = setup();
    await run(ARGS, first.deps);
    const plan = JSON.parse(first.out.join('')).actions;
    expect(plan[2].summary).toContain('AC-001, AC-002');
    expect(plan[2].summary).toContain('claude-code');
    const changed = setup();
    const modified = ARGS.map((value) => value === 'claude-code' ? 'other-agent' : value);
    expect(await run([...modified, '--approve', plan.map((a: { id: string }) => a.id).join(',')], changed.deps)).toBe(EXIT.unconfirmed);
    const result = JSON.parse(changed.out.join(''));
    expect(result.actions.every((action: { outcome: string }) => action.outcome === 'unconfirmed')).toBe(true);
    expect(changed.writes.filter((w) => w.startsWith('REST') || w.includes('addProjectV2ItemById'))).toEqual([]);
  });

  it('permits only one concurrent creator to reach Issue creation', async () => {
    const first = setup();
    await run(ARGS, first.deps);
    const ids = JSON.parse(first.out.join('')).actions.map((a: { id: string }) => a.id).join(',');
    const reservations = new Set<string>();
    const workers = [setup(), setup()];
    for (const worker of workers) {
      const original = worker.deps.fetch as Fetch;
      worker.deps.fetch = async (url, init) => {
        if (url.endsWith('/git/refs') && init.method === 'POST') {
          const { ref, sha } = JSON.parse(init.body) as { ref: string; sha: string };
          if (reservations.has(ref)) return { ok: false, status: 422, json: async () => ({}) };
          reservations.add(ref);
          return { ok: true, status: 201, json: async () => ({ ref, object: { sha } }) };
        }
        return original(url, init);
      };
    }
    const results = await Promise.all(workers.map((worker) => run([...ARGS, '--approve', ids], worker.deps)));
    expect(results.sort()).toEqual([EXIT.failed, EXIT.unconfirmed].sort());
    expect(workers.flatMap((worker) => worker.writes).filter((write) => write === 'REST https://api.github.com/repos/me/Weaver/issues')).toHaveLength(1);
    expect(reservations.size).toBe(3);
    expect([...reservations].some((ref) => ref.endsWith('/recover-pr-task-041'))).toBe(true);
  });

  it('creates the Issue, adds the card, and opens a pull request from a separate worktree once all three are approved', async () => {
    const ids = (await approvedIds()).join(',');
    const { deps, out, writes, shell, written, logged } = setup();
    expect(await run([...ARGS, '--approve', ids], deps)).toBe(EXIT.unconfirmed);
    const result = JSON.parse(out.join(''));
    expect(result.status).toBe('pending');
    expect(result.actions[0].identifiers).toMatchObject({ task: 'TASK-041', issue: 'https://github.com/me/Weaver/issues/77' });
    expect(result.actions[1].identifiers.projectItem).toBe('ITEM');
    expect(result.actions[2].identifiers.pullRequest).toBe('https://github.com/me/Weaver/pull/200');
    expect(writes).toContain('REST https://api.github.com/repos/me/Weaver/issues');
    expect(writes.some((w) => w.includes('addProjectV2ItemById'))).toBe(true);
    expect(logged.map((l) => l.action)).toEqual(['issue.create', 'project.add', 'files.pull-request']);

    const git = shell.filter((s) => s.command === 'git').map((s) => s.args.slice(0, 2).join(' '));
    expect(git.filter((entry) => entry !== 'config --get')).toEqual(['ls-remote --heads', 'ls-remote --heads', 'rev-parse --show-toplevel', 'fetch origin', 'worktree add', 'add -A', 'commit -m', 'push -u', 'worktree remove']);
    expect(git.filter((entry) => entry === 'config --get').length).toBeGreaterThanOrEqual(4);
    expect(shell.find((s) => s.args[0] === 'worktree' && s.args[1] === 'add')?.args).toContain('origin/main');
    expect(shell.find((s) => s.args[0] === 'pr' && s.args[1] === 'create')?.args).toContain('docs/task-041-add-the-export-button');
    expect(shell.find((s) => s.args[0] === 'commit')?.args[2]).toContain('Made by the Weaver steward on behalf of @me.');

    const task = written.find((w) => w.file.endsWith('TASK-041.md'));
    expect(task?.file.replace(/\\/g, '/')).toBe('/tmp/work/tasks/TASK-041.md');
    expect(task?.text).toContain('issue: https://github.com/me/Weaver/issues/77');
    expect(task?.text).toContain('criteria: [AC-001, AC-002]');
    expect(task?.text).toContain('assignee: claude-code');
    const requirement = written.find((w) => w.file.endsWith('REQ-001.md'));
    expect(requirement?.text).toContain('- `TASK-041` Add the export button — [GitHub Issue #77](https://github.com/me/Weaver/issues/77)');
  });

  it('retains an unexpected Issue URL but refuses to use it for subsequent writes', async () => {
    const ids = (await approvedIds()).join(',');
    const s = setup();
    const original = s.deps.fetch as Fetch;
    s.deps.fetch = async (url, init) => {
      if (url.endsWith('/repos/me/Weaver/issues') && init.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ number: 77, html_url: 'https://github.com/me/Other/issues/77' }) };
      }
      return original(url, init);
    };
    expect(await run([...ARGS, '--approve', ids], s.deps)).toBe(EXIT.failed);
    const result = JSON.parse(s.out.join(''));
    expect(result.actions[0].identifiers.issue).toBe('https://github.com/me/Other/issues/77');
    expect(result.actions[0].outcome).toBe('failed');
    expect(s.writes.some((write) => write.includes('addProjectV2ItemById'))).toBe(false);
    expect(s.shell.some((entry) => entry.args[0] === 'push')).toBe(false);
  });

  it('says what was already created when a later step fails, and cleans up the worktree', async () => {
    const ids = (await approvedIds()).join(',');
    const { deps, out, shell } = setup();
    const original = deps.system.run;
    deps.system.run = async (command, args, options) => {
      if (command === 'git' && args[0] === 'push') throw new Error('push rejected');
      return original(command, args, options);
    };
    expect(await run([...ARGS, '--approve', ids], deps)).toBe(EXIT.failed);
    const result = JSON.parse(out.join(''));
    expect(result.actions.map((a: { outcome: string }) => a.outcome)).toEqual(['done', 'done', 'failed']);
    expect(result.actions[2].message).toContain('push rejected');
    expect(result.actions[2].message).toContain('inspect the branch');
    expect(result.actions[2].identifiers).toMatchObject({ issue: 'https://github.com/me/Weaver/issues/77', projectItem: 'ITEM' });
    expect(shell.some((s) => s.args[0] === 'worktree' && s.args[1] === 'remove')).toBe(true);
  });

  it('refuses a target whose checkout origin is different or unavailable before writing', async () => {
    for (const origin of ['https://github.com/me/Other.git', 'https://git.example/me/Weaver.git', '']) {
      const s = setup();
      const original = s.deps.system.run;
      s.deps.system.run = async (command, args, options) => command === 'git' && args[0] === 'config' ? origin : original(command, args, options);
      expect(await run(ARGS, s.deps)).toBe(EXIT.failed);
      expect(JSON.parse(s.out.join('')).error.code).toBe('cli.task-create.checkout-unsafe');
      expect(s.writes.filter((entry) => entry.startsWith('REST') || entry.startsWith('RESERVE'))).toEqual([]);
    }
  });

  it('stops subsequent writes if the checkout origin changes after Issue creation', async () => {
    const ids = (await approvedIds()).join(',');
    const s = setup();
    const original = s.deps.system.run;
    let reads = 0;
    s.deps.system.run = async (command, args, options) => {
      if (command === 'git' && args[0] === 'config') return ++reads < 4 ? 'https://github.com/me/Weaver.git' : 'https://github.com/me/Other.git';
      return original(command, args, options);
    };
    expect(await run([...ARGS, '--approve', ids], s.deps)).toBe(EXIT.failed);
    const actions = JSON.parse(s.out.join('')).actions;
    expect(actions.map((action: { outcome: string }) => action.outcome)).toEqual(['done', 'failed', 'skipped']);
    expect(actions[0].identifiers.issue).toBe('https://github.com/me/Weaver/issues/77');
    expect(s.writes.some((entry) => entry.includes('addProjectV2ItemById'))).toBe(false);
  });

  it('rechecks the checkout origin immediately before pushing the file branch', async () => {
    const ids = (await approvedIds()).join(',');
    const s = setup();
    const original = s.deps.system.run;
    let reads = 0;
    s.deps.system.run = async (command, args, options) => {
      if (command === 'git' && args[0] === 'config') return ++reads < 8 ? 'https://github.com/me/Weaver.git' : 'https://github.com/me/Other.git';
      return original(command, args, options);
    };
    expect(await run([...ARGS, '--approve', ids], s.deps)).toBe(EXIT.failed);
    expect(JSON.parse(s.out.join('')).actions.map((action: { outcome: string }) => action.outcome)).toEqual(['done', 'done', 'failed']);
    expect(s.shell.some((call) => call.command === 'git' && call.args[0] === 'push')).toBe(false);
    expect(s.shell.some((call) => call.command === 'git' && call.args[0] === 'worktree' && call.args[1] === 'remove')).toBe(true);
  });

  it('does not overwrite an existing task file or add a duplicate requirement entry', async () => {
    const ids = (await approvedIds()).join(',');
    for (const conflict of ['file', 'requirement', 'unreadable'] as const) {
      const s = setup();
      const original = s.deps.system.readText;
      s.deps.system.readText = async (file) => {
        if (file.endsWith('TASK-041.md')) {
          if (conflict === 'unreadable') throw new Error('permission denied');
          if (conflict === 'file') return 'existing task';
        }
        const text = await original(file);
        return conflict === 'requirement' && file.endsWith('REQ-001.md') ? `${text}\n- \`TASK-041\` already recorded\n` : text;
      };
      expect(await run([...ARGS, '--approve', ids], s.deps)).toBe(EXIT.failed);
      const actions = JSON.parse(s.out.join('')).actions;
      expect(actions[2].outcome).toBe('failed');
      expect(actions[2].identifiers).toMatchObject({ issue: 'https://github.com/me/Weaver/issues/77', projectItem: 'ITEM' });
      if (conflict === 'requirement') expect(actions[2].message).toContain('differs from the approved source');
      expect(s.written).toEqual([]);
      expect(s.shell.some((call) => call.command === 'git' && call.args[0] === 'push')).toBe(false);
    }
  });

  it('skips the card and the pull request when the Issue was not created', async () => {
    const ids = (await approvedIds()).join(',');
    const { deps, out } = setup();
    const original = deps.fetch as Fetch;
    deps.fetch = async (url, init) => (url.endsWith('/issues') ? { ok: false, status: 422, json: async () => ({ message: 'Validation Failed' }) } : original(url, init));
    expect(await run([...ARGS, '--approve', ids], deps)).toBe(EXIT.failed);
    expect(JSON.parse(out.join('')).actions.map((a: { outcome: string }) => a.outcome)).toEqual(['failed', 'skipped', 'skipped']);
  });

  it('retains the Issue URL and stops when its post-write read fails or disagrees', async () => {
    const ids = (await approvedIds()).join(',');
    for (const scenario of ['unavailable', 'wrong-title', 'unknown-state', 'incomplete-label'] as const) {
      const s = setup();
      const original = s.deps.fetch as Fetch;
      s.deps.fetch = async (url, init) => {
        if (url.endsWith('/issues/77')) {
          if (scenario === 'unavailable') return { ok: false, status: 403, json: async () => ({}) };
          const response = await original(url, init);
          const issue = await response.json() as Record<string, unknown>;
          return { ...response, json: async () => scenario === 'wrong-title' ? { ...issue, title: 'changed by another actor' } : scenario === 'unknown-state' ? { ...issue, state: 'unknown' } : { ...issue, labels: [null] } };
        }
        return original(url, init);
      };
      expect(await run([...ARGS, '--approve', ids], s.deps)).toBe(EXIT.failed);
      const actions = JSON.parse(s.out.join('')).actions;
      expect(actions.map((a: { outcome: string }) => a.outcome)).toEqual(['failed', 'skipped', 'skipped']);
      expect(actions[0].identifiers.issue).toBe('https://github.com/me/Weaver/issues/77');
      expect(actions[0].message).toContain('could not be verified');
      expect(s.writes.some((write) => write.includes('addProjectV2ItemById'))).toBe(false);
    }
  });

  it('retains the Issue identity when the Project addition response is lost', async () => {
    const ids = (await approvedIds()).join(',');
    const s = setup();
    const original = s.deps.fetch as Fetch;
    s.deps.fetch = async (url, init) => {
      if (url.endsWith('/graphql') && init.body && init.body.includes('addProjectV2ItemById')) throw new Error('response lost');
      return original(url, init);
    };
    expect(await run([...ARGS, '--approve', ids], s.deps)).toBe(EXIT.failed);
    const actions = JSON.parse(s.out.join('')).actions;
    expect(actions[1].outcome).toBe('failed');
    expect(actions[1].identifiers.issue).toBe('https://github.com/me/Weaver/issues/77');
    expect(actions[1].message).toContain('Re-read the selected Project');
    expect(actions[1].message).toContain('response lost');
    expect(actions[1].identifiers.projectItem).toBeUndefined();
    expect(actions[2].outcome).toBe('skipped');
    const korean = setup();
    korean.deps.env.WEAVER_LANG = 'ko';
    const koreanOriginal = korean.deps.fetch as Fetch;
    korean.deps.fetch = async (url, init) => {
      if (url.endsWith('/graphql') && init.body && init.body.includes('addProjectV2ItemById')) throw new Error('response lost');
      return koreanOriginal(url, init);
    };
    expect(await run([...ARGS, '--approve', ids], korean.deps)).toBe(EXIT.failed);
    expect(JSON.parse(korean.out.join('')).actions[1].message).toContain('선택한 Project를 다시 조회하세요');
  });

  it('retains the Project item ID and stops when the new membership is not observed', async () => {
    const ids = (await approvedIds()).join(',');
    const s = setup();
    const original = s.deps.fetch as Fetch;
    let projectReads = 0;
    s.deps.fetch = async (url, init) => {
      const response = await original(url, init);
      if (url.endsWith('/graphql') && init.body && JSON.parse(init.body).query.includes('items(first:')) {
        projectReads += 1;
        if (projectReads > 1) {
          const body = await response.json() as { data: { repositoryOwner: { projectV2: { items: { nodes: unknown[] } } } } };
          body.data.repositoryOwner.projectV2.items.nodes = body.data.repositoryOwner.projectV2.items.nodes.filter((node) => (node as { id?: string }).id !== 'ITEM');
          return { ...response, json: async () => body };
        }
      }
      return response;
    };
    expect(await run([...ARGS, '--approve', ids], s.deps)).toBe(EXIT.failed);
    const actions = JSON.parse(s.out.join('')).actions;
    expect(actions.map((a: { outcome: string }) => a.outcome)).toEqual(['done', 'failed', 'skipped']);
    expect(actions[1].identifiers).toMatchObject({ issue: 'https://github.com/me/Weaver/issues/77', projectItem: 'ITEM' });
    expect(s.shell.some((call) => call.command === 'git' && call.args[0] === 'push')).toBe(false);
  });

  it('rechecks a delayed Project item without repeating its addition', async () => {
    const ids = await approvedIds();
    const s = setup();
    const original = s.deps.fetch as Fetch;
    const waits: number[] = [];
    let reads = 0;
    let additions = 0;
    s.deps.wait = async (milliseconds) => { waits.push(milliseconds); };
    s.deps.fetch = async (url, init) => {
      if (url.endsWith('/graphql') && init.body && JSON.parse(init.body).query.includes('addProjectV2ItemById')) additions += 1;
      const response = await original(url, init);
      if (url.endsWith('/graphql') && init.body && JSON.parse(init.body).query.includes('items(first:')) {
        reads += 1;
        if (reads > 1 && reads <= 3) {
          const body = await response.json() as { data: { repositoryOwner: { projectV2: { items: { nodes: unknown[] } } } } };
          body.data.repositoryOwner.projectV2.items.nodes = body.data.repositoryOwner.projectV2.items.nodes.filter((node) => (node as { id?: string }).id !== 'ITEM');
          return { ...response, json: async () => body };
        }
      }
      return response;
    };
    expect(await run([...ARGS, '--approve', ids.slice(0, 2).join(',')], s.deps)).toBe(EXIT.unconfirmed);
    const actions = JSON.parse(s.out.join('')).actions;
    expect(actions.map((action: { outcome: string }) => action.outcome)).toEqual(['done', 'done', 'unconfirmed']);
    expect(additions).toBe(1);
    expect(waits).toEqual([2000, 4000]);
    expect(actions[1].identifiers.projectItem).toBe('ITEM');
  });

  it('does not retry an inaccessible Project read after adding an item', async () => {
    const ids = await approvedIds();
    const s = setup();
    const original = s.deps.fetch as Fetch;
    let reads = 0;
    let waits = 0;
    s.deps.wait = async () => { waits += 1; };
    s.deps.fetch = async (url, init) => {
      if (url.endsWith('/graphql') && init.body && JSON.parse(init.body).query.includes('items(first:')) {
        reads += 1;
        if (reads > 1) return { ok: false, status: 403, json: async () => ({}) };
      }
      return original(url, init);
    };
    expect(await run([...ARGS, '--approve', ids.slice(0, 2).join(',')], s.deps)).toBe(EXIT.failed);
    expect(JSON.parse(s.out.join('')).actions[1].identifiers.projectItem).toBe('ITEM');
    expect(reads).toBe(2);
    expect(waits).toBe(0);
  });

  it('does not proceed when the Project read has another item for the same Issue', async () => {
    const ids = await approvedIds();
    const s = setup();
    const original = s.deps.fetch as Fetch;
    let reads = 0;
    let waits = 0;
    s.deps.wait = async () => { waits += 1; };
    s.deps.fetch = async (url, init) => {
      const response = await original(url, init);
      if (url.endsWith('/graphql') && init.body && JSON.parse(init.body).query.includes('items(first:')) {
        reads += 1;
        if (reads > 1) {
          const body = await response.json() as { data: { repositoryOwner: { projectV2: { items: { nodes: { id?: string }[] } } } } };
          const existing = body.data.repositoryOwner.projectV2.items.nodes.find((node) => node.id === 'ITEM');
          if (existing) body.data.repositoryOwner.projectV2.items.nodes.push({ ...existing, id: 'OTHER-ITEM' });
          return { ...response, json: async () => body };
        }
      }
      return response;
    };
    expect(await run([...ARGS, '--approve', ids.slice(0, 2).join(',')], s.deps)).toBe(EXIT.failed);
    expect(JSON.parse(s.out.join('')).actions[1].identifiers.projectItem).toBe('ITEM');
    expect(waits).toBe(0);
  });

  it('reports an unverified PR with its URL when the post-create read fails', async () => {
    const ids = (await approvedIds()).join(',');
    const s = setup();
    const original = s.deps.system.run;
    s.deps.system.run = async (command, args, options) => {
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'view') throw new Error('read unavailable');
      return original(command, args, options);
    };
    expect(await run([...ARGS, '--approve', ids], s.deps)).toBe(EXIT.failed);
    const actions = JSON.parse(s.out.join('')).actions;
    expect(actions.map((a: { outcome: string }) => a.outcome)).toEqual(['done', 'done', 'failed']);
    expect(actions[2].identifiers.pullRequest).toBe('https://github.com/me/Weaver/pull/200');
    expect(actions[2].message).toContain('could not be verified');
  });

  it('fails closed when the target process cannot be read', async () => {
    const { deps, out, writes } = setup();
    const original = deps.fetch as Fetch;
    deps.fetch = async (url, init) => url.includes('/contents/.weaver/process.yaml')
      ? { ok: false, status: 403, json: async () => ({ message: 'Forbidden' }) }
      : original(url, init);
    expect(await run(ARGS, deps)).toBe(EXIT.failed);
    expect(JSON.parse(out.join('')).error.code).toBe('cli.task-create.process-unsafe');
    expect(writes.filter((w) => w.startsWith('REST') || w.includes('addProjectV2ItemById'))).toEqual([]);
  });

  it('stops a retry when an Issue outside the Project has the same task title', async () => {
    const { deps, out, writes } = setup();
    const original = deps.fetch as Fetch;
    deps.fetch = async (url, init) => url.includes('/issues?state=all&')
      ? { ok: true, status: 200, json: async () => [{ title: '[TASK-041] Add the export button', html_url: 'https://github.com/me/Weaver/issues/77', body: 'Earlier issue' }] }
      : original(url, init);
    expect(await run(ARGS, deps)).toBe(EXIT.failed);
    expect(JSON.parse(out.join('')).error.code).toBe('cli.task-create.identity-ambiguous');
    expect(JSON.parse(out.join('')).error.details.candidates).toEqual([{ task: 'TASK-041', url: 'https://github.com/me/Weaver/issues/77', markerMatches: false }]);
    expect(writes.filter((w) => w.startsWith('REST'))).toEqual([]);
  });

  it('exposes a marked Issue candidate after a lost creation response without creating another Issue', async () => {
    const first = setup();
    await run(ARGS, first.deps);
    const issueAction = JSON.parse(first.out.join('')).actions[0].id;
    const s = setup();
    const original = s.deps.fetch as Fetch;
    let posted: { title: string; body: string } | undefined;
    let createCalls = 0;
    s.deps.fetch = async (url, init) => {
      if (url.endsWith('/issues') && init.method === 'POST') {
        createCalls += 1;
        posted = JSON.parse(init.body) as { title: string; body: string };
        throw new Error('response lost');
      }
      if (url.includes('/issues?state=all&') && posted) return { ok: true, status: 200, json: async () => [{ title: posted!.title, body: posted!.body, html_url: 'https://github.com/me/Weaver/issues/77' }] };
      return original(url, init);
    };
    expect(await run([...ARGS, '--approve', issueAction], s.deps)).toBe(EXIT.failed);
    expect(JSON.parse(s.out.join('')).actions[0].identifiers.issue).toBeUndefined();
    expect(JSON.parse(s.out.join('')).actions[0].message).toContain('Do not create another Issue');
    expect(JSON.parse(s.out.join('')).actions[0].message).toContain('prior executor has stopped');
    s.out.length = 0;
    expect(await run(ARGS, s.deps)).toBe(EXIT.failed);
    const result = JSON.parse(s.out.join(''));
    expect(result.error.details.candidates).toEqual([{ task: 'TASK-041', url: 'https://github.com/me/Weaver/issues/77', markerMatches: true }]);
    expect(result.error.message).toContain('--resume-issue');
    expect(createCalls).toBe(1);
  });

  it('refuses a new plan when an earlier operation reservation is visible but the Issue list is stale', async () => {
    const first = setup();
    await run(ARGS, first.deps);
    const issueAction = JSON.parse(first.out.join('')).actions[0].id;
    const s = setup();
    const original = s.deps.fetch as Fetch;
    let createCalls = 0;
    s.deps.fetch = async (url, init) => {
      if (url.endsWith('/issues') && init.method === 'POST') { createCalls += 1; throw new Error('response lost'); }
      return original(url, init);
    };
    expect(await run([...ARGS, '--approve', issueAction], s.deps)).toBe(EXIT.failed);
    s.out.length = 0;
    expect(await run(ARGS, s.deps)).toBe(EXIT.failed);
    expect(JSON.parse(s.out.join('')).error.code).toBe('cli.task-create.operation-reserved');
    expect(createCalls).toBe(1);
  });

  it('stops before creating an Issue if the repository inventory becomes unavailable or changes after planning', async () => {
    for (const outcome of ['denied', 'candidate'] as const) {
      const first = setup();
      await run(ARGS, first.deps);
      const id = JSON.parse(first.out.join('')).actions[0].id;
      const { deps, out, writes } = setup();
      const original = deps.fetch as Fetch;
      let reads = 0;
      deps.fetch = async (url, init) => {
        if (!url.includes('/issues?state=all&')) return original(url, init);
        reads += 1;
        if (reads === 1) return { ok: true, status: 200, json: async () => [] };
        return outcome === 'denied'
          ? { ok: false, status: 403, json: async () => ({}) }
          : { ok: true, status: 200, json: async () => [{ title: '[TASK-041] Another title' }] };
      };
      expect(await run([...ARGS, '--approve', id], deps)).toBe(EXIT.failed);
      expect(JSON.parse(out.join('')).actions[0].outcome).toBe('failed');
      expect(writes.filter((w) => w.startsWith('REST'))).toEqual([]);
    }
  });

  it('fails closed when a PR inventory page cannot be read or is malformed', async () => {
    for (const malformed of [false, true]) {
      const { deps, out, writes } = setup();
      const original = deps.fetch as Fetch;
      deps.fetch = async (url, init) => {
        if (url.includes('/pulls?state=all&')) return malformed
          ? { ok: true, status: 200, json: async () => [{ title: 'missing head' }] }
          : { ok: false, status: 403, json: async () => ({}) };
        return original(url, init);
      };
      expect(await run(ARGS, deps)).toBe(EXIT.failed);
      expect(JSON.parse(out.join('')).error.code).toBe('cli.task-create.inventory-unavailable');
      expect(writes.filter((w) => w.startsWith('REST'))).toEqual([]);
    }
  });

  it('stops later writes if the process changes after Issue creation', async () => {
    const first = setup();
    const initialFetch = first.deps.fetch as Fetch;
    first.deps.fetch = (async (url: string, init: unknown) => url.includes('/contents/.weaver/')
      ? { ok: true, status: 200, headers: { get: () => null }, text: async () => 'columns:\n  source: labels\n' }
      : initialFetch(url, init as never)) as unknown as Fetch;
    await run(ARGS, first.deps);
    const ids = JSON.parse(first.out.join('')).actions.map((a: { id: string }) => a.id).join(',');
    const s = setup();
    const original = s.deps.fetch as Fetch;
    let reads = 0;
    s.deps.fetch = (async (url: string, init: unknown) => {
      if (url.includes('/contents/.weaver/')) {
        reads += 1;
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => reads < 4 ? 'columns:\n  source: labels\n' : 'columns:\n  source: board-status\n' };
      }
      return original(url, init as never);
    }) as unknown as Fetch;
    expect(await run([...ARGS, '--approve', ids], s.deps)).toBe(EXIT.failed);
    const actions = JSON.parse(s.out.join('')).actions;
    expect(actions.map((a: { outcome: string }) => a.outcome)).toEqual(['done', 'failed', 'skipped']);
    expect(actions[0].identifiers.issue).toBe('https://github.com/me/Weaver/issues/77');
    expect(s.writes.some((w) => w.includes('addProjectV2ItemById'))).toBe(false);
  });

  it('refuses a missing requirement, a colon in the title, an unknown criterion, and a missing option', async () => {
    const code = async (args: string[]) => {
      const { deps, out } = setup();
      const exit = await run(args, deps);
      return [exit, JSON.parse(out.join('')).error.code];
    };
    expect(await code(['task', 'create', '--title', 'x', '--requirement', 'REQ-999'])).toEqual([EXIT.notFound, 'cli.requirement-not-found']);
    expect(await code(['task', 'create', '--title', 'a: b', '--requirement', 'REQ-001'])).toEqual([EXIT.usage, 'cli.bad-title']);
    expect(await code(['task', 'create', '--title', 'x', '--requirement', 'REQ-001', '--criteria', 'AC-009'])).toEqual([EXIT.usage, 'cli.unknown-criterion']);
    expect(await code(['task', 'create', '--title', 'x', '--requirement', 'REQ-001', '--repository', 'me/Other'])).toEqual([EXIT.usage, 'cli.repository-unregistered']);
    expect(await code(['task', 'create', '--title', 'x'])).toEqual([EXIT.usage, 'cli.missing-argument']);
  });
});

describe('weaver task create with a task contract (DEC-016)', () => {
  // Neutral names: the contract is the organization's, not Weaver's.
  const PROCESS = [
    'task:',
    '  fields:',
    '    owner:',
    '      required: true',
    '      values: [alpha, beta]',
    '      label: "owner:{value}"',
    '    priority:',
    '      values: [P0, P1]',
    '      source: project',
    '      project-field: Priority',
    '  body:',
    '    sections: [Context, Done when]',
    '',
  ].join('\n');
  const BASE = ['task', 'create', '--title', 'Add the export button', '--requirement', 'REQ-001'];

  /** The repository has the process file, and the Project has a Priority field; every write is recorded. */
  function withContract(text: string | null = PROCESS, options: { existingPriority?: string; omitFieldRead?: boolean; ignoreWrite?: boolean } = {}) {
    const s = setup();
    const original = s.deps.fetch as Fetch;
    const posted: { url: string; body: Record<string, unknown> }[] = [];
    let priority: string | undefined = options.existingPriority;
    s.deps.fetch = (async (url: string, init: { method?: string; body?: string }) => {
      if (url.includes('/contents/.weaver/')) {
        if (text === null) return original(url, init as never);
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => text };
      }
      const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      const reply = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
      if (typeof body.query === 'string' && body.query.includes('field(name:$f)')) {
        return reply({ data: { repositoryOwner: { projectV2: { id: 'PROJECT', field: { __typename: 'ProjectV2SingleSelectField', id: 'FIELD', options: [{ id: 'OPT0', name: 'P0' }, { id: 'OPT1', name: 'P1' }] } } } } });
      }
      if (typeof body.query === 'string' && body.query.includes('updateProjectV2ItemFieldValue')) {
        posted.push({ url: 'field', body });
        if (!options.ignoreWrite) priority = 'P1';
        return reply({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'ITEM' } } } });
      }
      if (url.endsWith('/issues')) posted.push({ url, body });
      const response = await original(url, init as never);
      if (typeof body.query === 'string' && body.query.includes('f0:fieldValueByName')) {
        const json = await response.json() as { data: { repositoryOwner: { projectV2: { items: { nodes: { id?: string; f0?: unknown }[] } } } } };
        for (const node of json.data.repositoryOwner.projectV2.items.nodes) if (node.id === 'ITEM' && !options.omitFieldRead) node.f0 = priority ? { name: priority } : null;
        return { ...response, json: async () => json };
      }
      return response;
    }) as unknown as Fetch;
    return { ...s, posted };
  }

  const FIELDS = ['--field', 'owner=alpha', '--field', 'priority=P1'];

  it('shows the labels, the Project field, and the file in the plan, and creates nothing until they are approved', async () => {
    const { deps, out, err, posted } = withContract();
    expect(await run([...BASE, ...FIELDS], deps)).toBe(EXIT.unconfirmed);
    expect(JSON.parse(out.join('')).actions.map((a: { kind: string }) => a.kind)).toEqual(['issue.create', 'project.add', 'project.field', 'files.pull-request']);
    const shown = err.join('');
    expect(shown).toContain('owner:alpha');
    expect(shown).toContain('Priority');
    expect(shown).toContain('owner=alpha');
    expect(shown).toContain('Context, Done when');
    expect(posted).toEqual([]);
  });

  it('writes only what the plan showed: the label, the board field, the file field, and the empty headings', async () => {
    const first = withContract();
    await run([...BASE, ...FIELDS], first.deps);
    const ids = (JSON.parse(first.out.join('')).actions as { id: string }[]).map((a) => a.id).join(',');

    const { deps, out, posted, written } = withContract();
    expect(await run([...BASE, ...FIELDS, '--approve', ids], deps)).toBe(EXIT.unconfirmed);
    expect(JSON.parse(out.join('')).status).toBe('pending');
    expect(JSON.parse(out.join('')).actions[2].identifiers).toMatchObject({ issue: 'https://github.com/me/Weaver/issues/77', projectItem: 'ITEM', field: 'Priority' });
    expect((posted.find((p) => p.url.endsWith('/issues'))?.body as { labels: string[] }).labels).toEqual(['task', 'status:backlog', 'owner:alpha']);
    expect(posted.find((p) => p.url === 'field')?.body.variables).toEqual({ p: 'PROJECT', i: 'ITEM', f: 'FIELD', o: 'OPT1' });
    const task = written.find((w) => w.file.endsWith('TASK-041.md'))?.text ?? '';
    expect(task).toContain('owner: alpha');
    expect(task).not.toContain('priority');
    expect(task).toMatch(/## Context\n\n## Done when\n/);
  });

  it('refuses an existing different value, an incomplete read, or an unconfirmed field write', async () => {
    const first = withContract();
    await run([...BASE, ...FIELDS], first.deps);
    const ids = (JSON.parse(first.out.join('')).actions as { id: string }[]).map((action) => action.id).join(',');
    for (const options of [{ existingPriority: 'P0' }, { omitFieldRead: true }, { ignoreWrite: true }]) {
      const s = withContract(PROCESS, options);
      expect(await run([...BASE, ...FIELDS, '--approve', ids], s.deps)).toBe(EXIT.failed);
      const actions = JSON.parse(s.out.join('')).actions;
      expect(actions[2].outcome).toBe('failed');
      expect(actions[2].identifiers).toMatchObject({ issue: 'https://github.com/me/Weaver/issues/77', projectItem: 'ITEM', field: 'Priority' });
      expect(actions[3].outcome).toBe('skipped');
      expect(s.posted.filter((post) => post.url === 'field')).toHaveLength(options.ignoreWrite ? 1 : 0);
    }
  });

  it('stops with a gap and creates nothing when a required field has no value or a value is not allowed', async () => {
    for (const [fields, gap] of [
      [[], 'the required task field "owner" has no value'],
      [['--field', 'owner=gamma'], 'is not one of: alpha, beta'],
      [['--field', 'owner=alpha', '--field', 'size=L'], 'declares no field "size"'],
    ] as const) {
      const { deps, out, posted } = withContract();
      expect(await run([...BASE, ...fields], deps)).toBe(EXIT.usage);
      const { error } = JSON.parse(out.join(''));
      expect(error.code).toBe('cli.task-create.contract-gaps');
      expect(error.message).toContain(gap);
      expect(posted).toEqual([]);
    }
  });

  it('keeps today\'s behavior without a task section, and refuses a field it cannot place', async () => {
    const plain = withContract('columns:\n  source: labels\n');
    expect(await run(BASE, plain.deps)).toBe(EXIT.unconfirmed);
    expect(JSON.parse(plain.out.join('')).actions.map((a: { kind: string }) => a.kind)).toEqual(['issue.create', 'project.add', 'files.pull-request']);
    expect(plain.err.join('')).toContain('with labels task, status:backlog.');

    const none = withContract(null);
    expect(await run([...BASE, '--field', 'owner=alpha'], none.deps)).toBe(EXIT.usage);
    expect(JSON.parse(none.out.join('')).error.code).toBe('cli.task-create.contract-gaps');
  });

  it('refuses a --field that is not written name=value', async () => {
    const { deps, out } = withContract();
    expect(await run([...BASE, '--field', 'owner'], deps)).toBe(EXIT.usage);
    expect(JSON.parse(out.join('')).error.code).toBe('cli.bad-field');
  });

  it('reads --field as many times as it is given', () => {
    const args = parseArgs(['task', 'create', '--field', 'a=1', '--field', 'b=2']);
    expect('unknown' in args ? [] : args.repeated.field).toEqual(['a=1', 'b=2']);
  });

  it('writes the declared fields and headings into the task file', () => {
    const text = renderTaskFile({ id: 'TASK-001', title: 'T', requirement: 'REQ-001', issueUrl: 'https://github.com/me/x/issues/1', issueNumber: 1, repository: 'me/x', criteria: [], assigneeType: 'agent', fileFields: [{ name: 'owner', value: 'alpha' }, { name: 'note', value: 'a: b' }], sections: ['Context'] });
    expect(text).toContain('assignee_type: agent\nowner: alpha\nnote: "a: b"\n---');
    expect(text.endsWith('the Kanban column comes from the Issue.\n\n## Context\n')).toBe(true);
  });
});

describe('task creation initial state', () => {
  const args = ['task', 'create', '--title', 'New task', '--requirement', 'REQ-001'];
  function configured(process: string, options: readonly string[] | null = ['Queue', 'Doing'], existingStatus?: string) {
    const s = setup();
    const original = s.deps.fetch as Fetch;
    const posted: { query?: string; variables?: Record<string, unknown>; labels?: string[] }[] = [];
    let added = false;
    let status: string | undefined = existingStatus;
    s.deps.fetch = (async (url: string, init: { body: string }) => {
      if (url.includes('/contents/.weaver/')) return { ok: true, status: 200, headers: { get: () => null }, text: async () => process };
      const body = JSON.parse(init.body || '{}');
      if (url.endsWith('/issues')) posted.push(body);
      if (body.query?.includes('field(name:$f)')) return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { id: 'P', field: { id: 'F', options: (options ?? []).map((name) => ({ id: `id-${name}`, name })) } } } } }) };
      if (body.query?.includes('updateProjectV2ItemFieldValue')) {
        posted.push(body);
        status = String(body.variables.o).replace(/^id-/, '');
        return { ok: true, status: 200, json: async () => ({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'ITEM' } } } }) };
      }
      if (body.query?.includes('addProjectV2ItemById')) added = true;
      const response = await original(url, init as never);
      if (body.query?.includes('items(first:')) {
        const data = await response.json() as { data: { repositoryOwner: { projectV2: { field?: unknown; items: { nodes: unknown[] } } } } };
        if (options) data.data.repositoryOwner.projectV2.field = { options: options.map((name) => ({ name })) };
        if (added) {
          data.data.repositoryOwner.projectV2.items.nodes = data.data.repositoryOwner.projectV2.items.nodes.filter((node) => (node as { id?: string }).id !== 'ITEM');
          data.data.repositoryOwner.projectV2.items.nodes.push({ ...issue(77, { title: '[TASK-041] New task', labels: { pageInfo: { hasNextPage: false }, nodes: [] } }), id: 'ITEM', fieldValueByName: status ? { name: status } : null });
        }
        return { ...response, json: async () => data };
      }
      return response;
    }) as unknown as Fetch;
    return { ...s, posted };
  }

  it('uses the configured initial column label', async () => {
    const process = 'columns:\n  source: labels\n  initial: Ready\n  labels:\n    Ready: state:queued\n';
    const first = configured(process);
    await run(args, first.deps);
    const ids = JSON.parse(first.out.join('')).actions.map((a: { id: string }) => a.id).join(',');
    const s = configured(process);
    expect(await run([...args, '--approve', ids], s.deps)).toBe(EXIT.unconfirmed);
    expect(s.posted[0].labels).toContain('state:queued');
    expect(s.posted[0].labels).not.toContain('status:backlog');
  });

  it('plans and writes the exact configured board option', async () => {
    const process = 'columns:\n  source: board-status\n  initial: Ready\n  board:\n    Queue: Ready\n    Doing: In progress\n';
    const first = configured(process);
    await run(args, first.deps);
    const actions = JSON.parse(first.out.join('')).actions;
    expect(actions.map((a: { kind: string }) => a.kind)).toEqual(['issue.create', 'project.add', 'project.field', 'files.pull-request']);
    const s = configured(process);
    expect(await run([...args, '--approve', actions.map((a: { id: string }) => a.id).join(',')], s.deps)).toBe(EXIT.unconfirmed);
    expect(s.posted[0].labels).not.toContain('status:backlog');
    expect(s.posted[1].variables).toMatchObject({ f: 'F', o: 'id-Queue', i: 'ITEM' });
  });

  it('refuses missing, ambiguous, or unreadable board options before any writes', async () => {
    for (const [board, options] of [
      ['    Queue: Ready\n    Other: Ready\n', ['Queue', 'Other']],
      ['    Queue: Ready\n', ['Doing']],
      ['    Queue: Ready\n', null],
    ] as const) {
      const s = configured(`columns:\n  source: board-status\n  initial: Ready\n  board:\n${board}`, options);
      expect(await run(args, s.deps)).toBe(EXIT.failed);
      expect(JSON.parse(s.out.join('')).error.code).toBe('cli.task-create.state-unsupported');
      expect(s.posted).toEqual([]);
    }
  });

  it('rejects an explicit label projection with a missing Project option', async () => {
    const s = configured('columns:\n  source: labels\n  projection:\n    Backlog: Missing\n');
    expect(await run(args, s.deps)).toBe(EXIT.failed);
    expect(JSON.parse(s.out.join('')).error.code).toBe('cli.task-create.state-unsupported');
    expect(s.posted).toEqual([]);
  });

  it('does not continue to files when the explicit label projection is not observed after adding the item', async () => {
    const process = 'columns:\n  source: labels\n  projection:\n    Backlog: Queue\n';
    const first = configured(process);
    await run(args, first.deps);
    const actions = JSON.parse(first.out.join('')).actions;
    const s = configured(process);
    expect(await run([...args, '--approve', actions.map((action: { id: string }) => action.id).join(',')], s.deps)).toBe(EXIT.failed);
    const result = JSON.parse(s.out.join(''));
    expect(result.actions.map((action: { outcome: string }) => action.outcome)).toEqual(['done', 'failed', 'skipped']);
    expect(result.actions[1].message).toContain('projection');
    expect(s.shell.some((call) => call.command === 'git' && call.args[0] === 'push')).toBe(false);
  });

  it('does not overwrite a status assigned by Project automation', async () => {
    const process = 'columns:\n  source: board-status\n  initial: Ready\n  board:\n    Queue: Ready\n    Doing: In progress\n';
    const first = configured(process);
    await run(args, first.deps);
    const actions = JSON.parse(first.out.join('')).actions;
    const s = configured(process, ['Queue', 'Doing'], 'Doing');
    expect(await run([...args, '--approve', actions.map((a: { id: string }) => a.id).join(',')], s.deps)).toBe(EXIT.failed);
    const result = JSON.parse(s.out.join(''));
    expect(result.actions[2].outcome).toBe('failed');
    expect(result.actions[2].message).toContain('already has a different value');
    expect(s.posted.filter((p) => p.query?.includes('updateProjectV2ItemFieldValue'))).toEqual([]);
  });
});

describe('task creation resume by explicit Issue', () => {
  const url = 'https://github.com/me/Weaver/issues/77';
  const args = ['task', 'create', '--title', 'New task', '--requirement', 'REQ-001', '--resume-issue', url];
  function fixture(options: { onProject?: boolean; issueTitle?: string; body?: string; conflictingPull?: boolean; branchExists?: boolean; hideAddedItem?: boolean; recoverBranch?: boolean; changedBranch?: boolean; boardUnset?: boolean; existingPull?: boolean; priority?: 'missing' | 'P0' | 'P1' | 'unreadable'; losePriorityResponse?: boolean; loseStatusResponse?: boolean; losePullResponse?: boolean; hideCreatedPull?: boolean } = {}) {
    const s = setup();
    const original = s.deps.fetch as Fetch;
    let createCount = 0;
    let added = false;
    let pullCreated = options.existingPull ?? false;
    let pullWrites = 0;
    let branchReads = 0;
    let boardStatus: string | undefined;
    let statusWrites = 0;
    let priorityValue: string | undefined = options.priority === 'P0' || options.priority === 'P1' ? options.priority : undefined;
    let priorityWrites = 0;
    const head = 'a'.repeat(40);
    s.deps.fetch = (async (request: string, init: { method?: string; body?: string }) => {
      if (options.priority && request.includes('/contents/.weaver/')) return { ok: true, status: 200, headers: { get: () => null }, text: async () => 'task:\n  fields:\n    priority:\n      source: project\n      project-field: Priority\n      values: [P0, P1]\n' };
      if (options.boardUnset && request.includes('/contents/.weaver/')) return { ok: true, status: 200, headers: { get: () => null }, text: async () => 'columns:\n  source: board-status\n  board:\n    Queue: Backlog\n    Doing: In progress\n' };
      const query = request.endsWith('/graphql') && init.body ? JSON.parse(init.body).query as string : '';
      if (options.priority && query.includes('field(name:$f)')) return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { id: 'P', field: { id: 'F', options: [{ id: 'P1', name: 'P1' }] } } } } }) };
      if (options.priority && query.includes('updateProjectV2ItemFieldValue')) { priorityWrites += 1; priorityValue = 'P1'; if (options.losePriorityResponse) throw new Error('response lost'); return { ok: true, status: 200, json: async () => ({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'ITEM77' } } } }) }; }
      if (options.boardUnset && query.includes('field(name:$f)')) return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { id: 'P', field: { id: 'F', options: [{ id: 'Q', name: 'Queue' }, { id: 'D', name: 'Doing' }] } } } } }) };
      if (options.boardUnset && query.includes('updateProjectV2ItemFieldValue')) { statusWrites += 1; boardStatus = 'Queue'; if (options.loseStatusResponse) throw new Error('response lost'); return { ok: true, status: 200, json: async () => ({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'ITEM77' } } } }) }; }
      if (request.endsWith('/issues/77')) return { ok: true, status: 200, json: async () => ({ number: 77, title: options.issueTitle ?? '[TASK-041] New task', html_url: url, state: 'open', labels: [{ name: 'status:ready' }], assignees: [], body: options.body ?? 'A task of REQ-001 (First). The definition is tasks/TASK-041.md.' }) };
      if (options.recoverBranch && request.includes('/contents/tasks/TASK-041.md?')) {
        const content = renderTaskFile({ id: 'TASK-041', title: 'New task', requirement: 'REQ-001', issueUrl: url, issueNumber: 77, repository: 'me/Weaver', criteria: [], assigneeType: 'agent' });
        return { ok: true, status: 200, json: async () => ({ type: 'file', encoding: 'base64', content: Buffer.from(content).toString('base64') }) };
      }
      if (options.recoverBranch && request.includes('/contents/requirements/REQ-001.md?')) return { ok: true, status: 200, json: async () => ({ type: 'file', encoding: 'base64', content: Buffer.from(taskListLine('TASK-041', 'New task', 77, url)).toString('base64') }) };
      if (options.recoverBranch && (request.includes('/pulls?state=all&head=') || request.endsWith('/pulls/200'))) {
        const item = { number: 200, html_url: 'https://github.com/me/Weaver/pull/200', state: 'open', head: { ref: 'docs/task-041-new-task', sha: head, repo: { full_name: 'me/Weaver' } }, base: { ref: 'main', repo: { full_name: 'me/Weaver' } } };
        return { ok: true, status: 200, json: async () => request.endsWith('/pulls/200') ? item : pullCreated && !options.hideCreatedPull ? [item] : [] };
      }
      if (request.includes('/issues?state=all&')) return { ok: true, status: 200, json: async () => [{ title: options.issueTitle ?? '[TASK-041] New task', html_url: url }] };
      if (request.includes('/pulls?state=all&') && pullCreated && !options.hideCreatedPull) return { ok: true, status: 200, json: async () => [{ title: 'TASK-041', head: { ref: 'docs/task-041-new-task' } }] };
      if (request.includes('/pulls?state=all&') && options.conflictingPull) return { ok: true, status: 200, json: async () => [{ title: 'TASK-041', head: { ref: 'task-041' } }] };
      if (request.endsWith('/issues') && init.method === 'POST') createCount += 1;
      if (request.endsWith('/graphql') && init.body && JSON.parse(init.body).query.includes('addProjectV2ItemById')) added = true;
      const response = await original(request, init as never);
      if ((options.onProject || (added && !options.hideAddedItem)) && request.endsWith('/graphql') && init.body && JSON.parse(init.body).query.includes('items(first:')) {
        const json = await response.json() as { data: { repositoryOwner: { projectV2: { field?: unknown; items: { nodes: unknown[] } } } } };
        if (options.boardUnset) json.data.repositoryOwner.projectV2.field = { options: [{ name: 'Queue' }, { name: 'Doing' }] };
        json.data.repositoryOwner.projectV2.items.nodes.push({ ...issue(77, { title: '[TASK-041] New task', labels: { pageInfo: { hasNextPage: false }, nodes: [{ name: 'status:ready' }] } }), id: options.onProject ? 'ITEM77' : 'ITEM', ...(options.boardUnset ? { fieldValueByName: boardStatus ? { name: boardStatus } : null } : {}), ...(options.priority && options.priority !== 'unreadable' && query.includes('f0:fieldValueByName') ? { f0: priorityValue ? { name: priorityValue } : null } : {}) });
        return { ...response, json: async () => json };
      }
      return response;
    }) as unknown as Fetch;
    if (options.branchExists) {
      const runSystem = s.deps.system.run;
      s.deps.system.run = async (command, argv, opts) => command === 'git' && argv[0] === 'ls-remote' ? 'existing refs/heads/docs/task-041-new-task\n' : runSystem(command, argv, opts);
    }
    if (options.recoverBranch) {
      const runSystem = s.deps.system.run;
      s.deps.system.run = async (command, argv, opts) => {
        if (command === 'git' && argv[0] === 'ls-remote') {
          branchReads += 1;
          return `${options.changedBranch && branchReads > 2 ? 'b'.repeat(40) : head}\trefs/heads/docs/task-041-new-task\n`;
        }
        if (command === 'gh' && argv[0] === 'pr' && argv[1] === 'create') { pullWrites += 1; pullCreated = true; if (options.losePullResponse) throw new Error('response lost'); return 'https://github.com/me/Weaver/pull/200\n'; }
        return runSystem(command, argv, opts);
      };
    }
    return { ...s, createCount: () => createCount, statusWrites: () => statusWrites, priorityWrites: () => priorityWrites, pullWrites: () => pullWrites };
  }

  it('reuses an existing Issue and Project item and only offers the file PR', async () => {
    const first = fixture({ onProject: true });
    expect(await run(args, first.deps)).toBe(EXIT.unconfirmed);
    const plan = JSON.parse(first.out.join('')).actions;
    expect(plan.map((a: { kind: string }) => a.kind)).toEqual(['files.pull-request']);
    expect(JSON.parse(first.out.join('')).context).toMatchObject({ task: 'TASK-041', issue: { url, labels: ['status:ready'] }, project: { membership: 'observed', item: 'ITEM77' }, files: 'unverified' });
    expect(JSON.parse(first.out.join('')).context.issue.intent).toBe('unverified');
    expect(first.err.join('')).toContain('no registration intent digest');
    const s = fixture({ onProject: true });
    expect(await run([...args, '--approve', plan[0].id], s.deps)).toBe(EXIT.unconfirmed);
    const result = JSON.parse(s.out.join(''));
    expect(result.status).toBe('pending');
    expect(result.actions[0].identifiers.issue).toBe(url);
    expect(s.createCount()).toBe(0);
    expect(s.writes.some((w) => w.includes('addProjectV2ItemById'))).toBe(false);
    expect(s.written.find((entry) => entry.file.endsWith('TASK-041.md'))?.text).toContain(`issue: ${url}`);
  });

  it('checks the original registration intent before resuming a newly created Issue', async () => {
    const createArgs = ['task', 'create', '--title', 'New task', '--requirement', 'REQ-001'];
    const plan = setup();
    await run(createArgs, plan.deps);
    const action = JSON.parse(plan.out.join('')).actions[0].id;
    const creator = setup();
    const original = creator.deps.fetch as Fetch;
    let body = '';
    creator.deps.fetch = async (request, init) => {
      if (request.endsWith('/issues') && init.method === 'POST') body = (JSON.parse(init.body) as { body: string }).body;
      return original(request, init);
    };
    await run([...createArgs, '--approve', action], creator.deps);
    expect(body).toContain('weaver-registration:v2');
    const same = fixture({ onProject: true, body });
    expect(await run(args, same.deps)).toBe(EXIT.unconfirmed);
    expect(JSON.parse(same.out.join('')).actions[0].kind).toBe('files.pull-request');
    expect(JSON.parse(same.out.join('')).context.issue.intent).toBe('matched');
    expect(same.err.join('')).not.toContain('no registration intent digest');
    for (const changedArgs of [['--assignee', 'other-agent'], ['--area', 'other-area'], ['--assignee-type', 'human'], ['--criteria', 'AC-001']]) {
      const changed = fixture({ onProject: true, body });
      expect(await run([...args, ...changedArgs], changed.deps)).toBe(EXIT.failed);
      expect(JSON.parse(changed.out.join('')).error.code).toBe('cli.task-create.resume-unsafe');
      expect(changed.writes.some((write) => write.includes('addProjectV2ItemById'))).toBe(false);
      expect(changed.shell.some((entry) => entry.args[0] === 'push')).toBe(false);
    }
  });

  it('warns in Korean when the original intent cannot be checked', async () => {
    const s = fixture({ onProject: true });
    s.deps.env.WEAVER_LANG = 'ko';
    expect(await run(args, s.deps)).toBe(EXIT.unconfirmed);
    expect(s.err.join('')).toContain('등록 요청의 지문이 없습니다');
  });

  it('adds a missing Project item without creating another Issue', async () => {
    const first = fixture();
    await run(args, first.deps);
    const plan = JSON.parse(first.out.join('')).actions;
    expect(plan.map((a: { kind: string }) => a.kind)).toEqual(['project.add', 'files.pull-request']);
    const s = fixture();
    expect(await run([...args, '--approve', plan.map((a: { id: string }) => a.id).join(',')], s.deps)).toBe(EXIT.unconfirmed);
    expect(s.createCount()).toBe(0);
    expect(s.writes.some((w) => w.includes('addProjectV2ItemById'))).toBe(true);
  });

  it('restores an unset board status only after approval and verifies the result', async () => {
    const first = fixture({ onProject: true, boardUnset: true });
    await run(args, first.deps);
    const plan = JSON.parse(first.out.join('')).actions;
    expect(plan.map((action: { kind: string }) => action.kind)).toEqual(['project.field', 'files.pull-request']);
    expect(plan[0].summary).toContain('unset Project Status');
    const s = fixture({ onProject: true, boardUnset: true });
    expect(await run([...args, '--approve', plan.map((action: { id: string }) => action.id).join(',')], s.deps)).toBe(EXIT.unconfirmed);
    expect(JSON.parse(s.out.join('')).status).toBe('pending');
    expect(s.statusWrites()).toBe(1);
    expect(s.createCount()).toBe(0);
  });

  it('rereads board Status after a lost response without repeating the write', async () => {
    const s = fixture({ onProject: true, boardUnset: true, loseStatusResponse: true });
    await run(args, s.deps);
    const statusId = JSON.parse(s.out.join('')).actions[0].id;
    s.out.length = 0;
    expect(await run([...args, '--approve', statusId], s.deps)).toBe(EXIT.failed);
    const failed = JSON.parse(s.out.join('')).actions[0];
    expect(failed.identifiers).toMatchObject({ issue: url, projectItem: 'ITEM77', field: 'Status' });
    expect(failed.message).toContain('Re-read the selected item');
    expect(s.statusWrites()).toBe(1);
    s.out.length = 0;
    expect(await run(args, s.deps)).toBe(EXIT.unconfirmed);
    expect(JSON.parse(s.out.join('')).actions.map((action: { kind: string }) => action.kind)).toEqual(['files.pull-request']);
    expect(s.statusWrites()).toBe(1);
  });

  it('recovers an uncertain board write through a pending file PR without duplicate mutations', async () => {
    const s = fixture({ onProject: true, boardUnset: true, loseStatusResponse: true, recoverBranch: true });
    expect(await run(args, s.deps)).toBe(EXIT.unconfirmed);
    const firstPlan = JSON.parse(s.out.join(''));
    const status = firstPlan.actions.find((action: { kind: string }) => action.kind === 'project.field');
    expect(status).toBeDefined();
    s.out.length = 0;
    expect(await run([...args, '--approve', status.id], s.deps)).toBe(EXIT.failed);
    expect(JSON.parse(s.out.join('')).actions[0]).toMatchObject({ kind: 'project.field', outcome: 'failed' });
    expect(s.statusWrites()).toBe(1);
    expect(s.pullWrites()).toBe(0);
    s.out.length = 0;
    expect(await run(args, s.deps)).toBe(EXIT.unconfirmed);
    const secondPlan = JSON.parse(s.out.join(''));
    expect(secondPlan.actions.map((action: { kind: string }) => action.kind)).toEqual(['files.pull-request']);
    s.out.length = 0;
    expect(await run([...args, '--approve', secondPlan.actions[0].id], s.deps)).toBe(EXIT.unconfirmed);
    expect(JSON.parse(s.out.join('')).status).toBe('pending');
    expect(s.createCount()).toBe(0);
    expect(s.statusWrites()).toBe(1);
    expect(s.pullWrites()).toBe(1);
    s.out.length = 0;
    expect(await run(args, s.deps)).toBe(EXIT.unconfirmed);
    const repeated = JSON.parse(s.out.join(''));
    expect(repeated.status).toBe('pending');
    expect(repeated.actions).toEqual([]);
    expect(s.createCount()).toBe(0);
    expect(s.statusWrites()).toBe(1);
    expect(s.pullWrites()).toBe(1);
  });

  it('does not open a file PR while the unset status action awaits approval', async () => {
    const first = fixture({ onProject: true, boardUnset: true });
    await run(args, first.deps);
    const plan = JSON.parse(first.out.join('')).actions;
    const s = fixture({ onProject: true, boardUnset: true });
    expect(await run([...args, '--approve', plan[1].id], s.deps)).toBe(EXIT.unconfirmed);
    expect(JSON.parse(s.out.join('')).actions.map((action: { outcome: string }) => action.outcome)).toEqual(['unconfirmed', 'unconfirmed']);
    expect(s.statusWrites()).toBe(0);
    expect(s.shell.some((call) => call.command === 'git' && call.args[0] === 'push')).toBe(false);
  });

  it('resumes a missing configured Project field and skips an already matching field', async () => {
    const taskArgs = [...args, '--field', 'priority=P1'];
    const first = fixture({ onProject: true, priority: 'missing' });
    await run(taskArgs, first.deps);
    const plan = JSON.parse(first.out.join('')).actions;
    expect(plan.map((action: { kind: string }) => action.kind)).toEqual(['project.field', 'files.pull-request']);
    const s = fixture({ onProject: true, priority: 'missing' });
    expect(await run([...taskArgs, '--approve', plan.map((action: { id: string }) => action.id).join(',')], s.deps)).toBe(EXIT.unconfirmed);
    expect(JSON.parse(s.out.join('')).status).toBe('pending');
    expect(s.priorityWrites()).toBe(1);
    const matching = fixture({ onProject: true, priority: 'P1' });
    await run(taskArgs, matching.deps);
    expect(JSON.parse(matching.out.join('')).actions.map((action: { kind: string }) => action.kind)).toEqual(['files.pull-request']);
    expect(matching.priorityWrites()).toBe(0);
  });

  it('rereads a Project field after a lost write response without writing it again', async () => {
    const taskArgs = [...args, '--field', 'priority=P1'];
    const s = fixture({ onProject: true, priority: 'missing', losePriorityResponse: true });
    await run(taskArgs, s.deps);
    const fieldId = JSON.parse(s.out.join('')).actions[0].id;
    s.out.length = 0;
    expect(await run([...taskArgs, '--approve', fieldId], s.deps)).toBe(EXIT.failed);
    expect(JSON.parse(s.out.join('')).actions[0].identifiers).toMatchObject({ issue: url, projectItem: 'ITEM77', field: 'Priority' });
    expect(JSON.parse(s.out.join('')).actions[0].message).toContain('Re-read the selected item');
    expect(s.priorityWrites()).toBe(1);
    s.out.length = 0;
    expect(await run(taskArgs, s.deps)).toBe(EXIT.unconfirmed);
    expect(JSON.parse(s.out.join('')).actions.map((action: { kind: string }) => action.kind)).toEqual(['files.pull-request']);
    expect(s.priorityWrites()).toBe(1);
  });

  it('refuses conflicting or unreadable configured Project fields on resume', async () => {
    for (const priority of ['P0', 'unreadable'] as const) {
      const s = fixture({ onProject: true, priority });
      expect(await run([...args, '--field', 'priority=P1'], s.deps)).toBe(EXIT.failed);
      expect(JSON.parse(s.out.join('')).error.code).toBe('cli.task-create.resume-unsafe');
      expect(s.priorityWrites()).toBe(0);
    }
  });

  it('restores a missing configured field with an existing PR and then rechecks without a duplicate', async () => {
    const s = fixture({ onProject: true, priority: 'missing', recoverBranch: true, existingPull: true });
    const taskArgs = [...args, '--field', 'priority=P1'];
    expect(await run(taskArgs, s.deps)).toBe(EXIT.unconfirmed);
    const plan = JSON.parse(s.out.join(''));
    expect(plan.actions.map((action: { kind: string }) => action.kind)).toEqual(['project.field']);
    expect(plan.context.files).toBe('proposed');
    s.out.length = 0;
    expect(await run([...taskArgs, '--approve', plan.actions[0].id], s.deps)).toBe(EXIT.unconfirmed);
    expect(JSON.parse(s.out.join('')).status).toBe('incomplete');
    expect(s.priorityWrites()).toBe(1);
    s.out.length = 0;
    expect(await run(taskArgs, s.deps)).toBe(EXIT.unconfirmed);
    expect(JSON.parse(s.out.join('')).status).toBe('pending');
    expect(JSON.parse(s.out.join('')).actions).toEqual([]);
    expect(s.priorityWrites()).toBe(1);
  });

  it('restores a missing configured field before proposing a PR from an existing branch', async () => {
    const s = fixture({ onProject: true, priority: 'missing', recoverBranch: true });
    const taskArgs = [...args, '--field', 'priority=P1'];
    expect(await run(taskArgs, s.deps)).toBe(EXIT.unconfirmed);
    const plan = JSON.parse(s.out.join(''));
    expect(plan.actions.map((action: { kind: string }) => action.kind)).toEqual(['project.field']);
    expect(plan.context.files).toBe('branch-observed');
    s.out.length = 0;
    expect(await run([...taskArgs, '--approve', plan.actions[0].id], s.deps)).toBe(EXIT.unconfirmed);
    expect(JSON.parse(s.out.join('')).status).toBe('incomplete');
    expect(s.priorityWrites()).toBe(1);
    s.out.length = 0;
    expect(await run(taskArgs, s.deps)).toBe(EXIT.unconfirmed);
    const next = JSON.parse(s.out.join(''));
    expect(next.actions.map((action: { kind: string }) => action.kind)).toEqual(['files.pull-request']);
    expect(next.actions[0].summary).toContain('existing branch');
    expect(s.priorityWrites()).toBe(1);
  });

  it('restores missing status without duplicating an existing verified PR', async () => {
    const s = fixture({ onProject: true, boardUnset: true, recoverBranch: true, existingPull: true });
    expect(await run(args, s.deps)).toBe(EXIT.unconfirmed);
    const first = JSON.parse(s.out.join(''));
    expect(first.actions.map((action: { kind: string }) => action.kind)).toEqual(['project.field']);
    expect(first.context.files).toBe('proposed');
    s.out.length = 0;
    expect(await run([...args, '--approve', first.actions[0].id], s.deps)).toBe(EXIT.unconfirmed);
    const updated = JSON.parse(s.out.join(''));
    expect(updated.status).toBe('incomplete');
    expect(updated.actions[0].outcome).toBe('done');
    expect(s.statusWrites()).toBe(1);
    s.out.length = 0;
    expect(await run(args, s.deps)).toBe(EXIT.unconfirmed);
    const checked = JSON.parse(s.out.join(''));
    expect(checked.status).toBe('pending');
    expect(checked.actions).toEqual([]);
    expect(checked.context.pullRequest.url).toBe('https://github.com/me/Weaver/pull/200');
    expect(s.statusWrites()).toBe(1);
  });

  it('refuses mismatched identity or a PR that may already contain the task', async () => {
    for (const options of [{ body: 'A task of REQ-999' }, { body: 'A task of REQ-001 (First). The definition is tasks/TASK-041.md.\n\n<!-- weaver-registration:v1 operation=other task=TASK-041 -->' }, { issueTitle: '[TASK-041] Other' }, { conflictingPull: true }]) {
      const s = fixture(options);
      expect(await run(args, s.deps)).toBe(EXIT.failed);
      expect(JSON.parse(s.out.join('')).error.code).toBe('cli.task-create.resume-unsafe');
      expect(s.createCount()).toBe(0);
    }
  });

  it('does not push over a branch left by an earlier uncertain attempt', async () => {
    const first = fixture({ onProject: true });
    await run(args, first.deps);
    const id = JSON.parse(first.out.join('')).actions[0].id;
    const s = fixture({ onProject: true, branchExists: true });
    expect(await run([...args, '--approve', id], s.deps)).toBe(EXIT.failed);
    expect(s.shell.some((call) => call.command === 'git' && call.args[0] === 'push')).toBe(false);
  });

  it('reports an uncertain Project addition and does not start the file PR when the post-read misses it', async () => {
    const first = fixture();
    await run(args, first.deps);
    const plan = JSON.parse(first.out.join('')).actions;
    const s = fixture({ hideAddedItem: true });
    expect(await run([...args, '--approve', plan.map((a: { id: string }) => a.id).join(',')], s.deps)).toBe(EXIT.failed);
    const actions = JSON.parse(s.out.join('')).actions;
    expect(actions.map((a: { outcome: string }) => a.outcome)).toEqual(['failed', 'skipped']);
    expect(actions[0].identifiers.issue).toBe(url);
    expect(s.shell.some((call) => call.command === 'git' && call.args[0] === 'push')).toBe(false);
  });

  it('offers only a separately approved PR for a verified existing branch', async () => {
    const s = fixture({ onProject: true, recoverBranch: true });
    expect(await run(args, s.deps)).toBe(EXIT.unconfirmed);
    const plan = JSON.parse(s.out.join('')).actions;
    expect(plan).toHaveLength(1);
    expect(plan[0].summary).toContain('existing branch');
    s.out.length = 0;
    expect(await run([...args, '--approve', plan[0].id], s.deps)).toBe(EXIT.unconfirmed);
    const result = JSON.parse(s.out.join(''));
    expect(result.status).toBe('pending');
    expect(result.actions[0].identifiers.pullRequest).toBe('https://github.com/me/Weaver/pull/200');
    expect(s.createCount()).toBe(0);
    expect(s.shell.some((call) => call.command === 'git' && call.args[0] === 'push')).toBe(false);
  });

  it('finds the existing PR after its creation response is lost', async () => {
    const s = fixture({ onProject: true, recoverBranch: true, losePullResponse: true });
    expect(await run(args, s.deps)).toBe(EXIT.unconfirmed);
    const id = JSON.parse(s.out.join('')).actions[0].id;
    s.out.length = 0;
    expect(await run([...args, '--approve', id], s.deps)).toBe(EXIT.failed);
    expect(JSON.parse(s.out.join('')).actions[0].identifiers).toMatchObject({ issue: url, branch: 'docs/task-041-new-task' });
    expect(JSON.parse(s.out.join('')).actions[0].message).toContain('inspect the branch');
    expect(s.pullWrites()).toBe(1);
    s.out.length = 0;
    expect(await run(args, s.deps)).toBe(EXIT.unconfirmed);
    const result = JSON.parse(s.out.join(''));
    expect(result.status).toBe('pending');
    expect(result.context.pullRequest.url).toBe('https://github.com/me/Weaver/pull/200');
    expect(result.actions).toEqual([]);
    expect(s.pullWrites()).toBe(1);
  });

  it('does not create a second PR if the first remains hidden after a lost response', async () => {
    const s = fixture({ onProject: true, recoverBranch: true, losePullResponse: true, hideCreatedPull: true });
    await run(args, s.deps);
    const id = JSON.parse(s.out.join('')).actions[0].id;
    s.out.length = 0;
    expect(await run([...args, '--approve', id], s.deps)).toBe(EXIT.failed);
    expect(s.pullWrites()).toBe(1);
    s.out.length = 0;
    expect(await run([...args, '--approve', id], s.deps)).toBe(EXIT.failed);
    expect(JSON.parse(s.out.join('')).actions[0].message).toContain('reservation');
    expect(s.pullWrites()).toBe(1);
  });

  it('refuses a branch that changes after the recovery plan', async () => {
    const s = fixture({ onProject: true, recoverBranch: true, changedBranch: true });
    await run(args, s.deps);
    const plan = JSON.parse(s.out.join('')).actions;
    s.out.length = 0;
    expect(await run([...args, '--approve', plan[0].id], s.deps)).toBe(EXIT.unconfirmed);
    expect(JSON.parse(s.out.join('')).actions[0].id).not.toBe(plan[0].id);
    expect(s.createCount()).toBe(0);
    expect(s.shell.some((call) => call.command === 'git' && call.args[0] === 'push')).toBe(false);
  });
});

describe('task file helpers', () => {
  it('numbers after the largest task anywhere, ignoring other text', () => {
    expect(nextTaskNumber(['TASK-009', '[TASK-012] x', 'docs/task-040-y', 'no task'])).toBe(41);
    expect(nextTaskNumber([])).toBe(1);
  });

  it('makes a short branch slug', () => {
    expect(slugOf('Add the export button!')).toBe('add-the-export-button');
    expect(slugOf('???')).toBe('task');
    expect(slugOf('x'.repeat(60)).length).toBeLessThanOrEqual(40);
  });

  it('renders the task file header, leaving out an assignee that was not given', () => {
    const text = renderTaskFile({ id: 'TASK-041', title: 'Export', requirement: 'REQ-001', issueUrl: 'https://github.com/me/Weaver/issues/77', issueNumber: 77, repository: 'me/Weaver', criteria: ['AC-001'], assigneeType: 'agent' });
    expect(text.startsWith('---\nid: TASK-041\ntype: task\ntitle: Export\n')).toBe(true);
    expect(text).not.toContain('assignee:');
  });

  it('replaces the placeholder sentence when the first task starts the list, and keeps other text', () => {
    const line = taskListLine('TASK-001', 'One', 1, 'https://github.com/o/r/issues/1');
    const placeholder = '# R\n\n## Tasks\n\nTasks are not created yet. They are split once the open decisions are settled.\n\n## Evidence\n\ntext\n';
    expect(addTaskToRequirement(placeholder, line)).toBe('# R\n\n## Tasks\n\n' + line + '\n\n## Evidence\n\ntext\n');
    // A wrapped placeholder (two lines) goes as a whole; a section with other prose keeps it.
    const wrapped = '## Tasks\n\nTasks are not created yet.\nThey come later.\n';
    expect(addTaskToRequirement(wrapped, line)).toBe('## Tasks\n\n' + line + '\n');
    expect(addTaskToRequirement('## Tasks\n\nNone yet.\n', line)).toBe('## Tasks\n\n' + line + '\n\nNone yet.\n');
    // With CRLF the same holds.
    expect(addTaskToRequirement('## Tasks\r\n\r\nTasks are not created yet.\r\n', line)).toBe('## Tasks\r\n\r\n' + line + '\r\n');
  });

  it('adds a task line at the end of the list under Tasks, or starts the list', () => {
    const line = taskListLine('TASK-002', 'Two', 2, 'https://github.com/o/r/issues/2');
    const withList = '# R\n\n## Tasks\n\n- `TASK-001` One\n\n## Evidence\n\ntext\n';
    expect(addTaskToRequirement(withList, line)).toBe('# R\n\n## Tasks\n\n- `TASK-001` One\n' + line + '\n\n## Evidence\n\ntext\n');
    expect(addTaskToRequirement('## Tasks\n\nNone yet.\n', line)).toBe('## Tasks\n\n' + line + '\n\nNone yet.\n');
    expect(addTaskToRequirement('# no tasks section\n', line)).toBeUndefined();
    expect(addTaskToRequirement('## Tasks\r\n\r\n- a\r\n', line)).toBe('## Tasks\r\n\r\n- a\r\n' + line + '\r\n');
  });
});

describe('weaver card move', () => {
  const MOVE = ['card', 'move', 'me/Weaver#10', '--to', 'review'];

  it('shows what will change and changes nothing until that action is approved', async () => {
    const { deps, out, err } = setup();
    const gh = withGitHub(deps);
    expect(await run(MOVE, deps)).toBe(EXIT.unconfirmed);
    expect(err.join('')).toContain('Move me/Weaver#10 to Review:');
    expect(err.join('')).toContain('status:review');
    expect(JSON.parse(out.join('')).actions[0].kind).toBe('card.move');
    expect(gh.calls).toEqual([]);
  });

  it('moves the labels, the state, and the board Status once approved, and logs it', async () => {
    const first = setup();
    withGitHub(first.deps);
    await run(MOVE, first.deps);
    const id = JSON.parse(first.out.join('')).actions[0].id;

    const { deps, out, logged } = setup();
    const gh = withGitHub(deps);
    expect(await run([...MOVE, '--approve', id], deps)).toBe(EXIT.ok);
    expect(JSON.parse(out.join('')).status).toBe('done');
    expect(gh.calls).toEqual([
      'DELETE /repos/me/Weaver/issues/10/labels/status%3Ain-progress',
      'POST /repos/me/Weaver/issues/10/labels',
      'PATCH /repos/me/Weaver/issues/10',
      'POST graphql items',
      'POST graphql status',
    ]);
    expect(logged).toMatchObject([{ action: 'card.move', target: 'me/Weaver#10', outcome: 'done' }]);
  });

  it('gives the same approval id in every language', async () => {
    const ids: string[] = [];
    for (const lang of ['en', 'ko']) {
      const { deps, out } = setup();
      withGitHub(deps);
      await run([...MOVE, '--lang', lang], deps);
      ids.push(JSON.parse(out.join('')).actions[0].id);
    }
    expect(ids[0]).toBe(ids[1]);
  });

  it('does nothing when the card is already in that column', async () => {
    const { deps, out } = setup();
    withGitHub(deps);
    expect(await run(['card', 'move', 'me/Weaver#10', '--to', 'in-progress'], deps)).toBe(EXIT.ok);
    expect(JSON.parse(out.join('')).status).toBe('nothing');
  });

  it('refuses a move to Verified when no pull request is linked and the task has no exception', async () => {
    const { deps, out } = setup();
    const gh = withGitHub(deps, { linkedPull: false });
    expect(await run(['card', 'move', 'TASK-010', '--to', 'Verified'], deps)).toBe(EXIT.usage);
    const result = JSON.parse(out.join(''));
    expect(result.error.code).toBe('cli.move-refused');
    expect(gh.calls.some((c) => c.startsWith('PATCH'))).toBe(false);
  });

  it('allows a move to Verified with a linked pull request, closing the Issue', async () => {
    const { deps, out, err } = setup();
    const gh = withGitHub(deps, { linkedPull: true });
    expect(await run(['card', 'move', 'TASK-010', '--to', 'Verified'], deps)).toBe(EXIT.unconfirmed);
    expect(JSON.parse(out.join('')).actions[0].kind).toBe('card.move');
    expect(err.join('')).toContain('Close the Issue');
    expect(gh.calls.some((c) => c.startsWith('PATCH'))).toBe(false);
  });

  it('keeps the Verified move blocked when check-run retrieval fails despite a readable PR', async () => {
    const { deps, out } = setup();
    withGitHub(deps, { linkedPull: true });
    const original = deps.fetch as Fetch;
    deps.fetch = async (url, init) => url.includes('/check-runs')
      ? { ok: false, status: 403, json: async () => ({}) }
      : original(url, init);
    expect(await run(['card', 'move', 'TASK-010', '--to', 'Verified'], deps)).toBe(EXIT.usage);
    expect(JSON.parse(out.join('')).error.code).toBe('cli.move-refused');
  });

  it('keeps the Verified move blocked when one of multiple referenced PRs is unavailable', async () => {
    const { deps, out } = setup();
    withGitHub(deps, { linkedPull: true });
    const original = deps.fetch as Fetch;
    deps.fetch = async (url, init) => {
      if (url.includes('/timeline')) return { ok: true, status: 200, json: async () => [7, 8].map((number) => ({ event: 'cross-referenced', source: { issue: { number, title: `PR ${number}`, html_url: `https://github.com/me/Weaver/pull/${number}`, repository_url: 'https://api.github.com/repos/me/Weaver', pull_request: {} } } })) };
      if (url.endsWith('/pulls/8')) return { ok: false, status: 403, json: async () => ({}) };
      return original(url, init);
    };
    expect(await run(['card', 'move', 'TASK-010', '--to', 'Verified'], deps)).toBe(EXIT.usage);
    expect(JSON.parse(out.join('')).error.code).toBe('cli.move-refused');
  });

  it('allows a move to Verified for a task with an evidence exception, without asking GitHub for evidence', async () => {
    const { deps, out } = setup();
    deps.files = async () => [FILES[0], { path: FILES[1].path, text: FILES[1].text.replace('assignee: claude-code\n', 'assignee: claude-code\nevidence_exception: before the rule\n') }];
    const gh = withGitHub(deps);
    expect(await run(['card', 'move', 'TASK-010', '--to', 'Verified'], deps)).toBe(EXIT.unconfirmed);
    expect(JSON.parse(out.join('')).actions).toHaveLength(1);
    expect(gh.calls.filter((c) => c.includes('/timeline'))).toEqual([]);
  });

  it('refuses an unknown column and asks for what is missing', async () => {
    let s = setup();
    expect(await run(['card', 'move', 'me/Weaver#10', '--to', 'Done'], s.deps)).toBe(EXIT.usage);
    expect(JSON.parse(s.out.join('')).error.code).toBe('cli.bad-column');
    s = setup();
    expect(await run(['card', 'move', 'me/Weaver#10'], s.deps)).toBe(EXIT.usage);
    expect(JSON.parse(s.out.join('')).error.code).toBe('cli.missing-argument');
    s = setup();
    expect(await run(['card', 'move', 'TASK-999', '--to', 'Review'], s.deps)).toBe(EXIT.notFound);
  });
});

describe('weaver evidence attach', () => {
  const ATTACH = ['evidence', 'attach', 'me/Weaver#10', '--pull', '7'];

  it('plans a comment for a merged pull request, and posts it in the steward\'s name once approved', async () => {
    const first = setup();
    withGitHub(first.deps);
    expect(await run(ATTACH, first.deps)).toBe(EXIT.unconfirmed);
    const id = JSON.parse(first.out.join('')).actions[0].id;

    const { deps, out, logged } = setup();
    const gh = withGitHub(deps);
    expect(await run(['evidence', 'attach', 'me/Weaver#10', '--pull', 'https://github.com/me/Weaver/pull/7', '--approve', id], deps)).toBe(EXIT.ok);
    expect(JSON.parse(out.join('')).status).toBe('done');
    expect(gh.calls).toContain('POST /repos/me/Weaver/issues/10/comments');
    const comment = gh.bodies.find((b) => typeof (b as { body?: string }).body === 'string') as { body: string };
    expect(comment.body).toContain('Made by the Weaver steward on behalf of @me.');
    expect(comment.body).toContain('https://github.com/me/Weaver/pull/7');
    expect(logged).toMatchObject([{ action: 'evidence.attach', target: 'me/Weaver#10', outcome: 'done' }]);
  });

  it('refuses a pull request that is not merged, one that is not found, and a bad reference', async () => {
    const code = async (pull: string, options = {}) => {
      const { deps, out } = setup();
      withGitHub(deps, options);
      const exit = await run(['evidence', 'attach', 'me/Weaver#10', '--pull', pull], deps);
      return [exit, JSON.parse(out.join('')).error.code];
    };
    expect(await code('7', { pullMerged: false })).toEqual([EXIT.usage, 'cli.pull-not-merged']);
    expect(await code('9')).toEqual([EXIT.usage, 'cli.pull-unreadable']);
    expect(await code('seven')).toEqual([EXIT.usage, 'cli.bad-pull']);
  });
});

describe('column and pull parsing', () => {
  it('reads a column however it is spelled', () => {
    expect(parseColumn('in-progress')).toBe('In progress');
    expect(parseColumn(' REVIEW ')).toBe('Review');
    expect(parseColumn('Done')).toBeUndefined();
    expect(parseColumn(undefined)).toBeUndefined();
  });

  it('reads a pull request number or address', () => {
    expect(parsePullRef('#7', 'me/Weaver')).toEqual({ repository: 'me/Weaver', number: 7 });
    expect(parsePullRef('https://github.com/me/Other/pull/3/', 'me/Weaver')).toEqual({ repository: 'me/Other', number: 3 });
    expect(parsePullRef('seven', 'me/Weaver')).toBeUndefined();
  });
});

describe('weaver reconcile', () => {
  it('only shows the plan and the report by default, even at a terminal, and exits 0', async () => {
    const { deps, out } = setup();
    deps.interactive = true;
    deps.ask = async () => {
      throw new Error('must not ask during a dry run');
    };
    expect(await run(['reconcile'], deps)).toBe(EXIT.ok);
    const result = JSON.parse(out.join(''));
    expect(result.schema).toBe(1);
    expect(result.report.some((r: { kind: string }) => r.kind === 'card-without-file')).toBe(true);
    expect(result.actions).toEqual([]);
  });

  it('prints a text report with --text', async () => {
    const { deps, out } = setup();
    expect(await run(['reconcile', '--text'], deps)).toBe(EXIT.ok);
    expect(out.join('')).toMatch(/^proposed\tcard-without-file\t#11\t/m);
  });
});

describe('where the configuration comes from', () => {
  const PERSONAL = 'project: {owner: me, number: 7}\n';
  const WORKSPACE = 'project: {owner: me, number: 1}\nrepositories:\n  - me/Weaver\n';

  /** The personal file is at `WEAVER_HOME`; a root file is at `<folder>/.weaver/config.yaml` above `/work`. */
  const PERSONAL_FILE = '/home/me/.weaver/config.yaml';

  /** Files by name, and the Project number each Project query asked for. */
  function withFiles(files: { workspace?: string; personal?: string; roots?: Record<string, string> }) {
    const s = setup();
    const asked: number[] = [];
    s.deps.env = { WEAVER_HOME: '/home/me/.weaver' };
    s.deps.readText = async (file) => {
      const name = file.split('\\').join('/').replace(/^[A-Za-z]:/, '');
      if (name.endsWith('/fabric.yaml')) return files.workspace;
      if (name === PERSONAL_FILE) return files.personal;
      return files.roots?.[name];
    };
    const original = s.deps.fetch as Fetch;
    s.deps.fetch = async (url, init) => {
      const body = init?.body ? JSON.parse(init.body) : undefined;
      if (body?.variables?.n !== undefined && body.query.includes('projectV2')) asked.push(body.variables.n);
      return original(url, init);
    };
    return { ...s, asked };
  }

  it('uses the personal configuration when the workspace has no fabric.yaml, with no repository list', async () => {
    const { deps, out, asked } = withFiles({ personal: PERSONAL });
    expect(await run(['list'], deps)).toBe(EXIT.ok);
    expect(asked).toEqual([7]);
    expect(JSON.parse(out.join('')).cards).toHaveLength(2);
  });

  it('lets the workspace fabric.yaml decide the Project when both exist', async () => {
    const { deps, asked } = withFiles({ workspace: WORKSPACE, personal: PERSONAL });
    expect(await run(['list'], deps)).toBe(EXIT.ok);
    expect(asked).toEqual([1]);
  });

  it('does not let a broken personal file get in the way of a workspace fabric.yaml', async () => {
    const { deps } = withFiles({ workspace: WORKSPACE, personal: 'project: [' });
    expect(await run(['list'], deps)).toBe(EXIT.ok);
  });

  const ROOT = 'project: {owner: team, number: 9}\nrepositories:\n  - team/app\n';

  it('walks up from the folder it runs in and uses the nearest root file over the personal file', async () => {
    const { deps, asked } = withFiles({ personal: PERSONAL, roots: { '/.weaver/config.yaml': 'project: {owner: far, number: 3}\n', '/work/.weaver/config.yaml': ROOT } });
    expect(await run(['list'], deps)).toBe(EXIT.ok);
    expect(asked).toEqual([9]);
    const parent = withFiles({ personal: PERSONAL, roots: { '/.weaver/config.yaml': ROOT } });
    expect(await run(['list'], parent.deps)).toBe(EXIT.ok);
    expect(parent.asked).toEqual([9]);
  });

  it('names the file that decided and the layers of each contributor in the JSON of list', async () => {
    const people = 'roster:\n  contributors:\n    - {id: maria, kind: human, name: Maria}\n';
    const { deps, out } = withFiles({ personal: `${PERSONAL}${people}`, roots: { '/work/.weaver/config.yaml': `${ROOT}roster:\n  contributors:\n    - {id: Maria, kind: human, github: maria-gh}\n    - {id: lee, kind: human}\n` } });
    expect(await run(['list'], deps)).toBe(EXIT.ok);
    const config = JSON.parse(out.join('')).config;
    expect(config.source).toBe('root');
    expect(config.file.split('\\').join('/')).toMatch(/\/work\/\.weaver\/config\.yaml$/);
    expect(config.roster.map((r: { layer: string }) => r.layer)).toEqual(['root', 'personal']);
    expect(config.roster[1].file.split('\\').join('/')).toBe('/home/me/.weaver/config.yaml');
    expect(config.contributors).toEqual([
      { id: 'Maria', layers: ['root', 'personal'] },
      { id: 'lee', layers: ['root'] },
    ]);
  });

  it('names the personal file as the source when nothing above decides, and says nothing extra in text', async () => {
    const { deps, out, err } = withFiles({ personal: PERSONAL });
    expect(await run(['list'], deps)).toBe(EXIT.ok);
    expect(JSON.parse(out.join('')).config).toMatchObject({ source: 'user', roster: [], contributors: [] });
    const text = withFiles({ personal: PERSONAL });
    expect(await run(['list', '--text'], text.deps)).toBe(EXIT.ok);
    expect(text.err.join('')).toBe('');
    expect(err.join('')).toBe('');
  });

  it('says in text mode, on standard error, which file decided when it is not the personal one', async () => {
    const { deps, err } = withFiles({ roots: { '/work/.weaver/config.yaml': ROOT } });
    expect(await run(['list', '--text'], deps)).toBe(EXIT.ok);
    expect(err.join('')).toContain('config.yaml');
    expect(err.join('')).toContain('(root)');
  });

  it('prefers the workspace fabric.yaml over a root file, and a root file over the personal file', async () => {
    const both = withFiles({ workspace: WORKSPACE, personal: PERSONAL, roots: { '/work/.weaver/config.yaml': ROOT } });
    expect(await run(['list'], both.deps)).toBe(EXIT.ok);
    expect(both.asked).toEqual([1]);
  });

  it('does not take the personal file for a root file, even when it sits above the folder', async () => {
    const { deps, asked, err } = withFiles({ personal: PERSONAL });
    deps.env = { WEAVER_HOME: '/work/.weaver' };
    deps.readText = async (file) => (file.split('\\').join('/').endsWith('/work/.weaver/config.yaml') ? PERSONAL : undefined);
    expect(await run(['list'], deps)).toBe(EXIT.ok);
    expect(asked).toEqual([7]);
    expect(err.join('')).toBe('');
  });

  it('reports a process section of a root file as a warning and does not apply it', async () => {
    const { deps, err, asked } = withFiles({ roots: { '/work/.weaver/config.yaml': `${ROOT}columns:\n  source: board-status\n` } });
    expect(await run(['list'], deps)).toBe(EXIT.ok);
    expect(asked).toEqual([9]);
    expect(err.join('')).toContain('.weaver/process.yaml');
    expect(err.join('')).toContain('"columns"');
  });

  it('reports a broken root file instead of falling back, but not when the workspace file decides', async () => {
    const broken = withFiles({ personal: PERSONAL, roots: { '/work/.weaver/config.yaml': 'project: [' } });
    expect(await run(['list'], broken.deps)).toBe(EXIT.failed);
    expect(JSON.parse(broken.out.join('')).error).toMatchObject({ code: 'cli.config-invalid' });
    expect(JSON.parse(broken.out.join('')).error.message).toContain('config.yaml');
    const shared = withFiles({ workspace: WORKSPACE, roots: { '/work/.weaver/config.yaml': 'project: [' } });
    expect(await run(['list'], shared.deps)).toBe(EXIT.ok);
  });

  it('says how to set up when there is no configuration at all', async () => {
    const { deps, out } = withFiles({});
    expect(await run(['list'], deps)).toBe(EXIT.failed);
    const error = JSON.parse(out.join('')).error;
    expect(error.code).toBe('cli.no-setup');
    expect(error.message).toContain('weaver init');
  });

  it('reports a configuration that cannot be read instead of falling back', async () => {
    const personal = withFiles({ personal: 'project: [' });
    expect(await run(['list'], personal.deps)).toBe(EXIT.failed);
    expect(JSON.parse(personal.out.join('')).error).toMatchObject({ code: 'cli.config-invalid' });
    expect(JSON.parse(personal.out.join('')).error.message).toContain('config.yaml');

    const workspace = withFiles({ workspace: 'repositories: [me/a]', personal: PERSONAL });
    expect(await run(['list'], workspace.deps)).toBe(EXIT.failed);
    expect(JSON.parse(workspace.out.join('')).error.message).toContain('fabric.yaml');
  });
});


describe('rule-based status reconciliation flow', () => {
  it('gives identical findings and action identifiers for identical observed facts and process', async () => {
    const runs = [setup(), setup()];
    for (const attempt of runs) expect(await run(['reconcile'], attempt.deps)).toBe(EXIT.ok);
    const results = runs.map((attempt) => JSON.parse(attempt.out.join('')));
    expect(results[0].context).toEqual(results[1].context);
    expect(results[0].actions.map((action: { id: string }) => action.id)).toEqual(results[1].actions.map((action: { id: string }) => action.id));
    expect(results[0].report).toEqual(results[1].report);
    for (const attempt of runs) expect(attempt.writes.some((entry) => /mutation|^RESERVE|^REST .*\/issues$/.test(entry))).toBe(false);
  });

  it('declines a status repair interactively without an AI service or mutation', async () => {
    const { deps, out, writes } = setup();
    const original = deps.fetch!;
    deps.interactive = true;
    let prompts = 0;
    deps.ask = async () => { prompts += 1; return false; };
    deps.fetch = async (url, init) => {
      if (url.endsWith('/graphql') && JSON.parse(init.body).query.includes('items(first:100')) {
        const node = issue(10);
        node.fieldValueByName = { name: 'Todo' };
        return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { title: 'Board', field: { options: [{ name: 'Todo' }, { name: 'In Progress' }, { name: 'Done' }] }, items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [node] } } } } }) };
      }
      return original(url, init);
    };
    expect(await run(['reconcile', '--apply'], deps)).toBe(EXIT.declined);
    const result = JSON.parse(out.join(''));
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'board.status', outcome: 'declined' }));
    expect(prompts).toBeGreaterThan(0);
    expect(writes.some((entry) => /mutation|^RESERVE|^REST .*\/issues$/.test(entry))).toBe(false);
  });
  it('marks a failed post-add verification incomplete when the item appears on a later read', async () => {
    const { deps, out } = setup();
    const originalFetch = deps.fetch!;
    let visible = false;
    let additions = 0;
    deps.fetch = async (url, init) => {
      if (url.endsWith('/issues/10')) return { ok: true, status: 200, json: async () => ({ number: 10, title: 'Card', html_url: 'https://github.com/me/Weaver/issues/10', state: 'open', labels: ['status:in-progress'], assignees: [] }) };
      if (!url.endsWith('/graphql')) return originalFetch(url, init);
      const query = JSON.parse(init.body).query as string;
      if (query.includes('items(first:100')) return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { title: 'Board', field: { options: [{ name: 'Todo' }, { name: 'In Progress' }] }, items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: visible ? [issue(10)] : [] } } } } }) };
      if (query.includes('resource(url')) return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { id: 'PROJECT' } }, resource: { id: 'ISSUE' } } }) };
      if (query.includes('addProjectV2ItemById')) { additions += 1; return { ok: true, status: 200, json: async () => ({ data: { addProjectV2ItemById: { item: { id: 'ITEM' } } } }) }; }
      return { ok: true, status: 200, json: async () => ({ data: { repository: { pullRequests: { pageInfo: { hasNextPage: false }, nodes: [] } } } }) };
    };
    expect(await run(['reconcile'], deps)).toBe(EXIT.ok);
    const action = JSON.parse(out.join('')).actions.find((item: { kind: string }) => item.kind === 'project.add');
    expect(action).toBeDefined(); out.length = 0;
    expect(await run(['reconcile', '--approve', action.id], deps)).toBe(EXIT.failed);
    const uncertain = JSON.parse(out.join('')); out.length = 0;
    expect(uncertain.actions).toContainEqual(expect.objectContaining({ kind: 'project.add', outcome: 'failed' }));
    expect(uncertain.recheck).toMatchObject({ status: 'incomplete', resolved: [] });
    expect(uncertain.recheck.reason).toContain('not confirmation of the action result');
    expect(additions).toBe(1);
    visible = true;
    expect(await run(['reconcile'], deps)).toBe(EXIT.ok);
    expect(JSON.parse(out.join('')).actions.filter((item: { kind: string }) => item.kind === 'project.add')).toEqual([]);
    expect(additions).toBe(1);
  });

  it('distinguishes unreadable Status options from a known missing option in the CLI plan', async () => {
    for (const available of [false, true]) {
      const { deps, out } = setup();
      const originalFetch = deps.fetch!;
      deps.fetch = async (url, init) => {
        if (url.endsWith('/graphql') && JSON.parse(init.body).query.includes('items(first:100')) {
          const node = issue(10);
          node.fieldValueByName = { name: 'Todo' };
          return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { title: 'Board', field: available ? { options: [{ name: 'Todo' }] } : null, items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [node] } } } } }) };
        }
        return originalFetch(url, init);
      };
      expect(await run(['reconcile'], deps)).toBe(EXIT.ok);
      const result = JSON.parse(out.join(''));
      expect(result.actions.filter((action: { kind: string }) => action.kind === 'board.status')).toEqual([]);
      expect(result.context.statusOptions).toEqual(available ? ['Todo'] : null);
      expect(result.report.find((report: { kind: string }) => report.kind === 'board-status-differs').message)
        .toContain(available ? 'no Status option named In Progress' : 'could not be read');
    }
  });

  it('treats an invalid task document as an incomplete file inventory', async () => {
    const { deps, out } = setup();
    deps.files = async () => [...FILES, { path: 'tasks/TASK-011.md', text: '---\ntype: task\nid: [\n---\n' }];
    expect(await run(['reconcile'], deps)).toBe(EXIT.ok);
    const result = JSON.parse(out.join(''));
    expect(result.report).toContainEqual(expect.objectContaining({ kind: 'workspace-invalid' }));
    expect(result.report).toContainEqual(expect.objectContaining({ kind: 'card-file-unknown', subject: '#11' }));
    expect(result.actions.filter((a: { kind: string }) => a.kind === 'files.pull-request')).toEqual([]);
  });

  it('uses the same Project snapshot for cards and completeness when fields are reread', async () => {
    const { deps, out } = setup();
    const originalFetch = deps.fetch!;
    let projectReads = 0;
    deps.fetch = async (url, init) => {
      if (url.includes('/contents/.weaver/process.yaml')) return { ok: true, status: 200, headers: { get: () => null }, text: async () => 'task:\n  fields:\n    priority:\n      source: project\n      project-field: Priority\n' } as never;
      if (url.endsWith('/graphql') && JSON.parse(init.body).query.includes('items(first:100')) {
        projectReads += 1;
        const nodes = projectReads === 1 ? [] : [{ fieldValueByName: null, content: null }];
        return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { title: 'Board', field: { options: [{ name: 'Todo' }] }, items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } } } }) };
      }
      return originalFetch(url, init);
    };
    expect(await run(['reconcile'], deps)).toBe(EXIT.ok);
    const result = JSON.parse(out.join(''));
    expect(result.actions.filter((a: { kind: string }) => a.kind === 'project.add')).toEqual([]);
    expect(result.report).toContainEqual(expect.objectContaining({ kind: 'issue-project-unknown' }));
  });

  it('does not infer missing Project membership from a card with mismatched Issue identity', async () => {
    const { deps, out } = setup();
    const originalFetch = deps.fetch!;
    deps.fetch = async (url, init) => {
      if (url.endsWith('/graphql') && JSON.parse(init.body).query.includes('items(first:100')) {
        const mismatch = issue(10, { url: 'https://github.com/other/repo/issues/10' });
        return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { title: 'Board', field: { options: [{ name: 'Todo' }] }, items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [mismatch] } } } } }) };
      }
      return originalFetch(url, init);
    };
    expect(await run(['reconcile'], deps)).toBe(EXIT.ok);
    const result = JSON.parse(out.join(''));
    expect(result.actions.filter((action: { kind: string }) => action.kind === 'project.add')).toEqual([]);
    expect(result.report).toContainEqual(expect.objectContaining({ kind: 'issue-project-unknown' }));
  });

  it('stops when the Project field reread fails rather than planning from an older snapshot', async () => {
    const { deps, out } = setup();
    const originalFetch = deps.fetch!;
    let projectReads = 0;
    deps.fetch = async (url, init) => {
      if (url.includes('/contents/.weaver/process.yaml')) return { ok: true, status: 200, headers: { get: () => null }, text: async () => 'task:\n  fields:\n    priority:\n      source: project\n      project-field: Priority\n' } as never;
      if (url.endsWith('/graphql') && JSON.parse(init.body).query.includes('items(first:100')) {
        projectReads += 1;
        if (projectReads === 2) return { ok: false, status: 503, json: async () => ({}) };
      }
      return originalFetch(url, init);
    };
    expect(await run(['reconcile'], deps)).toBe(EXIT.failed);
    expect(JSON.parse(out.join('')).error).toMatchObject({ code: 'project.unreachable' });
  });

  it('plans, approves, changes only the selected item, rechecks and is idempotent', async () => {
    const { deps, out } = setup();
    let status = 'Todo';
    let writes = 0;
    let issueLabels = ['status:in-progress'];
    let changeLabelOnWrite = false;
    let omitStatusOnWrite = false;
    let statusUnread = false;
    let switchSetupOnWrite = false;
    let switchedSetup = false;
    const originalReadText = deps.readText;
    deps.readText = async (file) => switchedSetup ? 'project: {owner: other, number: 9}\nrepositories:\n  - me/Weaver\n' : originalReadText(file);
    let fileReads = 0;
    let failFileRead = 0;
    let processReads = 0;
    let changeAtProcessRead = 0;
    let changedProcess = 'task:\n  fields:\n    priority:\n      source: project\n      project-field: Priority\n';
    const originalFiles = deps.files;
    deps.files = async (root) => { fileReads += 1; if (fileReads === failFileRead) throw new Error('disk unavailable'); return originalFiles(root); };
    deps.fetch = async (url, init) => {
      if (url.endsWith('/contents/')) return { ok: true, status: 200, json: async () => [] } as never;
      if (url.includes('/contents/.weaver/')) {
        processReads += 1;
        if (changeAtProcessRead && processReads >= changeAtProcessRead) return { ok: true, status: 200, headers: { get: () => null }, text: async () => changedProcess } as never;
        return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as never;
      }
      const { query } = JSON.parse(init.body);
      if (query.includes('items(first:100')) return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { title: 'Board', field: { options: [{ name: 'Todo' }, { name: 'In Progress' }, { name: 'Done' }] }, items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 'ITEM', ...(statusUnread ? {} : { fieldValueByName: { name: status } }), content: { __typename: 'Issue', number: 10, title: '[TASK-010] Card', url: 'https://github.com/me/Weaver/issues/10', state: 'OPEN', repository: { nameWithOwner: 'me/Weaver' }, labels: { pageInfo: { hasNextPage: false }, nodes: issueLabels.map((name) => ({ name })) }, assignees: { pageInfo: { hasNextPage: false }, nodes: [] }, closedByPullRequestsReferences: { totalCount: 0, nodes: [] }, timelineItems: { totalCount: 0, nodes: [] } } }] } } } } }) };
      if (query.includes('field(name:$f)')) return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { id: 'PROJECT', field: { id: 'FIELD', options: [{ id: 'PROGRESS', name: 'In Progress' }] } } } } }) };
      if (query.includes('updateProjectV2ItemFieldValue')) { writes += 1; status = 'In Progress'; if (changeLabelOnWrite) issueLabels = []; if (omitStatusOnWrite) statusUnread = true; if (switchSetupOnWrite) switchedSetup = true; return { ok: true, status: 200, json: async () => ({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'ITEM' } } } }) }; }
      return { ok: true, status: 200, json: async () => ({ data: { repository: { pullRequests: { pageInfo: { hasNextPage: false }, nodes: [] } } } }) };
    };
    expect(await run(['reconcile'], deps)).toBe(EXIT.ok);
    const planned = JSON.parse(out.join('')); out.length = 0;
    const action = planned.actions.find((item: { kind: string }) => item.kind === 'board.status');
    expect(action.summary).toContain('me/1');
    expect(action.summary).toContain('Todo');
    expect(writes).toBe(0);
    expect(await run(['reconcile', '--approve', action.id], deps)).toBe(EXIT.ok);
    const result = JSON.parse(out.join('')); out.length = 0;
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'board.status', outcome: 'done' }));
    expect(result.recheck.status).toBe('read');
    expect(fileReads).toBe(3);
    expect(result.recheck.resolved).toContainEqual(expect.objectContaining({ kind: 'board-status-differs' }));
    expect(writes).toBe(1);
    expect(await run(['reconcile'], deps)).toBe(EXIT.ok);
    expect(JSON.parse(out.join('')).actions.filter((item: { kind: string }) => item.kind === 'board.status')).toEqual([]);
    expect(writes).toBe(1);

    // An unavailable workspace after the mutation must not be reported as a clean recheck.
    status = 'Todo'; out.length = 0;
    expect(await run(['reconcile'], deps)).toBe(EXIT.ok);
    const secondAction = JSON.parse(out.join('')).actions.find((item: { kind: string }) => item.kind === 'board.status');
    out.length = 0;
    failFileRead = fileReads + 2;
    expect(await run(['reconcile', '--approve', secondAction.id], deps)).toBe(EXIT.failed);
    const partial = JSON.parse(out.join(''));
    expect(partial.status).toBe('incomplete');
    expect(partial.recheck).toMatchObject({ status: 'unavailable' });
    expect(partial.actions).toContainEqual(expect.objectContaining({ kind: 'board.status', outcome: 'done' }));

    // A newly configured Project field was not in the earlier snapshot; do not claim a clean reread.
    status = 'Todo'; out.length = 0; failFileRead = 0;
    expect(await run(['reconcile'], deps)).toBe(EXIT.ok);
    const thirdAction = JSON.parse(out.join('')).actions.find((item: { kind: string }) => item.kind === 'board.status');
    out.length = 0;
    changeAtProcessRead = processReads + 4;
    expect(await run(['reconcile', '--approve', thirdAction.id], deps)).toBe(EXIT.failed);
    const changed = JSON.parse(out.join(''));
    expect(changed.recheck).toMatchObject({ status: 'incomplete' });
    expect(changed.recheck.reason).toContain('Project fields changed');

    // Replacing a board mismatch with a missing source label is a remaining problem, not resolution.
    status = 'Todo'; issueLabels = ['status:in-progress']; changeAtProcessRead = 0; out.length = 0;
    expect(await run(['reconcile'], deps)).toBe(EXIT.ok);
    const fourthAction = JSON.parse(out.join('')).actions.find((item: { kind: string }) => item.kind === 'board.status');
    out.length = 0; changeLabelOnWrite = true;
    expect(await run(['reconcile', '--approve', fourthAction.id], deps)).toBe(EXIT.failed);
    const changedSource = JSON.parse(out.join(''));
    expect(changedSource.recheck).toMatchObject({ status: 'incomplete', resolved: [] });
    expect(changedSource.recheck.reason).toContain('not confirmation of the action result');
    expect(changedSource.recheck.remaining).toContainEqual(expect.objectContaining({ kind: 'status-source-needs-decision' }));
    expect(changedSource.recheck.resolved).not.toContainEqual(expect.objectContaining({ kind: 'board-status-differs' }));

    // A changed process must not make an earlier finding look resolved under different rules.
    status = 'Todo'; issueLabels = ['status:in-progress']; changeLabelOnWrite = false; out.length = 0;
    expect(await run(['reconcile'], deps)).toBe(EXIT.ok);
    const fifthAction = JSON.parse(out.join('')).actions.find((item: { kind: string }) => item.kind === 'board.status');
    out.length = 0; changedProcess = 'columns:\n  labels:\n    In progress: doing\n'; changeAtProcessRead = processReads + 4;
    expect(await run(['reconcile', '--approve', fifthAction.id], deps)).toBe(EXIT.failed);
    const changedRules = JSON.parse(out.join(''));
    expect(changedRules.recheck).toMatchObject({ status: 'incomplete' });
    expect(changedRules.recheck.reason).toContain('process rules changed');

    // A missing per-item field after the write is unknown, not a resolved board mismatch.
    status = 'Todo'; changeAtProcessRead = 0; out.length = 0;
    expect(await run(['reconcile'], deps)).toBe(EXIT.ok);
    const unreadAction = JSON.parse(out.join('')).actions.find((item: { kind: string }) => item.kind === 'board.status');
    out.length = 0; omitStatusOnWrite = true;
    expect(await run(['reconcile', '--approve', unreadAction.id], deps)).toBe(EXIT.failed);
    const unread = JSON.parse(out.join(''));
    expect(unread.recheck).toMatchObject({ status: 'incomplete', resolved: [] });
    expect(unread.recheck.remaining).toContainEqual(expect.objectContaining({ kind: 'board-status-unread' }));

    // A change to the selected Project during a write must not be reported as a clean recheck.
    status = 'Todo'; statusUnread = false; omitStatusOnWrite = false; changeAtProcessRead = 0; out.length = 0;
    expect(await run(['reconcile'], deps)).toBe(EXIT.ok);
    const sixthAction = JSON.parse(out.join('')).actions.find((item: { kind: string }) => item.kind === 'board.status');
    out.length = 0; switchSetupOnWrite = true;
    expect(await run(['reconcile', '--approve', sixthAction.id], deps)).toBe(EXIT.failed);
    expect(JSON.parse(out.join('')).recheck).toMatchObject({ status: 'incomplete' });
    expect(JSON.parse(out.join('')).recheck.reason).toContain('Project or repository scope changed');
  });
});
