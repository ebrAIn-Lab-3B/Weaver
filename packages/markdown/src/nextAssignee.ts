import type { KanbanColumn } from './kanban';
import { reachEntries, type Contributor } from './roster';

/** Organization-supplied policy for a state; independent actions may have their own participants. */
export interface NextAssigneeRule {
  decider: string;
  nextRole: string;
  when?: { projectField: string; values: string[] };
}

export interface NextAssigneeInput {
  column: KanbanColumn;
  rules: Partial<Record<KanbanColumn, NextAssigneeRule>>;
  contributors: readonly Contributor[];
  /** Values from a successful, current Project field read. Missing means unknown. */
  projectFields?: Readonly<Record<string, string>>;
  /** Observed holder, when known. Never treated as a delivery or start. */
  holder?: string;
}

export type NextAssigneePlan = {
  column: KanbanColumn;
  holder?: string;
  decider?: string;
} & (
  | { status: 'unconfigured' }
  | { status: 'invalid-rule' }
  | { status: 'condition-unknown'; field: string }
  | { status: 'condition-not-met'; field: string }
  | { status: 'no-candidate'; role: string }
  | { status: 'ambiguous-candidate'; role: string; candidates: string[] }
  | { status: 'ambiguous-reach'; role: string; candidate: string }
  | { status: 'proposal'; role: string; candidate: string; kind: Contributor['kind']; issueAssignee?: string; label?: string }
);

/** Read-only planning: it never assigns, dispatches, or treats a named owner as execution. */
export function planNextAssignee(input: NextAssigneeInput): NextAssigneePlan {
  const base = { column: input.column, ...(input.holder ? { holder: input.holder } : {}) };
  const rule = input.rules[input.column];
  if (!rule) return { ...base, status: 'unconfigured' };
  const decider = rule.decider.trim();
  const role = rule.nextRole.trim();
  if (!decider || !role) return { ...base, status: 'invalid-rule' };
  const withDecider = { ...base, decider };
  if (rule.when) {
    const { projectField, values } = rule.when;
    if (!projectField.trim() || !values.length || values.some((value) => !value.trim())) return { ...base, status: 'invalid-rule' };
    const value = input.projectFields?.[projectField];
    if (value === undefined || !value.trim()) return { ...withDecider, status: 'condition-unknown', field: projectField };
    if (!values.includes(value)) return { ...withDecider, status: 'condition-not-met', field: projectField };
  }
  const matches = input.contributors.filter((c) => c.roles?.includes(role));
  if (matches.length === 0) return { ...withDecider, status: 'no-candidate', role };
  if (matches.length > 1) return { ...withDecider, status: 'ambiguous-candidate', role, candidates: matches.map((c) => c.id) };
  const candidate = matches[0];
  const labels = candidate.kind === 'agent' ? reachEntries(candidate).filter((r) => r.type === 'label').map((r) => r.value) : [];
  if (labels.length > 1) return { ...withDecider, status: 'ambiguous-reach', role, candidate: candidate.id };
  return {
    ...withDecider, status: 'proposal', role, candidate: candidate.id, kind: candidate.kind,
    ...(candidate.kind === 'human' && candidate.github ? { issueAssignee: candidate.github } : {}),
    ...(labels.length === 1 ? { label: labels[0] } : {}),
  };
}
