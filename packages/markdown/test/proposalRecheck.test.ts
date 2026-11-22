import { describe, expect, it } from 'vitest';
import { recheckAssignmentProposal, type ProposalSnapshot } from '../src';

const snapshot: ProposalSnapshot = {
  issueUrl: 'https://github.com/o/r/issues/1', issueState: 'open', activeExecution: 'no', labels: ['status:ready'], assignees: [],
  processVersion: 'p1', rosterVersion: 'r1', conditionFields: { Type: 'feature' },
  plan: { column: 'Ready', status: 'proposal', decider: 'coordinator', role: 'build', candidate: 'developer', kind: 'agent', label: 'dispatch:dev' },
};

describe('assignment proposal recheck', () => {
  it('accepts only the same current proposal and state', () => {
    expect(recheckAssignmentProposal(snapshot, { ...snapshot, labels: ['status:ready'] })).toEqual({ ok: true });
  });
  it('stops on unavailable data, closure or an existing delivery claim', () => {
    expect(recheckAssignmentProposal(snapshot, undefined)).toEqual({ ok: false, reason: 'unavailable' });
    expect(recheckAssignmentProposal(snapshot, { ...snapshot, issueState: 'closed' })).toEqual({ ok: false, reason: 'closed' });
    expect(recheckAssignmentProposal(snapshot, { ...snapshot, activeExecution: 'yes' })).toEqual({ ok: false, reason: 'execution-active' });
    expect(recheckAssignmentProposal(snapshot, { ...snapshot, activeExecution: 'unknown' })).toEqual({ ok: false, reason: 'unavailable' });
    expect(recheckAssignmentProposal(snapshot, { ...snapshot, conditionFields: undefined })).toEqual({ ok: false, reason: 'unavailable' });
  });
  it('stops if the process, roster, observed Issue or proposed actor changes', () => {
    for (const fresh of [
      { ...snapshot, processVersion: 'p2' }, { ...snapshot, rosterVersion: 'r2' },
      { ...snapshot, conditionFields: { Type: 'bug' } }, { ...snapshot, labels: ['status:review'] }, { ...snapshot, assignees: ['another'] },
      { ...snapshot, plan: { ...snapshot.plan, candidate: 'someone-else' } as ProposalSnapshot['plan'] },
    ]) expect(recheckAssignmentProposal(snapshot, fresh)).toEqual({ ok: false, reason: 'changed' });
  });
  it('stops if the configured participant role or recorded participant changes', () => {
    const shown: ProposalSnapshot = { ...snapshot, plan: { ...snapshot.plan, taskField: 'reviewer', taskParticipant: 'reviewer' } };
    const changed: ProposalSnapshot = { ...shown, plan: { ...shown.plan, taskField: 'reviewer', taskParticipant: 'other' } };
    expect(recheckAssignmentProposal(shown, changed)).toEqual({ ok: false, reason: 'changed' });
  });
  it('cannot apply a missing or newly nonmatching condition', () => {
    expect(recheckAssignmentProposal(snapshot, { ...snapshot, plan: { column: 'Ready', status: 'condition-unknown', field: 'Type' } })).toEqual({ ok: false, reason: 'not-actionable' });
  });
});
