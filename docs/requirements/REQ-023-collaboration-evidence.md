---
id: REQ-023
type: requirement
title: See collaboration and human decisions with their evidence
status: draft
owner: ebrAIn.lab
repository: ebrAIn-Lab-3B/Weaver
github_project: ebrAIn.lab Kanban
---

# See collaboration and human decisions with their evidence

## Problem and outcome

A card can span a human decision, a signal, an agent's work, a handoff, review, merge and verification. Those facts can live in different Issues, Project fields, label events and pull requests. A user needs to understand the present wait and next action without mistaking a signal for work or a decision for approval. Weaver shows a read-only, evidence-linked account, including missing and conflicting information. Organization-specific rules belong in its process profile; the PALab proposal is [REQ-011](https://github.com/blcktgr73/palab-platform/blob/main/docs/requirements/REQ-011-collaboration-evidence.md).

## Relationship to existing work

[REQ-006](REQ-006-overview-kanban-across-repositories.md) covers the board and mismatches; [REQ-012](REQ-012-propose-the-next-assignee.md) covers holder and decider proposals and defers automation; [REQ-013](REQ-013-keep-discussions-with-requirements-and-tasks.md) covers curated discussion digests; [REQ-019](REQ-019-a-pull-request-is-one-click-from-its-card.md) links PRs. [TASK-016](../tasks/TASK-016.md) still has to decide the agent handoff contract. Reuse those capabilities rather than equating a proposed assignee, an Issue label, or a discussion with execution evidence.

## Acceptance criteria

- From a card, show the Project status and owner as observed, their source and freshness, and a separately sourced current wait, next action, and responsible party. Show conflicting Issue and Project values together; missing, inaccessible, stale and absent data must not become a confident state.
- Show a human decision request with who decides, what and why, choices, recommendation and rationale when recorded, and links to the actual records. Show the decision, its timestamp and source separately from the signal and actual agent start. Do not infer human identity from a shared account.
- Show a chronological evidence trail with source links and timestamps for request, delivery if evidenced, start, handoff, implementation and test report, review, merge, post-merge verification and card closure. Consumed labels remain discoverable through event history. A current label alone does not prove delivery, start, completion or approval.
- Follow explicit links to related tasks and PRs, including a task that is absent from the Project. Show PR state, checks and review evidence independently. A missing check is not a pass. Show when a linked task is outside the board.
- Make a human review or merge request discoverable on the Kanban card, with its reason, requested action, PR link, head revision, changed-file list or direct Files changed link, and available test and check results. Show the source and freshness of the request. Distinguish an agent's review from a human review and a merge request from approval. If the PR head changes after a review, show that the review's applicability needs checking. Never infer a human request from an open PR alone.
- Show completion only when the configured evidence policy is satisfied and merge, verification and closure have actually been observed where required; distinguish missing evidence from confirmed absence and failed reads. Do not turn a reported test into an independently verified CI result.
- Read policy-neutral field mappings, source definitions and required evidence from configuration. Unknown configurations must fail visibly and safely; no named organization, agent, label or board is a core default. Preserve existing profiles and support English and Korean through the message catalog.
- Tests cover missing access and pagination, stale and conflicting fields, consumed labels, delivery without start, decision without resume or approval, duplicate or concurrent signals, linked tasks off-board, missing checks, an open PR, and incomplete closure. An extension-host test checks the card presentation and source links. A synthetic end-to-end scenario compares the UI with the board, events, Issues and PRs at every stage; record untested stages explicitly.

## Delivery and boundaries

1. Specify a versioned source and evidence model, configuration and conflict rules, with representative synthetic fixtures. Coordinate with TASK-016, TASK-071 and TASK-072. Agree how a producer records a start, decision and review before parsing free text as authoritative.
2. Implement paginated, permission-aware readers and a policy-neutral projection. Then render the trail and human action in the card, with localization and links, including the human PR review entry. Keep this slice read-only; do not trigger dispatch or apply approvals.
3. A separate router work item must address idempotency, concurrent execution, approval freshness and recovery. Its deployment and any permissions or secret changes need the existing operational approval. This view does not claim those guarantees.
4. Verify with synthetic data and an approved environment. Actual health data and secrets must not enter fixtures, documents or logs.

## Evidence policy

This requirement remains draft until implementation, automated tests, extension-host evidence and the staged end-to-end comparison demonstrate the criteria. A requirements PR alone does not establish any feature or operational guarantee.
