---
id: TASK-119
type: task
title: Edit Markdown blocks without losing source content
requirement: REQ-022
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/318
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-001, AC-002, AC-004, AC-005, AC-006]
---

# TASK-119 Edit Markdown blocks without losing source content

After TASK-115 and TASK-116, implement the agreed rendered block editing and source mode for ideation and requirement files. Preserve diagram source and unsupported constructs when saving; protect unsaved changes when switching or closing. Integrate with ordinary filesystem changes.

Verify editing and reopening common blocks, switching modes, unsaved changes, external edits, and round trips containing diagrams and unsupported Markdown. A named agent owner remains to be assigned.

Progress: the rendered editor can edit single-line headings and paragraphs through VS Code's text document and opens source for other blocks. Full block and slash-command editing and extension-host round-trip verification remain open.
