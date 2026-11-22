---
id: TASK-071
type: task
title: Show the decider and propose the next assignee
requirement: REQ-012
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/169
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-001, AC-002, AC-003, AC-004]
assignee: claude-code
---

# TASK-071 Show the decider and propose the next assignee

Tracked in [Issue #169](https://github.com/ebrAIn-Lab-3B/Weaver/issues/169). Ownership is recorded here; the Kanban column comes from the Issue ([DEC-003](../decisions/DEC-003-board-status-mapping.md), [DEC-005](../decisions/DEC-005-task-files.md)).

Add the per-state decider declaration, show it with the holder and the proposed next assignee, and apply a proposal only after confirmation.

## Collaboration alignment

See the [cross-task assessment](../architecture/collaboration-work-alignment.md). Clarify the scope of a state decider when multiple human or agent actions coexist; keep a proposed assignee separate from observed ownership and execution. The proposed REQ-023 evidence view is read-only, while applying this task's proposal remains a separately confirmed write.

## Closure work

See the [evidence and remaining work](../architecture/collaboration-work-alignment.md#evidence-and-remaining-work-for-task-016-task-071-and-task-072) for the concrete steps and outstanding decisions. Existing acceptance criteria and ownership remain unchanged.

## Planning slice

The first implementation provides a read-only planner that receives an organization-supplied state rule and roster. It keeps the observed holder separate, reports missing and ambiguous candidates or multiple label reaches, and does not perform writes. It does not yet read process configuration, show a card, surface human actions or apply a proposal after confirmation. The task and REQ-012 criteria remain open until those paths and their verification are complete.

The process file can declare partial `assignment` rules and the Overview displays a read-only proposal when the roster is available. Invalid and unconfigured states and unavailable or ambiguous candidates are shown separately. Applying proposals after confirmation and full extension-host verification remain outstanding.
