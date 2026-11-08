---
id: REQ-019
type: requirement
title: A pull request is one click from its card
status: draft
owner: ebrAIn.lab
story_ids: [US-055]
repository: ebrAIn-Lab-3B/Weaver
github_project: ebrAIn.lab Kanban
---

# A pull request is one click from its card

## Problem

To reach the pull request of a piece of work, a person has to right-click its card and choose an entry of a menu. Nothing on the card says that the menu is there, that a pull request exists, or that it is waiting to be reviewed and merged. People who try Weaver do not find the way, and the way they do find is slow.

## Outcome

A card shows the pull requests that refer to its Issue, each with its state, and pressing one opens its page in VS Code. The person reviews and merges there, and the card follows ([REQ-018](./REQ-018-finish-work-without-leaving-weaver.md)).

## Acceptance criteria

- A card shows, without a menu, each pull request that refers to its Issue (at most three): its number and its state (open, merged, or closed), with the open ones first.
- Pressing one opens its page the way [DEC-020](../decisions/DEC-020-github-pages-open-in-the-built-in-browser.md) says, and Weaver follows it until it is merged or closed.
- A card that no pull request refers to shows nothing more than it does now.
- Reading the pull requests adds no request of its own: they come with the cards, in the same read of the Project.
- The entries of the card menu stay, as a shortcut and not the only way.
- The requirement view lists the pull requests of each task without the person pressing a button to load them.
- A keyboard user can reach the pull request of a card.

## Open decisions

Proposed in [DEC-022](../decisions/DEC-022-a-card-carries-its-pull-requests.md): how many pull requests a card shows, and that they are read with the cards. Still open: whether the requirement view loads them by itself or on a press (it has its own read today), and whether `weaver list` gives an agent the same list (a change of the JSON contract).

## Tasks

- `TASK-097` Decide how a card carries the pull requests of its work — [GitHub Issue #269](https://github.com/ebrAIn-Lab-3B/Weaver/issues/269)
- `TASK-100` List the pull requests of a task in the requirement view — [GitHub Issue #274](https://github.com/ebrAIn-Lab-3B/Weaver/issues/274)

Origin: the maintainer, 2026-11-08, while trying [REQ-018](./REQ-018-finish-work-without-leaving-weaver.md): the right-click menu is hard to discover and awkward, a card should say it plainly, and going from a requirement to the pull request of its task and merging there should work too. The maintainer asked for it to be done now, for the dogfooding.

## Evidence policy

This requirement is not complete when a task is merely reported as done. Completion requires repository changes, checks, and an explicit review of remaining gaps.
