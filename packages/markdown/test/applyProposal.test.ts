import { describe, expect, it, vi } from 'vitest';
import { applyConfirmedProposal, type ProposalSnapshot } from '../src';

const base: ProposalSnapshot = {
  issueUrl: 'https://github.com/a/b/issues/1', issueState: 'open', activeExecution: 'no',
  labels: ['ready'], assignees: ['old'], conditionFields: { Type: 'feature' }, processVersion: 'p1', rosterVersion: 'r1',
  plan: { column: 'Ready', status: 'proposal', decider: 'owner', role: 'build', candidate: 'agent', kind: 'agent', label: 'work:agent' },
};

describe('confirmed proposal workflow', () => {
  it('shows the exact label and writes it once after two fresh reads', async () => {
    const readFresh = vi.fn().mockResolvedValue(base), confirm = vi.fn().mockResolvedValue(true), write = vi.fn().mockResolvedValue(undefined);
    const result = await applyConfirmedProposal(base, { readFresh, confirm, write });
    expect(result).toEqual({ status: 'applied', action: { type: 'issue-label', issueUrl: base.issueUrl, label: 'work:agent' } });
    expect(readFresh).toHaveBeenCalledTimes(2); expect(write).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(result.status === 'applied' ? result.action : null);
  });
  it('never writes on cancellation or a changed condition after confirmation', async () => {
    const write = vi.fn();
    const cancel = await applyConfirmedProposal(base, { readFresh: async () => base, confirm: async () => false, write });
    expect(cancel.status).toBe('cancelled'); expect(write).not.toHaveBeenCalled();
    const readFresh = vi.fn().mockResolvedValueOnce(base).mockResolvedValueOnce({ ...base, conditionFields: { Type: 'bug' } });
    const changed = await applyConfirmedProposal(base, { readFresh, confirm: async () => true, write });
    expect(changed).toEqual({ status: 'rejected', reason: 'changed' }); expect(write).not.toHaveBeenCalled();
  });
  it('never offers an action when execution is unknown or already active', async () => {
    for (const activeExecution of ['yes', 'unknown'] as const) {
      const confirm = vi.fn(), write = vi.fn();
      await applyConfirmedProposal(base, { readFresh: async () => ({ ...base, activeExecution }), confirm, write });
      expect(confirm).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
    }
  });
  it('shows the existing and proposed human assignees, and rejects an agent without a label', async () => {
    const human: ProposalSnapshot = { ...base, plan: { column: 'Ready', status: 'proposal', decider: 'owner', role: 'build', candidate: 'person', kind: 'human', issueAssignee: 'new' } };
    const confirm = vi.fn().mockResolvedValue(true), write = vi.fn();
    await applyConfirmedProposal(human, { readFresh: async () => human, confirm, write });
    expect(confirm).toHaveBeenCalledWith({ type: 'issue-assignees', issueUrl: base.issueUrl, from: ['old'], to: ['new'] });
    const noLabel: ProposalSnapshot = { ...base, plan: { column: 'Ready', status: 'proposal', decider: 'owner', role: 'build', candidate: 'agent', kind: 'agent' } };
    expect(await applyConfirmedProposal(noLabel, { readFresh: async () => noLabel, confirm, write })).toEqual({ status: 'rejected', reason: 'no-action' });
  });
  it('reports failed reads or writes without retrying them', async () => {
    expect(await applyConfirmedProposal(base, { readFresh: async () => { throw Error(); }, confirm: vi.fn(), write: vi.fn() })).toEqual({ status: 'failed', phase: 'read' });
    const write = vi.fn().mockRejectedValue(Error());
    expect(await applyConfirmedProposal(base, { readFresh: async () => base, confirm: async () => true, write })).toEqual({ status: 'failed', phase: 'write' });
    expect(write).toHaveBeenCalledTimes(1);
  });
});
