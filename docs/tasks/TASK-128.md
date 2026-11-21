---
id: TASK-128
type: task
title: Add optional shared-root requirement ID allocation
requirement: REQ-022
status: draft
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-002, AC-006]
---

# TASK-128 Add optional shared-root requirement ID allocation

Implement the optional local shared allocation domain and single operating-root configuration decision in [DEC-030](../decisions/DEC-030-optional-root-requirement-id-allocation.md). Repository-scoped identity and repository-local history remain authoritative when shared allocation is not enabled. This work is not part of the TASK-118 completion claim.

## Acceptance criteria

- Root configuration discovery reports multiple root files on one ancestry rather than silently selecting one, while retaining the separate personal configuration. Show the effective configuration and allocation domain.
- Initialize a shared domain from discovered repository histories and requirement documents with a review of duplicates, exclusions and failures; incorporate new repositories safely and preserve existing histories.
- Serialize participating creators and durably reserve in the root history before the repository history and exclusive file creation. Recover safely from interruption at every durable step, and fail closed on missing, malformed or incomplete required state.
- Verify concurrent creation, initialization, interrupted recovery and configuration conflicts with automated tests and appropriate local VS Code checks. Document independent-clone, missing historical ID and nonparticipating-writer limits without claiming global uniqueness.

Owner: agent; a named owner and GitHub issue are not yet assigned. No implementation or verification is claimed.
