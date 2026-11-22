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
  it('requires a new, issue-specific human execution check when the source is unknown', async () => {
    const unknown: ProposalSnapshot = { ...base, activeExecution: 'unknown' };
    const write = vi.fn(), confirm = vi.fn().mockResolvedValue(true);
    const confirmExecution = vi.fn(async () => ({ issueUrl: base.issueUrl, actor: 'person', source: 'agent session', checkedAt: new Date().toISOString() }));
    const result = await applyConfirmedProposal(unknown, { readFresh: async () => unknown, confirmExecution, confirm, write });
    expect(result).toMatchObject({ status: 'applied', executionAttestation: { actor: 'person', source: 'agent session' } });
    expect(confirmExecution).toHaveBeenCalledOnce(); expect(write).toHaveBeenCalledOnce();
    const stale = await applyConfirmedProposal(unknown, { readFresh: async () => unknown, confirmExecution: async () => ({ issueUrl: base.issueUrl, actor: 'person', source: 'old', checkedAt: '2020-01-01T00:00:00Z' }), confirm, write: vi.fn() });
    expect(stale).toEqual({ status: 'rejected', reason: 'unavailable' });
  });
  it('never accepts a manual check for a different Issue, an empty source, or known active work', async () => {
    const unknown: ProposalSnapshot = { ...base, activeExecution: 'unknown' };
    for (const details of [{ issueUrl: 'https://github.com/a/b/issues/2', source: 'session' }, { issueUrl: base.issueUrl, source: ' ' }]) {
      const write = vi.fn();
      const result = await applyConfirmedProposal(unknown, { readFresh: async () => unknown, confirmExecution: async () => ({ ...details, actor: 'person', checkedAt: new Date().toISOString() }), confirm: async () => true, write });
      expect(result).toEqual({ status: 'rejected', reason: 'unavailable' }); expect(write).not.toHaveBeenCalled();
    }
    const active: ProposalSnapshot = { ...base, activeExecution: 'yes' };
    const confirmExecution = vi.fn(), write = vi.fn();
    const result = await applyConfirmedProposal(active, { readFresh: async () => active, confirmExecution, confirm: async () => true, write });
    expect(result).toEqual({ status: 'rejected', reason: 'execution-active' }); expect(confirmExecution).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });
  it('does not reuse a manual check after the execution observation changes', async () => {
    const unknown: ProposalSnapshot = { ...base, activeExecution: 'unknown' };
    const readFresh = vi.fn().mockResolvedValueOnce(unknown).mockResolvedValueOnce({ ...unknown, activeExecution: 'no' });
    const write = vi.fn();
    const result = await applyConfirmedProposal(unknown, { readFresh, confirmExecution: async () => ({ issueUrl: base.issueUrl, actor: 'person', source: 'agent session', checkedAt: new Date().toISOString() }), confirm: async () => true, write });
    expect(result).toEqual({ status: 'rejected', reason: 'changed' }); expect(write).not.toHaveBeenCalled();
  });
  it('does not reuse a human execution check after a long confirmation delay', async () => {
    vi.useFakeTimers();
    try {
      const unknown: ProposalSnapshot = { ...base, activeExecution: 'unknown' };
      const write = vi.fn();
      const result = await applyConfirmedProposal(unknown, { readFresh: async () => unknown, confirmExecution: async () => ({ issueUrl: base.issueUrl, actor: 'person', source: 'agent session', checkedAt: new Date().toISOString() }), confirm: async () => { vi.advanceTimersByTime(120_001); return true; }, write });
      expect(result).toEqual({ status: 'rejected', reason: 'unavailable' }); expect(write).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
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
