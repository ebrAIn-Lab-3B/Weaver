import { recheckAssignmentProposal, type ProposalRecheck, type ProposalSnapshot } from './proposalRecheck';

/** A single GitHub change. Adding a label may trigger an external agent. */
export type ProposalAction =
  | { type: 'issue-assignees'; issueUrl: string; from: readonly string[]; to: readonly string[] }
  | { type: 'issue-label'; issueUrl: string; label: string };

/** An explicit human statement, scoped to this Issue and retained for the host's action log. */
export interface ExecutionAttestation {
  issueUrl: string;
  actor: string;
  source: string;
  checkedAt: string;
}

export type ApplyProposalResult =
  | { status: 'applied'; action: ProposalAction; executionAttestation?: ExecutionAttestation }
  | { status: 'cancelled' }
  | { status: 'rejected'; reason: Exclude<ProposalRecheck, { ok: true }>['reason'] | 'no-action' | 'already-applied' }
  | { status: 'failed'; phase: 'read' | 'write' };

export interface ApplyProposalDependencies {
  /** Must return freshly read, complete observations; never use a cached fallback. */
  readFresh(): Promise<ProposalSnapshot | undefined>;
  /** Optional explicit human check when the execution observation is unknown. */
  confirmExecution?(issueUrl: string): Promise<ExecutionAttestation | undefined>;
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
  // Preliminary comparison may inspect unknown status but can never itself authorize a write.
  const first = recheckAssignmentProposal(shown, before, { manualExecutionCheck: true });
  if (!first.ok) return { status: 'rejected', reason: first.reason };
  const action = proposalAction(before!);
  if (!action) return { status: 'rejected', reason: 'no-action' };
  if (action.type === 'issue-label' && before!.labels.some((l) => l.toLowerCase() === action.label.toLowerCase())) return { status: 'rejected', reason: 'already-applied' };
  if (action.type === 'issue-assignees' && action.from.length === 1 && action.from[0].toLowerCase() === action.to[0].toLowerCase()) return { status: 'rejected', reason: 'already-applied' };
  let attestation: ExecutionAttestation | undefined;
  if (before!.activeExecution === 'unknown') {
    if (!deps.confirmExecution) return { status: 'rejected', reason: 'unavailable' };
    const startedAt = Date.now();
    attestation = await deps.confirmExecution(before!.issueUrl);
    if (!attestation) return { status: 'cancelled' };
    const checkedAt = Date.parse(attestation.checkedAt);
    if (attestation.issueUrl !== before!.issueUrl || !attestation.actor.trim() || !attestation.source.trim() || !Number.isFinite(checkedAt) || checkedAt < startedAt - 1000 || checkedAt > Date.now() + 1000) return { status: 'rejected', reason: 'unavailable' };
  }
  if (!await deps.confirm(action)) return { status: 'cancelled' };
  let after: ProposalSnapshot | undefined;
  try { after = await deps.readFresh(); } catch { return { status: 'failed', phase: 'read' }; }
  const second = recheckAssignmentProposal(before!, after, { manualExecutionCheck: Boolean(attestation) });
  if (!second.ok) return { status: 'rejected', reason: second.reason };
  // A check is scoped to this interaction and expires if the confirmation was left open.
  if (attestation && Date.now() - Date.parse(attestation.checkedAt) > 120_000) return { status: 'rejected', reason: 'unavailable' };
  try { await deps.write(action); } catch { return { status: 'failed', phase: 'write' }; }
  return { status: 'applied', action, ...(attestation ? { executionAttestation: attestation } : {}) };
}
