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

Progress: the rendered editor supports direct editing of simple single-line headings and paragraphs, and a slash menu on empty block boundaries. Other constructs use source mode. Full block editing and broader round-trip verification remain open.

Manual verification on 2026-11-18: the maintainer confirmed that document content was preserved after editing, saving, and reopening. This does not by itself establish coverage of every unsupported construct or the remaining full block editor scope.

## Revised direction and first slice

Follow [DEC-028](../decisions/DEC-028-notion-like-markdown-editing.md): write directly on the document and show a caret-positioned slash menu, without repeated Add block buttons. Implement safe direct editing for supported text and retain source fallback for other constructs. Existing content, including front matter, diagrams, and unsupported Markdown, is not rewritten. Protect against changes made concurrently. Requirement documents retain their existing requirement view; TASK-126 tracks the route to the authoring surface and back.

Verify insertion at more than one position, all commands, cancellation, source preservation, save and reopen, and a concurrent source change. These criteria define a trial slice, not completion of the full task.

Development-host check on 2026-11-18: an existing plain paragraph was edited in place, Enter opened an empty line, and `/` opened a menu from which a heading was inserted and saved. The saved Markdown retained the existing Mermaid source. This is a partial check; other commands, IME, undo, external changes, and the complete document round trip remain to be verified.

Maintainer feedback on 2026-11-18: editing selected existing content produced a spurious document-change warning. The editor now keeps edits queued across a rapid focus change and recognizes its own delayed document-change events; a development-host check replaced existing text with Korean and saved it without the warning. Automated tests simulate Korean composition and delayed acknowledgements. Real Korean IME input and genuine concurrent file changes still need extension-host verification.

## 0.1.22 handover

The supported rendered editor and source fallback shipped in [0.1.22](https://github.com/ebrAIn-Lab-3B/Weaver/releases/tag/v0.1.22) via [PR #331](https://github.com/ebrAIn-Lab-3B/Weaver/pull/331). Follow-up work is tracked by TASK-123 through TASK-127. Remaining: complete the broader document-preservation and mode-switch criteria; see the child tasks for specific limits and verification.
