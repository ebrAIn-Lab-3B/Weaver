---
id: TASK-118
type: task
title: Create ideation and requirement Markdown files
requirement: REQ-022
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/317
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-001, AC-002, AC-005, AC-006]
---

# TASK-118 Create ideation and requirement Markdown files

After TASK-115, implement a human-driven creation flow with repository and destination selection, preview before creation, and no silent overwrite. Create an ideation document without a mandatory organization-specific format and a requirement that satisfies the current artifact schema, including a workspace-unique ID. Handle ID and path collisions according to the decision.

Verify both creation paths, required metadata, collision and cancellation behavior, and offline operation without an agent, board, or GitHub. A named agent owner remains to be assigned.

Progress: the command-palette creation flow is implemented on branch `feat/req-021-022-markdown-authoring`. It proposes an ID, reviews the initial file, and uses exclusive file creation. The shared decisions, concurrent ID allocation, automated integration coverage, and VS Code host verification remain open; this task is not yet verified.

## 0.1.22 handover

Creation commands shipped in [0.1.21](https://github.com/ebrAIn-Lab-3B/Weaver/releases/tag/v0.1.21); a later development-host pass created an ideation and requirement file, reviewed proposed content, and linked them. Remaining: resolve concurrent ID allocation and verify collision, cancellation, and offline behavior against the full criteria.
