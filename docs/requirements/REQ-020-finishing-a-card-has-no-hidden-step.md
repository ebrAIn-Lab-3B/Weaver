---
id: REQ-020
type: requirement
title: Finishing a card has no hidden step
status: draft
owner: ebrAIn.lab
story_ids: [US-056, US-060, US-061]
repository: ebrAIn-Lab-3B/Weaver
github_project: ebrAIn.lab Kanban
---

# Finishing a card has no hidden step

## Problem

When a pull request closes the Issue of a card, the card keeps a gap: "closed without status:verified". The only ways to mark it Verified are the requirement view and a terminal command. A card opens the requirement view only when the files of its requirement and task are in the folder that is open, and nothing on the card says whether they are. In practice the folder is often behind GitHub, because a pull request that adds the files was merged and the folder was not updated. The card then opens its Issue, the person cannot mark it Verified, and nothing says why.

## Outcome

A card that is done can be marked Verified from the card, with the plan and the confirmation that every write has. A card whose task has no file in the folder says so, and says what to do.

## Acceptance criteria

- A card whose Issue is closed and that carries the gap "closed without status:verified" shows a button on the card to mark it Verified. The card does not need a requirement for it.
- The button shows the same plan and the same confirmation as moving a task to Verified in the requirement view (what changes, and the evidence gaps), and changes nothing until the person confirms ([DEC-008](../decisions/DEC-008-agent-identity-and-write-confirmation.md)).
- A card that still has an open pull request does not offer the button, because its work is not over ([REQ-019](./REQ-019-a-pull-request-is-one-click-from-its-card.md)).
- A card whose title names a task (`[TASK-number]`) but whose task file is not in the folder says so under its title, and says that the folder may need updating.
- A card that is a plain Issue, with no task in its title, says nothing more than it does now.
- For such a card, Weaver asks GitHub whether the task file exists on the default branch, and the line says which of the two it is: the file is on GitHub and the folder is behind, or there is no file at all.
- When the file is on GitHub, the line offers to update the folder. Weaver brings the folder up to date only by a fast-forward, only when its working tree has no change and its branch has no commit of its own, and only after it has shown how far behind the folder is and the person has confirmed. When a condition does not hold, it says which and does nothing.
- When there is no file, the line offers to make it. Weaver drafts the task file from the Issue and opens a pull request that adds it and adds its line to the requirement, after showing the whole file and the line and being confirmed. The requirement is the one the Issue names, or one the person picks. A repository with no requirement file is told why it cannot.
- When Weaver notices that a pull request that closes an Issue was merged ([REQ-018](./REQ-018-finish-work-without-leaving-weaver.md)), its notice offers the same action for that card.
- A card shows its labels other than `status:*` (at most three) and marks the pull request that closes it; an open card that names no task, whose pull requests only refer to it, says that no pull request closes it yet. Added on 2026-11-11 from friction ([TASK-114](../tasks/TASK-114.md), US-061).
- An open card of work before a requirement (its title names no task) can be finished from the card: **Mark verified** shows that the Issue will be closed and which evidence is missing, and writes after a yes. A card that names a task is still finished by the pull request that closes it. Added on 2026-11-11 from friction ([TASK-113](../tasks/TASK-113.md), US-060).

## Open decisions

Accepted in [DEC-023](../decisions/DEC-023-mark-a-card-verified-and-say-why-it-has-no-task-file.md): the button, and the line on a card without a task file. Proposed in [DEC-024](../decisions/DEC-024-a-card-without-a-task-file-gets-one.md): asking GitHub whether the file exists, updating the folder, and making the file. Still open: the offer in the notice after a merge (the last criterion), and the offer inside the plan of a move.

## Tasks

- `TASK-101` Decide how a card is marked Verified and says why it has no task file — [GitHub Issue #277](https://github.com/ebrAIn-Lab-3B/Weaver/issues/277)
- `TASK-102` Say on a card why it has no task file — [GitHub Issue #279](https://github.com/ebrAIn-Lab-3B/Weaver/issues/279)
- `TASK-103` Mark a finished card Verified from the card — [GitHub Issue #281](https://github.com/ebrAIn-Lab-3B/Weaver/issues/281)
- `TASK-105` Decide how a card without a task file gets one — [GitHub Issue #287](https://github.com/ebrAIn-Lab-3B/Weaver/issues/287)
- `TASK-106` A card without a task file says where it is and offers to bring or make it — [GitHub Issue #289](https://github.com/ebrAIn-Lab-3B/Weaver/issues/289)
- `TASK-107` Update the folder only on the default branch, and do not make a second task file pull request — [GitHub Issue #293](https://github.com/ebrAIn-Lab-3B/Weaver/issues/293)
- `TASK-113` Finish an open card that names no task from the card — [GitHub Issue #309](https://github.com/ebrAIn-Lab-3B/Weaver/issues/309)
- `TASK-114` A card shows its labels and which pull request closes it — [GitHub Issue #311](https://github.com/ebrAIn-Lab-3B/Weaver/issues/311)

Origin: the maintainer, 2026-11-08, while trying the pull request follow of REQ-018 and the cards of REQ-019: a card opened its Issue instead of the requirement, and the card could not be marked Verified, which the maintainer had to ask for. Absorbs the label step that was done by hand for every closed task that day.

## Evidence policy

This requirement is not complete when a task is merely reported as done. Completion requires repository changes, checks, and an explicit review of remaining gaps.
