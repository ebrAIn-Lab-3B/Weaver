---
id: TASK-132
type: task
title: Create tasks with configured initial state and resumable steps
requirement: REQ-024
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/394
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
assignee: codex
criteria: [AC-001, AC-002, AC-003, AC-005]
---

# Create tasks with configured initial state and resumable steps

## Dependencies

TASK-131 design and decisions.

## Acceptance criteria

- Implement the agreed creation and recovery path for requirement entry, task file PR, Issue, Project membership and initial state using the target repository process; expose per-step outcomes and identifiers.
- Resume after failure or unknown result without repeating confirmed work; fail closed on ambiguous identity or incomplete reads, including concurrent attempts. Preserve configured task fields, approval and file PR rules.
- Test labels and board-status with custom mappings, missing or ambiguous mappings, every write boundary, reruns, concurrency and access failures; catalog user-visible messages in English and Korean.

## Tests and completion evidence

Linked implementation PR and passing targeted automated tests with partial-failure and retry results; record remaining concurrency or host limitations.

Status: planned. No implementation or completion evidence has been recorded.
