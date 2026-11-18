---
id: TASK-125
type: task
title: Protect document changes and concurrent edits
requirement: REQ-022
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/328
status: draft
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-004, AC-006, AC-013, AC-014]
---

# TASK-125 Protect document changes and concurrent edits

## Context

The trial produced false document-change warnings when editing existing content. Block edits must preserve both in-flight user input and the rest of the original Markdown while respecting the VS Code document lifecycle.

## Done when

- A user can edit, switch blocks and modes, undo, redo, save, and close through VS Code without silent loss; pending input is committed or protected before a transition.
- Korean IME composition and rapid input and focus changes do not trigger false conflict warnings, duplicate or lose text, or move input to another block.
- Real concurrent source or external edits are detected without silently overwriting either version; the person can recover uncommitted input and understands the next step.
- Targeted edits preserve untouched front matter, whitespace and line endings, diagrams, and unsupported Markdown. Round-trip tests cover representative constructs and both successful and conflicting changes.

Verify actual VS Code save/undo/redo and external changes, and Korean input in the extension host. Record automated tests and Computer Use evidence before completion; identify any remaining manual IME limitation honestly.


## Current release scope (2026-11-19)

Automatic draft recovery after closing, restart, or crash is deferred by the maintainer. The experimental recovery journal, settings, and UI are removed from this release; existing stored records are not deleted. This task remains in progress for in-session pending input, normal save and mode transitions, conflict detection, and visible copy/open-draft actions.

An extension-host check caused an external change while a test block was focused and observed the conflict and copy/open-draft controls. Further checks must cover fast input, multiple blocks, save, undo/redo, Korean IME, and genuine concurrent edits. Do not mark verified until the remaining criteria have evidence.
