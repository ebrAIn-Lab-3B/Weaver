---
id: TASK-136
type: task
title: Resolve recurring status divergence with explicit choices
requirement: REQ-024
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/398
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
assignee: codex
criteria: [AC-002, AC-005, AC-008, AC-010, AC-011]
---

# Resolve recurring status divergence with explicit choices

## Context and dependencies

TASK-131 defines identity, state mapping and uncertainty. Coordinate with TASK-133, which diagnoses and guides repair, and TASK-132, which addresses initial registration. This task delivers an actionable resolution for ongoing divergence, including existing cards, rather than another diagnostic. TASK-135 verifies the combined flow. TASK-010 and TASK-035 already report gaps; TASK-048 and DEC-012 already propose moving a behind board to its label, while a board ahead is report-only. Preserve DEC-008 and DEC-012 unless a reviewed decision explicitly amends them.

## Acceptance criteria

- Generate and execute approved, rule-based resolution plans without requiring an AI model or agent service. For identical configuration and observed facts, produce the same plan; leave ambiguous cases for a human decision.
- Present the current status label, Project Status, configured column source, mapping and available resolution choices for missing or conflicting status on an existing card. Support custom mappings and both `labels` and `board-status`; never assume a particular organization's values.
- Design and implement a policy-neutral configured projection for label-sourced status when necessary, including a migration/compatibility decision for the current fixed mapping; display actual options and refuse missing or ambiguous mappings. Do not infer that similarly named options are equivalent.
- Offer a confirmed action to bring a non-authoritative projection into alignment when an unambiguous mapping and existing policy permit it. Where a board-ahead conflict or a change to the authoritative state requires judgment, offer an explicit move or decision path with its consequences; do not silently infer intent or reverse progress. A verified or closed transition must retain existing evidence and confirmation rules. Propose a reviewed decision before changing DEC-012's report-only boundary.
- For every approved action show target and before/after values; after execution re-read the same scope and distinguish resolved findings, remaining warnings and failed or incomplete reads.
- Re-read configuration and relevant current values before writing; refuse stale, ambiguous, inaccessible or failed reads with a useful reason. Display step outcomes and safely retry only incomplete work; repeated successful resolution must be a no-op. Do not create duplicate labels or items.
- Test missing labels, missing Project Status, both directions of disagreement, custom and ambiguous mappings, both column sources, distinct Backlog/Todo options, approval and cancellation, post-action recheck, stale data, read/write failures, repeated actions and verification/closing safeguards. Provide English and Korean messages.

## Tests and completion evidence

Link the implementation PR, relevant decision if changed, passing targeted automated tests and observed controlled end-to-end resolution including a board-ahead case and recorded limitations. Coordinate the combined verification under TASK-135.

Status: implementation and verification in progress; final review is outstanding.

Completion evidence gap (2026-11-28): GitHub reported Issue #398 open with zero closing pull request references. This repository's process requires a merged closing PR for Verified. The merged implementation PRs listed below are evidence of implementation, but do not by themselves establish that required closing relationship. Do not infer Verified from their merge or from Project Status.

The projection compatibility decision [DEC-031](../decisions/DEC-031-label-project-status-projection.md) was accepted on 2026-11-28 following the user's instruction to proceed. Board-ahead cases remain report-only under DEC-012; a change to that boundary needs a separately reviewed decision.

On 2026-11-28 the implementation was tightened to report rather than offer a Project Status action when the actual Status options were not read ([PR #401](https://github.com/ebrAIn-Lab-3B/Weaver/pull/401), with CLI read-state propagation corrected in [PR #402](https://github.com/ebrAIn-Lab-3B/Weaver/pull/402)). [PR #403](https://github.com/ebrAIn-Lab-3B/Weaver/pull/403) also reports closed-Issue Project status gaps without proposing a write. All three PRs were merged with passing CI; targeted reconciliation tests and the full `npm test` suite passed.

## Work in progress (2026-11-27 KST)

The [reconciliation design](../architecture/task-reconciliation-design.md) records the current safety contract and limits. Implementation and verification are in progress; this does not establish task completion.

## Verification evidence (2026-11-27 KST)

`npm run check` and `npm test` passed. Targeted tests cover configured and legacy status mappings, shared Issues, incomplete and inaccessible reads, approval binding, a selected-Project-only write, stale configuration, a failed post-write read, and a stateful mock CLI plan/approve/recheck/retry flow. `node scripts/test-author-host.js reconciliation` passed in VS Code 1.148.0 with mock GitHub data. The [design and verification record](../architecture/task-reconciliation-design.md) describes the live isolated Project write, board-ahead and repeat checks, cleanup, and remaining limits.

The live label-source check exercised a Project status write. A separate board-source read-only check exposed an unexpected Issue reopen; the Issue was restored, but its close time and event history changed. The cause is unconfirmed, as recorded in the design. Error paths were tested with fixtures; the installed production extension and physical clicks were not checked. GitHub field updates are not atomic compare-and-set, so a concurrent change after the final read remains possible. [PR #400](https://github.com/ebrAIn-Lab-3B/Weaver/pull/400) was merged with passing CI; no GitHub review was recorded. Remaining acceptance checks and final review are required before marking this task complete.

In the user-approved 2026-11-28 live check with disposable [Issue #86](https://github.com/blcktgr73/poc-sandbox/issues/86), the Project add could not be verified immediately, but the item appeared once on a later read and a fresh plan offered no duplicate. The follow-up [PR #406](https://github.com/ebrAIn-Lab-3B/Weaver/pull/406) marks post-action rechecks incomplete after a failed action; its fixture simulates the observed sequence without claiming a cause. The [design record](../architecture/task-reconciliation-design.md) includes the board-status checks, active automation and cleanup.

The [design record](../architecture/task-reconciliation-design.md) also describes an isolated packaged-extension probe that used live GitHub data and found the Project title, Status options and rules in generated Overview HTML. Authentication was supplied through a test hook; normal sign-in, rendered pixels, and physical interaction were not tested.
