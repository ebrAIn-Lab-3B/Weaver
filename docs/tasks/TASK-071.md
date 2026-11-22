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

A policy-neutral recheck primitive compares the shown proposal with fresh Issue, configured condition-field, process and roster observations, and rejects unavailable data or an active execution observation. It does not yet read those sources, display a confirmation, perform writes, or guarantee atomicity with other writers.

A confirmed-proposal workflow now models a fresh read before and after a single explicit confirmation, then performs at most one supplied write. It stops on unavailable or changed observations, unknown or active execution, missing reach, and cancellation. The workflow does not itself connect to GitHub or the Overview, write the action log, update a task file, or ensure atomicity against other writers; those pieces remain required before closing the task.

A GitHub adapter now reads the Issue, its Project item and configured condition fields, and the default-branch process afresh, rejecting inconsistent snapshots. The host must supply fresh roster and task versions plus an organization-specific execution observation; unknown execution fails closed. A one-action writer can apply a separately confirmed Issue assignee or label. The Overview confirmation, authoritative execution-source integration, task-file synchronization, action log and end-to-end verification remain open.

## Live read-only adapter check (2026-11-22)

A read-only check used the merged GitHub adapter, the HealthBridge default-branch process, PALab Ops Kanban, the local HealthBridge task files and the current computer's personal roster. Issue [#12](https://github.com/blcktgr73/HealthBridge/issues/12) was open in Ready with Project Type `planning`: the configured implementation condition did not match. Issue [#13](https://github.com/blcktgr73/HealthBridge/issues/13) was closed in Verified with no rule for that state.

For both calls the test deliberately supplied `unknown` as the execution observation; it did not inspect or establish the actual worker state. The confirmation and write callbacks were test doubles and were never called: #12 was rejected for unavailable execution evidence and #13 for being closed. No Issue, label or Project was modified. The test used the personal roster rather than demonstrating a fresh shared-roster integration; it did not exercise the VS Code host, a successful confirmation or a real write.

The remaining work is unchanged: supply an authoritative, organization-configured execution observation and fresh effective roster/task reads to the host, connect the confirmed action with its per-write approval and action log, keep task and Issue ownership consistent, and test the actual extension-host flow. A prior live read or label absence is not proof of exclusive execution.

The GitHub adapter can now request the shared roster named by the freshly read process file and combine it with freshly supplied local configuration. It rejects missing, unreadable or incomplete shared data instead of using the cached display copy, and versions the effective result. Connecting this reader to the extension host and obtaining an authoritative execution observation remain open.

A fresh task-holder reader now checks the task ID, repository and direct Issue link before using the recorded assignee, and fingerprints the exact file contents. It fails closed for unreadable, unlinked or conflicting files; the host must reject unsaved editor changes. A local read of HealthBridge TASK-004/#13 returned the recorded Morpheus owner. Tasks linked only through a requirement are not yet supported for confirmed application. This reader is not yet connected to the Overview or a write.

A fresh local-roster reader now re-reads the nearest root and personal configuration, rejects unreadable or invalid files, and fingerprints their content before applying the shared-roster overlay. A read-only check against this computer and the HealthBridge workspace found the configured Neo review and Morpheus implementation roles. The reader is not yet connected to the Overview confirmation or an actual write.
