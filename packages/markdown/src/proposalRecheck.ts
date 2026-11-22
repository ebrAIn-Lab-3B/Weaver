import type { NextAssigneePlan } from './nextAssignee';

/** Values from a fresh read, kept separate from the proposal shown to the person. */
export interface ProposalSnapshot {
  issueUrl: string;
  issueState: 'open' | 'closed';
  /** Supplied by the configured execution source; unknown must never permit application. */
  activeExecution: 'yes' | 'no' | 'unknown';
  labels: readonly string[];
  assignees: readonly string[];
  /** Configured condition fields; undefined when their read failed. */
  conditionFields: Readonly<Record<string, string>> | undefined;
  /** Exact versions or digests of the effective process and roster. */
  processVersion: string;
  rosterVersion: string;
  plan: NextAssigneePlan;
}

export type ProposalRecheck =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'closed' | 'execution-active' | 'changed' | 'not-actionable' };

const sorted = (items: readonly string[]): string[] => [...items].sort();
const fields = (value: Readonly<Record<string, string>>): string => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));

/** Fail closed when a shown proposal is no longer current. This function never performs a write. */
export function recheckAssignmentProposal(shown: ProposalSnapshot, fresh: ProposalSnapshot | undefined, options: { manualExecutionCheck?: boolean } = {}): ProposalRecheck {
  if (!fresh || !shown.processVersion || !shown.rosterVersion || !fresh.processVersion || !fresh.rosterVersion || !shown.conditionFields || !fresh.conditionFields) return { ok: false, reason: 'unavailable' };
  if (fresh.issueState !== 'open') return { ok: false, reason: 'closed' };
  // Configuration supplies this observation; an unreadable execution source fails closed.
  if (fresh.activeExecution === 'yes' || shown.activeExecution === 'yes') return { ok: false, reason: 'execution-active' };
  if (!options.manualExecutionCheck && (fresh.activeExecution === 'unknown' || shown.activeExecution === 'unknown')) return { ok: false, reason: 'unavailable' };
  if (shown.plan.status !== 'proposal' || fresh.plan.status !== 'proposal') return { ok: false, reason: 'not-actionable' };
  if (shown.issueUrl !== fresh.issueUrl || shown.issueState !== fresh.issueState || shown.activeExecution !== fresh.activeExecution ||
      shown.processVersion !== fresh.processVersion || shown.rosterVersion !== fresh.rosterVersion || fields(shown.conditionFields) !== fields(fresh.conditionFields) ||
      JSON.stringify(sorted(shown.labels)) !== JSON.stringify(sorted(fresh.labels)) ||
      JSON.stringify(sorted(shown.assignees)) !== JSON.stringify(sorted(fresh.assignees)) ||
      shown.plan.column !== fresh.plan.column || shown.plan.holder !== fresh.plan.holder ||
      shown.plan.decider !== fresh.plan.decider || shown.plan.role !== fresh.plan.role ||
      shown.plan.candidate !== fresh.plan.candidate || shown.plan.kind !== fresh.plan.kind ||
      shown.plan.issueAssignee !== fresh.plan.issueAssignee || shown.plan.label !== fresh.plan.label) return { ok: false, reason: 'changed' };
  return { ok: true };
}
