import { describe, expect, it } from 'vitest';
import { defaultProcess, loadWorkspace, parseProcess, placeIssue, type MergedPull, type TaskContract } from '@ebrain-lab/weaver-markdown';
import type { FetchFn, ProjectCard } from '@ebrain-lab/weaver-github';
import { actionId, executeActions, planReconcile, type ExecuteContext, type ReconcileInput } from '../src';

const url = (n: number) => `https://github.com/me/Weaver/issues/${n}`;

const card = (n: number, extra: Partial<ProjectCard> = {}): ProjectCard => {
  const state = extra.state ?? 'open';
  const labels = extra.labels ?? ['task', 'status:in-progress'];
  return {
    repository: 'me/Weaver',
    number: n,
    title: `[TASK-0${n}] Card ${n}`,
    url: url(n),
    state,
    labels,
    assignees: [],
    taskId: `TASK-0${n}`,
    updatedAt: '2026-10-31T00:00:00Z',
    placement: placeIssue({ state, labels }),
    ...extra,
  };
};

const task = (id: string, extra = '') => `---\nid: ${id}\ntype: task\ntitle: ${id} title\nrequirement: REQ-001\nrepository: me/Weaver\nassignee_type: agent\n${extra}---\n`;
const files = {
  'req.md': '---\nid: REQ-001\ntype: requirement\ntitle: First\nstatus: draft\nrepository: me/Weaver\n---\n\n## Tasks\n\n',
  'TASK-010.md': task('TASK-010', `issue: ${url(10)}\n`),
  'TASK-020.md': task('TASK-020', `issue: ${url(20)}\n`),
  'TASK-030.md': task('TASK-030', `issue: ${url(30)}\n`),
  'TASK-040.md': task('TASK-040', 'status: draft\n'),
  'TASK-041.md': task('TASK-041', 'issue: not-a-url\n'),
};
const artifacts = loadWorkspace(Object.entries(files).map(([path, text]) => ({ path, text }))).artifacts;

/** Only TASK-010, whose card agrees with it. */
const quiet = loadWorkspace([{ path: 'TASK-010.md', text: task('TASK-010', `issue: ${url(10)}\n`) }, { path: 'req.md', text: files['req.md'] }]).artifacts;

const pull = (extra: Partial<MergedPull> = {}): MergedPull => ({
  repository: 'me/Weaver', number: 50, title: 'feat: ten (TASK-010)', url: 'https://github.com/me/Weaver/pull/50', branch: 'feat/task-010', closes: [], ...extra,
});

/** A fetch that answers the comment list of any Issue and records the other calls. */
function rest(comments: unknown = [], status = 200) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const fetchFn = (async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ method: init?.method ?? 'GET', url, ...(init?.body ? { body: JSON.parse(init.body) } : {}) });
    const ok = status < 400;
    return { ok, status, json: async () => (url.includes('/comments') && (init?.method ?? 'GET') === 'GET' ? comments : { number: 20, title: 'Issue', html_url: url, state: 'open', labels: [], assignees: [] }) };
  }) as unknown as FetchFn;
  return { fetchFn, calls };
}

const input = (overrides: Partial<ReconcileInput> = {}): ReconcileInput => ({
  token: 't',
  login: 'me',
  locale: 'en',
  project: { owner: 'me', number: 1 },
  repositories: ['me/Weaver'],
  cards: [card(10, { boardStatus: 'Todo' }), card(30, { state: 'closed', labels: ['task', 'status:review'], boardStatus: 'Done' })],
  artifacts,
  pulls: [pull()],
  now: new Date('2026-11-01T00:00:00Z'),
  fetchFn: rest().fetchFn,
  ...overrides,
});

describe('planReconcile', () => {
  it('sorts what the Overview reports into actions and a report, following the DEC-012 table', async () => {
    const plan = await planReconcile(input());
    expect(plan.actions.map((a) => `${a.kind} ${a.target}`).sort()).toEqual([
      'board.status me/Weaver#10',
      'issue.comment me/Weaver#10',
      'project.add me/Weaver#20',
    ]);
    const reported = plan.reports.map((r) => `${r.tier}:${r.kind}:${r.subject}`).sort();
    expect(reported).toContain('proposed:task-without-issue:TASK-040');
    expect(reported).toContain('report:broken-issue-link:TASK-041');
    expect(plan.reports.every((r) => !r.automated)).toBe(true);
  });

  it('never plans to close an Issue, commit, or move a card to Verified that is still open', async () => {
    const plan = await planReconcile(input());
    for (const action of plan.actions) {
      expect(['project.add', 'board.status', 'issue.comment', 'card.move']).toContain(action.kind);
    }
    const moves = plan.actions.filter((a) => a.kind === 'card.move');
    expect(moves).toEqual([]);
    expect(plan.reports.some((r) => r.kind === 'closed-without-verified')).toBe(true);
  });

  it('does not comment again when the note is already on the Issue, and reports it when comments cannot be read', async () => {
    const marked = await planReconcile(input({ fetchFn: rest([{ body: 'x <!-- weaver:pull-50 -->' }]).fetchFn }));
    expect(marked.actions.some((a) => a.kind === 'issue.comment')).toBe(false);

    const unreadable = await planReconcile(input({ fetchFn: rest([], 500).fetchFn }));
    expect(unreadable.actions.some((a) => a.kind === 'issue.comment')).toBe(false);
    expect(unreadable.reports.some((r) => r.kind === 'merged-pr-not-linked' && r.tier === 'proposed')).toBe(true);
  });

  it('only reports a board that is ahead of its label, and brings a board that is behind up to it', async () => {
    const ahead = await planReconcile(input({ artifacts: quiet, cards: [card(10, { labels: ['task', 'status:backlog'], boardStatus: 'In Progress' })], pulls: [pull({ closes: [10] })] }));
    expect(ahead.actions).toEqual([]);
    expect(ahead.reports.map((r) => r.kind)).toContain('board-status-differs');

    const behind = await planReconcile(input({ artifacts: quiet, cards: [card(10, { boardStatus: 'Todo' })], pulls: [pull({ closes: [10] })] }));
    expect(behind.actions.map((a) => a.kind)).toEqual(['board.status']);
  });

  it('plans one Project addition for two tasks sharing an Issue and reports the association', async () => {
    const shared = loadWorkspace([{ path: 'TASK-010.md', text: task('TASK-010', `issue: ${url(10)}\n`) }, { path: 'TASK-011.md', text: task('TASK-011', `issue: ${url(10)}\n`) }]).artifacts;
    const plan = await planReconcile(input({ artifacts: shared, cards: [], pulls: [] }));
    expect(plan.actions.filter((a) => a.kind === 'project.add')).toHaveLength(1);
    expect(plan.reports.map((r) => r.kind)).toContain('shared-issue');
    const unknown = await planReconcile(input({ artifacts: shared, cards: [], pulls: [], projectMembershipComplete: false }));
    expect(unknown.actions).toEqual([]);
    expect(unknown.reports.map((r) => r.kind)).toContain('issue-project-unknown');
  });

  it('does not propose adding an Issue that could not be read', async () => {
    const unreadable = rest([], 403);
    const plan = await planReconcile(input({ artifacts, cards: [], pulls: [], fetchFn: unreadable.fetchFn }));
    expect(plan.actions.filter((a) => a.kind === 'project.add')).toEqual([]);
    expect(plan.reports.map((r) => r.kind)).toContain('issue-unavailable');
  });

  it('proposes setting a confirmed missing board Status and refuses an unreadable process', async () => {
    const rules = defaultProcess().columns;
    const missing = card(10, { boardStatusRead: true });
    const plan = await planReconcile(input({ artifacts: quiet, cards: [missing], pulls: [], rulesFor: () => rules, statusOptions: ['Todo', 'In Progress', 'Done'] }));
    expect(plan.actions.map((a) => a.kind)).toContain('board.status');
    const unavailable = await planReconcile(input({ artifacts: quiet, cards: [missing], pulls: [], rulesFor: () => undefined, unavailableRepositories: ['me/Weaver'] }));
    expect(unavailable.actions).toEqual([]);
    expect(unavailable.reports.map((r) => r.kind)).toContain('process-unavailable');
  });

  it('uses an explicit projection to compare known options and refuses unknown ordering', async () => {
    const rules = parseProcess('process.yaml', 'columns:\n  projection:\n    Backlog: Backlog\n    In progress: Working\n').process.columns;
    const behind = await planReconcile(input({ artifacts: quiet, cards: [card(10, { boardStatus: 'Backlog' })], pulls: [], rulesFor: () => rules, statusOptions: ['Backlog', 'Working'] }));
    expect(behind.actions.map((a) => a.kind)).toContain('board.status');
    const unknown = await planReconcile(input({ artifacts: quiet, cards: [card(10, { boardStatus: 'Todo' })], pulls: [], rulesFor: () => rules, statusOptions: ['Backlog', 'Todo', 'Working'] }));
    expect(unknown.actions).toEqual([]);
    expect(unknown.reports.map((r) => r.kind)).toContain('board-status-differs');
    const absentOption = await planReconcile(input({ artifacts: quiet, cards: [card(10, { boardStatus: 'Backlog' })], pulls: [], rulesFor: () => rules, statusOptions: ['Backlog'] }));
    expect(absentOption.actions).toEqual([]);
  });

  it('binds approval to the selected Project and observed Issue facts', async () => {
    const rules = defaultProcess().columns;
    const base = { artifacts: quiet, pulls: [], rulesFor: () => rules, statusOptions: ['Todo', 'In Progress', 'Done'] };
    const first = await planReconcile(input({ ...base, cards: [card(10, { boardStatus: 'Todo', projectItemId: 'one' })] }));
    const changed = await planReconcile(input({ ...base, cards: [card(10, { boardStatus: 'Todo', projectItemId: 'two' })] }));
    expect(actionId(first.actions[0])).not.toBe(actionId(changed.actions[0]));
    const other = await planReconcile(input({ ...base, project: { owner: 'other', number: 1 }, cards: [card(10, { boardStatus: 'Todo', projectItemId: 'one' })] }));
    expect(actionId(first.actions[0])).not.toBe(actionId(other.actions[0]));
  });

  it('updates only the selected Project after a fresh read, then verifies it', async () => {
    const rules = defaultProcess().columns;
    let boardStatus = 'Todo';
    const calls: { query: string; variables: Record<string, unknown> }[] = [];
    const fetch = (async (_url: string, init: { body: string }) => {
      const request = JSON.parse(init.body); calls.push(request);
      let body: unknown;
      if (request.query.includes('items(first:100')) {
        body = { data: { repositoryOwner: { projectV2: { title: 'Selected', field: { options: [{ name: 'Todo' }, { name: 'In Progress' }] }, items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 'selected-item', fieldValueByName: { name: boardStatus }, content: { __typename: 'Issue', repository: { nameWithOwner: 'me/Weaver' }, number: 10, title: '[TASK-010] Card', url: url(10), state: 'OPEN', labels: { nodes: [{ name: 'task' }, { name: 'status:in-progress' }], pageInfo: { hasNextPage: false } }, assignees: { nodes: [] } } }] } } } } };
      } else if (request.query.includes('field(name:$f)')) {
        body = { data: { repositoryOwner: { projectV2: { id: 'selected-project', field: { id: 'status', options: [{ id: 'progress', name: 'In Progress' }] } } } } };
      } else {
        boardStatus = 'In Progress'; body = { data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'selected-item' } } } };
      }
      return { ok: true, status: 200, json: async () => body };
    }) as unknown as NonNullable<ReconcileInput['fetch']>;
    const plan = await planReconcile(input({ artifacts: quiet, cards: [card(10, { boardStatus: 'Todo' })], pulls: [], rulesFor: () => rules, freshRulesFor: async () => rules, fetch }));
    const action = plan.actions.find((a) => a.kind === 'board.status');
    expect(action).toBeDefined();
    await action!.run();
    expect(calls.find((call) => call.query.includes('updateProjectV2ItemFieldValue'))?.variables).toMatchObject({ p: 'selected-project', i: 'selected-item', o: 'progress' });
    expect(calls.filter((call) => call.query.includes('items(first:100'))).toHaveLength(2);
  });

  it('reports an uncertain result when the post-write Project read fails', async () => {
    const rules = defaultProcess().columns;
    let projectReads = 0;
    let mutations = 0;
    const fetch = (async (_url: string, init: { body: string }) => {
      const request = JSON.parse(init.body);
      if (request.query.includes('items(first:100')) {
        projectReads += 1;
        if (projectReads > 1) throw new Error('network failure');
        return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { title: 'Selected', field: { options: [{ name: 'Todo' }, { name: 'In Progress' }] }, items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 'selected-item', fieldValueByName: { name: 'Todo' }, content: { __typename: 'Issue', repository: { nameWithOwner: 'me/Weaver' }, number: 10, title: '[TASK-010] Card', url: url(10), state: 'OPEN', labels: { nodes: [{ name: 'task' }, { name: 'status:in-progress' }], pageInfo: { hasNextPage: false } }, assignees: { nodes: [] } } }] } } } } }) };
      }
      if (request.query.includes('field(name:$f)')) return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { id: 'selected-project', field: { id: 'status', options: [{ id: 'progress', name: 'In Progress' }] } } } } }) };
      mutations += 1;
      return { ok: true, status: 200, json: async () => ({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'selected-item' } } } }) };
    }) as unknown as NonNullable<ReconcileInput['fetch']>;
    const plan = await planReconcile(input({ artifacts: quiet, cards: [card(10, { boardStatus: 'Todo' })], pulls: [], rulesFor: () => rules, freshRulesFor: async () => rules, fetch }));
    await expect(plan.actions.find((a) => a.kind === 'board.status')!.run()).rejects.toThrow();
    expect(mutations).toBe(1);
  });

  it('does not report success when an external automation changes the Issue after the Project write', async () => {
    const rules = defaultProcess().columns;
    let wrote = false;
    const fetch = (async (_url: string, init: { body: string }) => {
      const request = JSON.parse(init.body);
      if (request.query.includes('items(first:100')) return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { title: 'Selected', field: { options: [{ name: 'Todo' }, { name: 'In Progress' }] }, items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 'selected-item', fieldValueByName: { name: wrote ? 'In Progress' : 'Todo' }, content: { __typename: 'Issue', repository: { nameWithOwner: 'me/Weaver' }, number: 10, title: '[TASK-010] Card', url: url(10), state: wrote ? 'CLOSED' : 'OPEN', labels: { nodes: [{ name: 'task' }, { name: 'status:in-progress' }], pageInfo: { hasNextPage: false } }, assignees: { nodes: [] } } }] } } } } }) };
      if (request.query.includes('field(name:$f)')) return { ok: true, status: 200, json: async () => ({ data: { repositoryOwner: { projectV2: { id: 'selected-project', field: { id: 'status', options: [{ id: 'progress', name: 'In Progress' }] } } } } }) };
      wrote = true;
      return { ok: true, status: 200, json: async () => ({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'selected-item' } } } }) };
    }) as unknown as NonNullable<ReconcileInput['fetch']>;
    const plan = await planReconcile(input({ artifacts: quiet, cards: [card(10, { boardStatus: 'Todo' })], pulls: [], rulesFor: () => rules, freshRulesFor: async () => rules, fetch }));
    await expect(plan.actions.find((a) => a.kind === 'board.status')!.run()).rejects.toThrow();
    expect(wrote).toBe(true);
  });

  it('refuses a stale or unreadable process before writing a Project Status', async () => {
    const rules = defaultProcess().columns;
    let requests = 0;
    const fetch = (async () => { requests += 1; throw new Error('unexpected write'); }) as unknown as NonNullable<ReconcileInput['fetch']>;
    const plan = await planReconcile(input({ artifacts: quiet, cards: [card(10, { boardStatus: 'Todo' })], pulls: [], rulesFor: () => rules, freshRulesFor: async () => undefined, fetch }));
    await expect(plan.actions.find((a) => a.kind === 'board.status')!.run()).rejects.toThrow();
    expect(requests).toBe(0);
  });

  it('is quiet when files, Issues, and the Project agree', async () => {
    const plan = await planReconcile(input({ artifacts: quiet, cards: [card(10, { boardStatus: 'In Progress' })], pulls: [pull({ closes: [10] })] }));
    expect(plan.actions).toEqual([]);
    expect(plan.reports).toEqual([]);
  });

  it('lists stale cards as a report for a person, with no action', async () => {
    const plan = await planReconcile(input({ artifacts: quiet, cards: [card(10, { boardStatus: 'In Progress', updatedAt: '2026-09-01T00:00:00Z' })], pulls: [pull({ closes: [10] })] }));
    expect(plan.reports.filter((r) => r.kind === 'stale.idle')).toHaveLength(1);
    expect(plan.actions).toEqual([]);
  });

  it('gives the same approval ids in English and Korean', async () => {
    const en = await planReconcile(input());
    const ko = await planReconcile(input({ locale: 'ko' }));
    expect(en.actions.map(actionId)).toEqual(ko.actions.map(actionId));
  });

  it('runs each planned action only through the confirmation path, with the steward attribution on comments', async () => {
    const github = rest();
    const plan = await planReconcile(input({ fetchFn: github.fetchFn }));
    const comment = plan.actions.find((a) => a.kind === 'issue.comment');
    if (!comment) throw new Error('no comment action');
    const log: unknown[] = [];
    const ctx: ExecuteContext = {
      locale: 'en',
      approved: new Set([actionId(comment)]),
      interactive: false,
      ask: async () => false,
      log: { append: async (entry) => void log.push(entry) },
      actor: 'steward',
      onBehalfOf: 'me',
      now: () => new Date('2026-11-01T00:00:00Z'),
      note: () => undefined,
    };
    const results = await executeActions(plan.actions, ctx);
    expect(results.filter((r) => r.outcome === 'done').map((r) => r.kind)).toEqual(['issue.comment']);
    const posted = github.calls.find((c) => c.method === 'POST');
    expect((posted?.body as { body: string }).body).toContain('Made by the Weaver steward on behalf of @me.');
    expect((posted?.body as { body: string }).body).toContain('<!-- weaver:pull-50 -->');
    expect(log).toHaveLength(1);
  });
});

describe('planReconcile: the task contract (DEC-016)', () => {
  const contractFor = (section: string) => {
    const task = parseProcess('process.yaml', `task:\n${section}`).process.task as TaskContract;
    return () => task;
  };
  const owner = '  fields:\n    owner:\n      label: "owner:{value}"\n    level:\n      project-field: Level\n';
  const withOwner = loadWorkspace([
    { path: 'req.md', text: files['req.md'] },
    { path: 'TASK-010.md', text: task('TASK-010', `issue: ${url(10)}\nowner: alpha\nlevel: high\n`) },
  ], { declaredTaskFields: () => ['owner', 'level'] }).artifacts;
  const base = { artifacts: withOwner, pulls: [] as MergedPull[] };

  it('only reports a field that differs from its label or Project field; nothing is changed', async () => {
    const cards = [card(10, { boardStatus: 'In Progress', labels: ['task', 'status:in-progress', 'owner:beta'], fields: { Level: 'low' } })];
    const plan = await planReconcile(input({ ...base, cards, contractFor: contractFor(owner) }));
    expect(plan.actions).toEqual([]);
    expect(plan.reports.map((r) => `${r.tier}:${r.kind}:${r.subject}`)).toEqual(['report:task-field-differs:TASK-010', 'report:task-field-differs:TASK-010']);
    expect(plan.reports[0].message).toContain('"owner"');
    expect(plan.reports[0].path).toBe('TASK-010.md');
  });

  it('is quiet when the card agrees with the file, and without a contract', async () => {
    const agree = [card(10, { boardStatus: 'In Progress', labels: ['task', 'status:in-progress', 'owner:alpha'], fields: { Level: 'high' } })];
    expect((await planReconcile(input({ ...base, cards: agree, contractFor: contractFor(owner) }))).reports).toEqual([]);
    const differs = [card(10, { boardStatus: 'In Progress', labels: ['task', 'status:in-progress', 'owner:beta'] })];
    expect((await planReconcile(input({ ...base, cards: differs }))).reports).toEqual([]);
  });

  it('does not ask for a file for a card when the process lets a card be an Issue only', async () => {
    const lone = [card(10, { boardStatus: 'In Progress', labels: ['task', 'status:in-progress', 'owner:alpha'], fields: { Level: 'high' } }), card(99, { boardStatus: 'In Progress' })];
    const asks = await planReconcile(input({ ...base, cards: lone, contractFor: contractFor(`  require-file: true\n${owner}`) }));
    expect(asks.reports.some((r) => r.kind === 'card-without-file')).toBe(true);
    const light = await planReconcile(input({ ...base, cards: lone, contractFor: contractFor(`  require-file: false\n${owner}`) }));
    expect(light.reports.some((r) => r.kind === 'card-without-file')).toBe(false);
    expect(light.actions.some((a) => a.kind.includes('draft') || a.kind.includes('pull'))).toBe(false);
  });
});
