---
id: TASK-135
type: task
title: Verify task registration and recovery end to end
requirement: REQ-024
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/397
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
assignee: codex
criteria: [AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011]
---

# Verify task registration and recovery end to end

## Dependencies

TASK-132, TASK-133, TASK-134, TASK-136 and TASK-137.

## Acceptance criteria

- Run the automated matrix and an isolated end-to-end registration and verification flow for both configured column sources; inspect requirement, file PR/merge state, Issue, Project item and configured status.
- Exercise partial failures, reruns and inaccessible sources in controlled fixtures; confirm no duplicate artifacts and review a deliberately shared Issue without treating sharing as an error.
- Exercise confirmed resolution of existing status divergence, including board-ahead and stale-read cases, and verify repeat execution is a no-op.
- Verify the end-to-end diagnosis, approval, repair and recheck without an AI service; identical fixtures yield identical findings and proposals, and ambiguous cases remain unresolved.
- Exercise missing cards, actual options Backlog and Todo, closed Issue with merged non-closing PR, absent CI, conflicting independent test claims, approval/cancellation and same-scope post-action recheck; include failed and truncated pages. Verify no unsupported Verified claim.
- Record commands, outputs, artifact links, observed permissions, cleanup and untested boundaries; review all REQ-024 criteria before proposing requirement completion.

## Tests and completion evidence

Linked test results and real or isolated Project observations, including limitations and requirement review. A fixture alone must not be described as live verification.

Status: planned. No implementation or completion evidence has been recorded.
