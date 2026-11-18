---
id: TASK-122
type: task
title: Show unfinished card counts by stage for each repository
requirement: REQ-006
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/323
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
---

# TASK-122 Show unfinished card counts by stage for each repository

Tracked in [Issue #323](https://github.com/ebrAIn-Lab-3B/Weaver/issues/323). Ownership is recorded here; the Kanban column comes from the Issue.

## Context

The Overview repository chip and lane header show a total that includes finished cards. For a repository with a long history, that total obscures how much work remains and where it stands.

## Acceptance criteria

- Each repository's Overview summary distinguishes Backlog from the unfinished cards in Ready, In progress, Blocked, and Review. The labels make the counts' meaning clear in English and Korean.
- Finished cards (those in Verified or whose Issue is closed) do not contribute to these unfinished counts, including when finished cards are expanded or shown because they have a gap. The existing controls and mismatch reporting continue to work.
- Counts use the same derived column and repository association as the board, including configured process mappings; empty stages and repositories are handled without misleading counts.
- Counts update after refresh, filtering, card moves, and offline snapshot loading consistently with the cards represented by the Overview. Automated tests cover the classification and rendering, including closed cards with gaps and a non-default process mapping.

The precise compact presentation and whether active stages are shown separately or as a labelled group are to be chosen during implementation. Keep access to finished cards unchanged.

## Implementation

The repository selector and lane header display Backlog and Active counts; Active groups Ready through Review, including Blocked. A separate blocked badge remains on the lane. Counts use the board's derived columns and exclude closed or Verified cards even when a gap keeps them visible. Lanes being read show no premature count. The board's existing finished-card controls are unchanged.
