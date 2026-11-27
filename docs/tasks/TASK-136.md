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

Status: planned. No implementation or completion evidence has been recorded.
