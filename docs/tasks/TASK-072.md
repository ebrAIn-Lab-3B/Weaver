---
id: TASK-072
type: task
title: Settle the prerequisites for automatic assignment
requirement: REQ-012
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/170
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-005]
assignee: claude-code
---

# TASK-072 Settle the prerequisites for automatic assignment

Tracked in [Issue #170](https://github.com/ebrAIn-Lab-3B/Weaver/issues/170). Ownership is recorded here; the Kanban column comes from the Issue ([DEC-003](../decisions/DEC-003-board-status-mapping.md), [DEC-005](../decisions/DEC-005-task-files.md)).

Research and decide bot identity, unattended runs, the hop limit, and coordination with an existing claim lock. This record is the blocker for any automatic application. Carries the held items of DEC-008 and DEC-012.

## Collaboration alignment

See the [cross-task assessment](../architecture/collaboration-work-alignment.md). Coordinate the automatic-assignment prerequisites with separate router work on delivery, concurrency, recovery and approval freshness. Completing this task alone does not establish router safety or authorize an unattended run or deployment.
