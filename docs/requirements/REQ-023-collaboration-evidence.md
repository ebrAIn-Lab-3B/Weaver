---
id: REQ-023
type: requirement
title: Find the next collaboration action from a card
status: draft
owner: ebrAIn.lab
repository: ebrAIn-Lab-3B/Weaver
github_project: ebrAIn.lab Kanban
---

# Find the next collaboration action from a card

## Problem and outcome

The Issue, task file, Project and PR already carry the collaboration record. A person should be able to see who is responsible and whether an action is waiting, then open the relevant source. Weaver does not create a second handoff record or infer that a named owner has started work. Keep the card concise; add more detail only when a real workflow shows that the existing links are insufficient.

[TASK-129](../tasks/TASK-129.md) already shows task-file participants and selected Project fields. [REQ-019](REQ-019-a-pull-request-is-one-click-from-its-card.md) covers PR links. This draft concerns any remaining gap in finding an explicitly recorded action, its responsible party and its source. It does not redefine the organization's policy; [PALab REQ-011](https://github.com/blcktgr73/palab-platform/blob/main/docs/requirements/REQ-011-collaboration-evidence.md) is one profile, not a Weaver default.

## Acceptance criteria

- Show the observed owner and configured Project fields with their sources and read time, retaining the distinctions between the task file, Issue and Project. When a value cannot be read or is stale, say so rather than guessing. Keep the current participant and field presentation from TASK-129.
- When a current action or wait is explicitly recorded in a configured source, make the action, responsible party and source link discoverable from the card. Show unknown or conflicting information as such; do not infer a request, start, completion or approval from an assignee, label or open PR alone.
- Make an explicitly recorded human review or merge request discoverable with a link to the PR and changed files or its Files changed view. Keep review, checks, merge and approval distinct; a missing check is not a pass. If a PR changed after a review, indicate that the review's applicability needs checking when the relevant revisions are available.
- Keep the view read-only and policy-neutral. Support English and Korean. Verify the configured field and action presentation, source links, missing or inaccessible data and stale or conflicting values with synthetic fixtures and a VS Code extension-host check. Record which real workflow stages were actually observed.

## Boundaries and next steps

1. Compare the existing Issue and card records with real development-agent and review-agent workflows. First establish how an explicit current action is recorded and linked; do not impose a new parallel handoff document or treat arbitrary free text as authoritative without a producer contract.
2. Use the present card and its Issue/PR links as the baseline. Implement a small action or wait entry only where an observed gap justifies it. A full chronological evidence trail is a possible later enhancement, not a prerequisite for this slice.
3. [TASK-016](../tasks/TASK-016.md), [TASK-071](../tasks/TASK-071.md) and [TASK-072](../tasks/TASK-072.md) remain under their current requirements until their scopes and acceptance criteria are deliberately revised. The [collaboration assessment](../architecture/collaboration-work-alignment.md) records proposed boundaries.
4. Existing PALab router controls and their tests remain in place. PALab [PR #147](https://github.com/blcktgr73/palab-platform/pull/147) clarified `approved` as a shared resume signal with separate risk approval, without changing router behavior. Assess remaining operational limits against actual needs. This requirement does not change dispatch, approval, merge or deployment behavior. Agent-base adoption follows completion and validation of the Weaver/PALab work.

## Evidence policy

This requirement is draft. TASK-129 and the HealthBridge observations are evidence for the fields already delivered, not proof of the proposed current-action feature. Do not mark the remaining scope complete without its own implementation and verification.
