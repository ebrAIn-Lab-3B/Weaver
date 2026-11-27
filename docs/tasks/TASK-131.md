---
id: TASK-131
type: task
title: Investigate and design recoverable task registration
requirement: REQ-024
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/393
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
assignee: codex
criteria: [AC-001, AC-002, AC-003, AC-004, AC-005, AC-011]
---

# Investigate and design recoverable task registration

## Dependencies

None.

## Acceptance criteria

- Inventory CLI, editor, reconcile and GitHub read/write behavior, existing tests and relevant issues; reproduce the incident with synthetic data and document observed limits.
- Specify a deterministic rule-based diagnostic and repair contract that works without AI, including explicit reasons and decision paths when rules or facts are insufficient.
- Specify stable identity, read-before-write, uncertain outcomes, concurrent attempts, idempotency boundaries, state mapping and failure reporting. Describe how incomplete reads fail closed and shared Issues require human interpretation.
- Document decisions and alternatives, dependencies, confirmation/PR boundaries and a test matrix for both column sources; identify any guarantee that cannot be provided and how it is exposed.

## Tests and completion evidence

Design and investigation notes linked from this task, cited source and test observations, and review of unresolved decisions. No implementation completion is implied.

Status: in progress. The investigation and design are documented below; review and completion evidence remain outstanding.

Implementation and investigation draft: [PR #416](https://github.com/ebrAIn-Lab-3B/Weaver/pull/416). This is not completion evidence.

## Work in progress (2026-11-27 KST)

The [reconciliation design](../architecture/task-reconciliation-design.md) records the current safety contract and limits. Implementation and verification are in progress; this does not establish task completion.

The [registration identity investigation](../architecture/task-registration-recovery.md) inventories the current creation boundary and proposes identity, reservation, uncertainty and recovery rules. In particular, a Git ref or expiring lease alone cannot fence a paused Issue creator; the execution and takeover protocol remains unresolved. The existing partial-push-failure fixture is synthetic evidence of one boundary, not the complete test matrix. This task remains in progress.

The synthetic [TASK-133 scenarios](../../packages/markdown/test/task133Scenarios.test.ts) reproduce both incident conditions separately: a task artifact without an Issue link is reported as `task-without-issue`, and a Project card without the authoritative status label is reported as `status-source-needs-decision` even when it has a board status. They also distinguish an incomplete Project read from confirmed missing membership and report a shared Issue for review. These are deterministic fixture observations, not evidence of the historic HealthBridge state or an end-to-end repair. The [registration recovery investigation](../architecture/task-registration-recovery.md#investigating-retained-reservations) records a manual decision path and limitations for uncertain creation outcomes.
