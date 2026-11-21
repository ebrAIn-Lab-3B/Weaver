---
id: TASK-129
type: task
title: Show task-file participants on the Kanban card
requirement: REQ-002
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/362
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
assignee: codex
criteria: [AC-001, AC-004]
---

# TASK-129 Show task-file participants on the Kanban card

## Context

The requirement view can record a human or agent owner and a separate reviewer, but the Overview card shows only GitHub Issue assignees. Show the values from an available, linked local task file alongside the Issue assignees, with distinct source labels and a link to the file. Do not interpret a recorded reviewer as an actual review request, or a named owner as proof of delivery or start. This is one read-only slice of the proposed [collaboration evidence requirement](https://github.com/ebrAIn-Lab-3B/Weaver/pull/361), not its implementation.

## Done when

- A linked local task file's owner, recorded human or agent kind, and reviewer appear on the card when present, with a link to their source. An unknown kind remains unknown.
- Issue assignees remain visible as a separate source, including when they differ. Empty or unavailable task data does not produce an inferred participant.
- English and Korean labels are supplied. Rendering and escaping are tested; the results and any extension-host gap are recorded.
- Policy semantics are checked against [PALab REQ-011](https://github.com/blcktgr73/palab-platform/blob/main/docs/requirements/REQ-011-collaboration-evidence.md). No PALab-specific role, label or board is a Weaver default.

## Follow-up boundaries

The producer contract, current wait and next action, decision and start evidence, PR review freshness, pagination and permission handling, router delivery and concurrency, and end-to-end verification remain open. TASK-016 remains the separate human-owned handoff decision. Agent-base adoption is a later goal after policy alignment and validation; it is not part of this change.

The [cross-task assessment](../architecture/collaboration-work-alignment.md) records the relationship to TASK-016, TASK-071 and TASK-072 and the decisions that remain open.

## Evidence and remaining checks

The implementation displays participants only when the local task file can be joined through a requirement and Issue. It keeps GitHub Issue assignees separate, and makes no inference about requests or execution. This is consistent with PALab REQ-011's distinction between assignment, signal, delivery and start; it does not implement PALab policy or establish agreement on an interchange contract.

The card also shows the observed Project Status independently of the mapped Kanban column, when the Project read returned a value. A missing value is not inferred. Status does not establish the current human action.

The next read-only slice accepts `collaboration.project-fields` in the repository's default-branch process file and shows selected text or single-select Project values with their read time. Empty and unsupported values are not distinguished from unavailable values; failed reads and invalid configuration are reported separately. It does not parse human requests or decisions, and no organization field names are built in. A live host and policy-profile integration check remains necessary before claiming the full flow.

On 2026-11-21 a read-only call to `readProject` against PALab Ops Kanban returned the selected Project fields for HealthBridge Issues #2 and #3: each had Owner `Neo` and Human required `Decision`. This verified the GitHub reader against those two values. `npm run check`, `npm test`, and `npm run test:overview-participants` passed for the implementation, including invalid configuration, missing values, read failure and HTML escaping.

On 2026-11-22 the user supplied a screenshot of the installed experimental VSIX showing HealthBridge Issue #2 with Project status `Backlog`, the Project field read time, and `Owner: Neo`. [HealthBridge PR #6](https://github.com/blcktgr73/HealthBridge/pull/6) had merged the field selection. This is evidence of the configuration-to-card path for that visible field. The screenshot cuts off the next field, so it does not verify `Human required` in the UI or card #3. It also shows the existing missing-status-label warning; the HealthBridge process currently uses label-based columns. The warning is not proof that the Project status was missing. Offline and snapshot presentation, source-link interaction, asynchronous refresh races, cached configuration freshness, partial access and the end-to-end producer flow remain unverified.

`npm run check`, `npm test`, and `npm run test:overview-participants` passed. The rendering test checks both languages, separate Issue assignees, unknown kinds and escaping. A regression test checks a task whose Issue is recorded only in the requirement list. The local-file participants are also projected onto offline cards and last-read snapshots, whose existing warnings describe their age or offline status. These checks exercise generated HTML and the join, not a VS Code extension host or a live GitHub Project. The offline and snapshot presentation and source-link interaction still need an extension-host check; the broader collaboration flow is not verified.
