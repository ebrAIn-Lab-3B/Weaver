import { describe, expect, it } from 'vitest';
import { parseProcess, planNextAssignee } from '../src';

const yaml = `version: 1
assignment:
  Ready:
    decider: coordinator
    next-role: implementer
    when:
      project-field: Type
      in: [feature, bug]
`;
const contributor = { id: 'developer', kind: 'agent' as const, roles: ['implementer'] };

describe('conditional proposal', () => {
  it('proposes only when the explicit Project field matches', () => {
    const parsed = parseProcess('process.yaml', yaml);
    expect(parsed.issues).toEqual([]);
    const rules = parsed.process.assignment!;
    const input = { column: 'Ready' as const, rules, contributors: [contributor] };
    expect(planNextAssignee({ ...input, projectFields: { Type: 'feature' } })).toMatchObject({ status: 'proposal', candidate: 'developer' });
    expect(planNextAssignee({ ...input, projectFields: { Type: 'planning' } })).toMatchObject({ status: 'condition-not-met', field: 'Type' });
    expect(planNextAssignee(input)).toMatchObject({ status: 'condition-unknown', field: 'Type' });
    expect(planNextAssignee({ ...input, projectFields: { Type: '' } }).status).toBe('condition-unknown');
  });
  it.each(['in: []', 'in: [feature, ""]', 'in: wrong', 'in: [feature]\n      unknown: x'])('rejects an invalid condition: %s', (condition) => {
    const parsed = parseProcess('process.yaml', yaml.replace('in: [feature, bug]', condition));
    expect(parsed.process.assignment).toBeUndefined();
    expect(parsed.issues.some((issue) => issue.code === 'process-invalid-assignment')).toBe(true);
  });
});
