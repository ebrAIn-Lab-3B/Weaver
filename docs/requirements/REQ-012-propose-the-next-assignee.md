---
id: REQ-012
type: requirement
title: Weaver proposes who takes a card next
status: draft
owner: ebrAIn.lab
story_ids: [US-045]
repository: ebrAIn-Lab-3B/Weaver
github_project: ebrAIn.lab Kanban
---

# Weaver proposes who takes a card next

## Problem

When a card changes state, someone must decide who takes it next. In an agent team that decision is spread over several bots and a person, and it is not visible where it is made. Automating it without a single decider per state risks loops and duplicate work.

## Outcome

Each state has one declared decider. Weaver shows who holds a card and who should take it next, proposes the change for confirmation, and surfaces the cards that need a person. Automatic assignment waits until its prerequisites are settled.

## Acceptance criteria

- For each state, exactly one decider (a person, an agent, or a rule) is declared, and Weaver shows it on the card.
- Weaver shows, without writing, who holds a card and who should take it next, from the roster roles and the card fields.
- Weaver proposes the next assignee and label, and applies it only after the person confirms ([DEC-008](../decisions/DEC-008-agent-identity-and-write-confirmation.md), [DEC-012](../decisions/DEC-012-steward-first-version.md)).
- Cards that need a person (for example `gated` or a human decision) are surfaced for that person.
- Automatic application is out of scope until bot identity, a hop limit, and coordination with the existing claim lock are settled.

## Tasks

- `TASK-071` Show the decider and propose the next assignee — [GitHub Issue #169](https://github.com/ebrAIn-Lab-3B/Weaver/issues/169)
- `TASK-072` Settle the prerequisites for automatic assignment — [GitHub Issue #170](https://github.com/ebrAIn-Lab-3B/Weaver/issues/170)

Origin: proposal [#162](https://github.com/ebrAIn-Lab-3B/Weaver/issues/162). The shape is decided in the first task of each requirement before any code follows it.

A repository may configure the states it is ready to use in its default-branch `.weaver/process.yaml`:

```yaml
assignment:
  Review:
    decider: Neo
    next-role: reviewer
    task-field: reviewer
```

`task-field` can be `assignee` or `reviewer` and identifies which existing task-file participant must match the proposed contributor before applying an Issue action. If omitted, the proposal remains read-only. This keeps the implementation owner and reviewer distinct. State names are Weaver columns; `decider` and `next-role` are organization-supplied strings. An absent state is explicitly unconfigured, not inferred. Partial configuration is allowed for incremental adoption; this does not satisfy AC-001 for the remaining states. The roster must identify exactly one matching contributor before a proposal is shown. Multiple candidates or agent label reaches are reported, not chosen. A configured state decider is not necessarily the performer of each concurrent action. Configuration and proposals do not authorize a write or dispatch. The confirmed Issue action is implemented; surfacing explicit human actions remains open.

The [collaboration work assessment](../architecture/collaboration-work-alignment.md) identifies an open question about the scope of the per-state decider when a card has several human or agent actions, and separates a proposal from observed execution. It does not amend the criteria above or authorize automatic application.

## Evidence policy

This requirement is not complete when a task is merely reported as done. Completion requires repository changes, checks, and an explicit review of remaining gaps.


A state rule may additionally require a Project field to match one of its configured values. For example, `when: {project-field: Type, in: [feature, bug]}` can restrict a Ready proposal to the organization's chosen work types. Weaver reads that configured field even if it is not selected for display. A missing or unreadable field yields an unknown condition; a different value yields a non-matching condition. Neither produces an assignee proposal or authorizes an action. Project field names and values are organization configuration, never Weaver defaults.


The Overview can review a single proposed Issue-assignee change or configured agent label for a saved task whose direct Issue link or unambiguous requirement-file link has been freshly checked and whose configured task participant already matches the candidate. It rereads the sources and asks for an Issue-specific human execution check and separate action confirmation. A local action log records the attempt before the write and its outcome; an unclear result must be checked before retrying. The screen does not change task-file participants, infer that a manual check proves exclusive execution, or bypass a configured approval gate. Live VS Code verification covered cancellation and confirmed human assignment in [sandbox #79](https://github.com/blcktgr73/poc-sandbox/issues/79), and a confirmed agent-label action, router delivery and acknowledgement in [sandbox #82](https://github.com/blcktgr73/poc-sandbox/issues/82). These checks do not establish atomic exclusion or automatic execution detection. Changing task-file participants through this proposal and surfacing explicit human actions remain open. TASK-072 remains open for automatic-assignment prerequisites; TASK-071’s Issue is closed, which does not by itself satisfy the remaining requirement criteria.
