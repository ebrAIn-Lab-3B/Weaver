import { describe, expect, it } from 'vitest';
import { parseProcess, planNextAssignee } from '../src';

describe('assignment process configuration', () => {
  it('reads a partial state rule and passes it to the read-only planner', () => {
    const parsed = parseProcess('process.yaml', 'version: 1\nassignment:\n  Review:\n    decider: Neo\n    next-role: reviewer\n');
    expect(parsed.issues).toEqual([]);
    expect(parsed.process.assignment).toEqual({ Review: { decider: 'Neo', nextRole: 'reviewer' } });
    expect(planNextAssignee({ column: 'Ready', rules: parsed.process.assignment!, contributors: [] }).status).toBe('unconfigured');
    expect(planNextAssignee({ column: 'Review', rules: parsed.process.assignment!, contributors: [{ id: 'lee', kind: 'human', roles: ['reviewer'] }] })).toMatchObject({ status: 'proposal', candidate: 'lee', decider: 'Neo' });
  });
  it.each(['assignment: nope', 'assignment:\n  Unknown:\n    decider: x\n    next-role: y', 'assignment:\n  Review:\n    decider: x', 'assignment:\n  Review:\n    decider: x\n    next-role: y\n    extra: z'])('rejects invalid configuration without applying part of it: %s', (yaml) => {
    const parsed = parseProcess('process.yaml', yaml);
    expect(parsed.process.assignment).toBeUndefined();
    expect(parsed.issues.some((issue) => issue.code === 'process-invalid-assignment')).toBe(true);
  });
});
