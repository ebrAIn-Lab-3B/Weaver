---
id: TASK-120
type: task
title: Link a requirement to its originating ideation document
requirement: REQ-022
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/319
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-003, AC-006]
---

# TASK-120 Link a requirement to its originating ideation document

After TASK-118, provide a human-driven way to choose an existing ideation document and add a readable repository link to a requirement, then navigate it. Do not modify the ideation file. Work without an agent, GitHub, or board.

Verify the link resolves from the requirement, survives reopening as Markdown, and leaves the target unchanged. A named agent owner remains to be assigned.

Progress: the command-palette action inserts a relative link into the active requirement as an unsaved edit. VS Code host verification and navigation testing remain open; this task is not yet verified.

Manual feedback on 2026-11-18 confirmed link insertion but found the link invisible in the requirement view. The view now lists body links; opening the link in the VS Code host still needs manual verification.
