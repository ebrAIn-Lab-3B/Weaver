---
id: TASK-114
type: task
title: A card shows its labels and which pull request closes it
requirement: REQ-020
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/311
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
assignee: claude-code
---

# TASK-114 A card shows its labels and which pull request closes it

Tracked in [Issue #311](https://github.com/ebrAIn-Lab-3B/Weaver/issues/311). Ownership is recorded here; the Kanban column comes from the Issue.

- The card shows its labels other than `status:*`, at most three, so a guideline can mark a kind of card (for example exploration) with a label of its own ([DEC-026](../decisions/DEC-026-work-before-a-requirement-is-an-ordinary-card.md) item 5).
- `mergeCardPulls` marks the pull requests of GitHub's closing list as `closes`. The card says "closes it" on them, keeps them ahead of the ones that only refer, and an open card that names no task, whose pull requests only refer to it, says "no closing pull request yet" (a task card does not: it may be open on purpose) ([DEC-022](../decisions/DEC-022-a-card-carries-its-pull-requests.md) item 2, amended).
- The release guide gains the test build before tagging, and the rule that a tag that has made a release is not moved.
