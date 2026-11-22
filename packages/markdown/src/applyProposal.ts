import { recheckAssignmentProposal, type ProposalRecheck, type ProposalSnapshot } from './proposalRecheck';

/** A single GitHub change. Adding a label may trigger an external agent. */
export type ProposalAction =
  | { type: 'issue-assignees'; issueUrl: string; from: readonly string[]; to: readonly string[] }
  | { type: 'issue-label'; issueUrl: string; label: string };

export type ApplyProposalResult =
  | { status: 'applied'; action: ProposalAction }
  | { status: 'cancelled' }
  | { status: 'rejected'; reason: Exclude<ProposalRecheck, { ok: true }>['reason'] | 'no-action' | 'already-applied' }
  | { status: 'failed'; phase: 'read' | 'write' };

export interface ApplyProposalDependencies {
  /** Must return freshly read, complete observations; never use a cached fallback. */
  readFresh(): Promise<ProposalSnapshot | undefined>;
  /** Shows the exact single action, including the label's potential dispatch effect. */
  confirm(action: ProposalAction): Promise<boolean>;
  /** Performs only the confirmed action; the caller reports failure and any external effects. */
  write(action: ProposalAction): Promise<void>;
}

/** Builds a single, reviewable change. It does not alter task files or dispatch by itself. */
export function proposalAction(snapshot: ProposalSnapshot): ProposalAction | undefined {
  const plan = snapshot.plan;
  if (plan.status !== 'proposal') return undefined;
  if (plan.kind === 'human' && plan.issueAssignee) {
    return { type: 'issue-assignees', issueUrl: snapshot.issueUrl, from: [...snapshot.assignees], to: [plan.issueAssignee] };
  }
  if (plan.kind === 'agent' && plan.label) return { type: 'issue-label', issueUrl: snapshot.issueUrl, label: plan.label };
  return undefined;
}

/**
 * Read, show exactly one change, re-read, then write once. This is not an atomic lock:
 * other writers can still change the Issue after the second read.
 */
export async function applyConfirmedProposal(shown: ProposalSnapshot, deps: ApplyProposalDependencies): Promise<ApplyProposalResult> {
  let before: ProposalSnapshot | undefined;
  try { before = await deps.readFresh(); } catch { return { status: 'failed', phase: 'read' }; }
  const first = recheckAssignmentProposal(shown, before);
  if (!first.ok) return { status: 'rejected', reason: first.reason };
  const action = proposalAction(before!);
  if (!action) return { status: 'rejected', reason: 'no-action' };
  if (action.type === 'issue-label' && before!.labels.some((l) => l.toLowerCase() === action.label.toLowerCase())) return { status: 'rejected', reason: 'already-applied' };
  if (action.type === 'issue-assignees' && action.from.length === 1 && action.from[0].toLowerCase() === action.to[0].toLowerCase()) return { status: 'rejected', reason: 'already-applied' };
  if (!await deps.confirm(action)) return { status: 'cancelled' };
  let after: ProposalSnapshot | undefined;
  try { after = await deps.readFresh(); } catch { return { status: 'failed', phase: 'read' }; }
  const second = recheckAssignmentProposal(before!, after);
  if (!second.ok) return { status: 'rejected', reason: second.reason };
  try { await deps.write(action); } catch { return { status: 'failed', phase: 'write' }; }
  return { status: 'applied', action };
}
