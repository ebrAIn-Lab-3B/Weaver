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


## Release-blocking review (2026-11-19)

A code review identified that a conflicting external change can leave uncommitted input only in the webview; closing or reloading can discard it. Likewise, input awaiting a host acknowledgement is not yet protected by VS Code's document dirty state when a tab closes or a menu or automatic save runs. Rapid focus movement following a structure-changing edit can leave queued source-line metadata stale, including when duplicate text makes an expected-text comparison pass. These cases require protection and end-to-end verification before this task or the authoring experience is considered release-ready.

A local-only recovery journal prototype and fault-injection tests exist, but it is not connected to the editor or recovery UI. A successful prototype write does not establish power-loss durability, Windows ACL guarantees, or crash-lock recovery. [DEC-029](../decisions/DEC-029-recovery-of-pending-editor-input.md) records the proposed design and remaining lifecycle, privacy, and verification work.
