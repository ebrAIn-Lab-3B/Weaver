import { describe, expect, it, vi } from 'vitest';
import { applyConfirmedProposal } from '@ebrain-lab/weaver-markdown';
import { readAssignmentSnapshot, writeProposalAction, type FreshAssignmentContext } from '../src';

const url = 'https://github.com/example/repo/issues/7';
const processText = `version: 1
assignment:
  Ready:
    decider: coordinator
    next-role: implementer
    when:
      project-field: Type
      in: [feature]
`;
const context: FreshAssignmentContext = {
  readRoster: async () => ({ version: 'roster-1', contributors: [{ id: 'worker', kind: 'agent', roles: ['implementer'], reach: [{ type: 'label', value: 'work:agent' }] }] }),
  readHolder: async () => ({ version: 'task-1', holder: 'current' }),
  readExecution: async () => 'no',
};

function mockedFetch(options: { projectType?: string; projectLabels?: string[]; processStatus?: number } = {}): typeof fetch {
  return vi.fn(async (input, init) => {
    const target = String(input);
    if (target.includes('/contents/')) return new Response(processText, { status: options.processStatus ?? 200 });
    if (target.endsWith('/issues/7')) return Response.json({ number: 7, title: 'Work', html_url: url, state: 'open', labels: [{ name: 'status:ready' }], assignees: [] });
    if (target.endsWith('/graphql')) {
      const query = JSON.parse(String(init?.body)).query as string;
      expect(query).toContain('fieldValueByName(name:"Type")');
      return Response.json({ data: { repositoryOwner: { projectV2: { title: 'Board', items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ fieldValueByName: { name: 'Ready' }, f0: options.projectType ? { name: options.projectType } : null, content: { __typename: 'Issue', number: 7, title: 'Work', url, state: 'OPEN', repository: { nameWithOwner: 'example/repo' }, labels: { nodes: (options.projectLabels ?? ['status:ready']).map((name) => ({ name })) }, assignees: { nodes: [] } } }] } } } } });
    }
    throw Error('unexpected request');
  }) as typeof fetch;
}

describe('fresh assignment snapshot', () => {
  it('reads issue, process and condition field, preserving the context versions', async () => {
    const result = await readAssignmentSnapshot('token', { owner: 'example', number: 1 }, url, context, mockedFetch({ projectType: 'feature' }));
    expect(result).toMatchObject({ issueState: 'open', activeExecution: 'no', conditionFields: { Type: 'feature' }, rosterVersion: '["roster-1","task-1"]', plan: { status: 'proposal', candidate: 'worker', label: 'work:agent', holder: 'current' } });
  });
  it('does not infer a proposal for missing or nonmatching Project fields', async () => {
    expect((await readAssignmentSnapshot('t', { owner: 'example', number: 1 }, url, context, mockedFetch()))?.plan.status).toBe('condition-unknown');
    expect((await readAssignmentSnapshot('t', { owner: 'example', number: 1 }, url, context, mockedFetch({ projectType: 'planning' })))?.plan.status).toBe('condition-not-met');
  });
  it('rejects unreadable process, missing roster and inconsistent Issue snapshots', async () => {
    expect(await readAssignmentSnapshot('t', { owner: 'example', number: 1 }, url, context, mockedFetch({ processStatus: 404 }))).toBeUndefined();
    expect(await readAssignmentSnapshot('t', { owner: 'example', number: 1 }, url, { ...context, readRoster: async () => undefined }, mockedFetch())).toBeUndefined();
    expect(await readAssignmentSnapshot('t', { owner: 'example', number: 1 }, url, context, mockedFetch({ projectLabels: ['status:review'] }))).toBeUndefined();
  });
});

describe('confirmed GitHub action', () => {
  it('adds exactly the requested label and checks the returned result', async () => {
    const fetcher = vi.fn(async () => Response.json([{ name: 'work:agent' }])) as unknown as typeof fetch;
    await writeProposalAction('t', { type: 'issue-label', issueUrl: url, label: 'work:agent' }, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(fetcher).mock.calls[0][1]?.body))).toEqual({ labels: ['work:agent'] });
  });
  it('reports failure if GitHub does not confirm the label', async () => {
    await expect(writeProposalAction('t', { type: 'issue-label', issueUrl: url, label: 'work:agent' }, vi.fn(async () => Response.json([])) as unknown as typeof fetch)).rejects.toThrow();
  });
});


describe('connected confirmation flow', () => {
  it('does not send an Issue action when the user cancels', async () => {
    const fetcher = mockedFetch({ projectType: 'feature' });
    const readFresh = () => readAssignmentSnapshot('t', { owner: 'example', number: 1 }, url, context, fetcher);
    const shown = await readFresh();
    expect(shown).toBeDefined();
    const write = vi.fn();
    expect(await applyConfirmedProposal(shown!, { readFresh, confirm: async () => false, write })).toEqual({ status: 'cancelled' });
    expect(write).not.toHaveBeenCalled();
  });
  it('does not request confirmation when execution is unknown', async () => {
    const fetcher = mockedFetch({ projectType: 'feature' });
    const unknown = { ...context, readExecution: async () => 'unknown' as const };
    const readFresh = () => readAssignmentSnapshot('t', { owner: 'example', number: 1 }, url, unknown, fetcher);
    const shown = await readFresh();
    const confirm = vi.fn(), write = vi.fn();
    expect(await applyConfirmedProposal(shown!, { readFresh, confirm, write })).toEqual({ status: 'rejected', reason: 'unavailable' });
    expect(confirm).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });
});
