---
id: TASK-128
type: task
title: Add optional shared-root requirement ID allocation
requirement: REQ-022
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/357
status: cancelled
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-002, AC-006]
---

# TASK-128 Add optional shared-root requirement ID allocation

This cancelled task proposed the optional local shared allocation domain and single operating-root configuration decision in [DEC-030](../decisions/DEC-030-optional-root-requirement-id-allocation.md). Repository-scoped identity and repository-local history remain authoritative when shared allocation is not enabled. This work is not part of the TASK-118 completion claim.

## Original acceptance criteria (withdrawn)

- Root configuration discovery reports multiple root files on one ancestry rather than silently selecting one, while retaining the separate personal configuration. Show the effective configuration and allocation domain.
- Initialize a shared domain from discovered repository histories and requirement documents with a review of duplicates, exclusions and failures; incorporate new repositories safely and preserve existing histories.
- Serialize participating creators and durably reserve in the root history before the repository history and exclusive file creation. Recover safely from interruption at every durable step, and fail closed on missing, malformed or incomplete required state.
- Verify concurrent creation, initialization, interrupted recovery and configuration conflicts with automated tests and appropriate local VS Code checks. Document independent-clone, missing historical ID and nonparticipating-writer limits without claiming global uniqueness.

## Cancellation (2026-11-21)

The maintainer selected repository-local allocation and repository-qualified identity without the optional shared domain. [DEC-030](../decisions/DEC-030-optional-root-requirement-id-allocation.md) is withdrawn, including its proposed root-discovery change. This task is cancelled, not verified. The partial root-discovery implementation and its tests described below were discarded; they are not evidence of completion. Repository identity tests (7 passed) and the simulated authoring integration passed before those changes were discarded; the latter included the discarded changes. Existing history-loss, independent-clone and nonparticipating-writer limitations remain.

After discarding the code changes, the repository identity and root configuration suites passed (35 tests), and `npm run test:author-document` passed against the restored implementation. These checks do not establish global uniqueness or unrestricted historical ID recovery.

Owner: agent; no named owner was assigned.
