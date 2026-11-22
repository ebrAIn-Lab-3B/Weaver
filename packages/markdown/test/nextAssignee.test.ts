import { describe, expect, it } from 'vitest';
import { planNextAssignee, type Contributor } from '../src';

const people: Contributor[] = [
  { id: 'developer', kind: 'agent', roles: ['build'], reach: [{ type: 'label', value: 'dispatch:dev' }] },
  { id: 'reviewer', kind: 'human', roles: ['review'], github: 'reviewer-login' },
];
const rules = { Review: { decider: 'maintainer', nextRole: 'review' } };

describe('next assignee planning', () => {
  it('keeps the observed holder separate from the configured decider and proposal', () => {
    expect(planNextAssignee({ column: 'Review', holder: 'developer', rules, contributors: people })).toEqual({
      column: 'Review', holder: 'developer', decider: 'maintainer', status: 'proposal', role: 'review',
      candidate: 'reviewer', kind: 'human', issueAssignee: 'reviewer-login',
    });
  });
  it('returns a configured agent label without applying or dispatching it', () => {
    expect(planNextAssignee({ column: 'Ready', rules: { Ready: { decider: 'rule', nextRole: 'build' } }, contributors: people }))
      .toMatchObject({ status: 'proposal', candidate: 'developer', label: 'dispatch:dev' });
  });
  it('does not guess when a rule or candidate is absent or invalid', () => {
    expect(planNextAssignee({ column: 'Ready', rules, contributors: people }).status).toBe('unconfigured');
    expect(planNextAssignee({ column: 'Review', rules: { Review: { decider: ' ', nextRole: 'review' } }, contributors: people }).status).toBe('invalid-rule');
    expect(planNextAssignee({ column: 'Review', rules, contributors: [] }).status).toBe('no-candidate');
  });
  it('does not silently choose between contributors or multiple dispatch labels', () => {
    expect(planNextAssignee({ column: 'Review', rules, contributors: [...people, { id: 'other', kind: 'human', roles: ['review'] }] }))
      .toMatchObject({ status: 'ambiguous-candidate', candidates: ['reviewer', 'other'] });
    expect(planNextAssignee({ column: 'Ready', rules: { Ready: { decider: 'rule', nextRole: 'build' } }, contributors: [{ id: 'bot', kind: 'agent', roles: ['build'], reach: [{ type: 'label', value: 'a' }, { type: 'label', value: 'b' }] }] }))
      .toMatchObject({ status: 'ambiguous-reach', candidate: 'bot' });
  });
});
