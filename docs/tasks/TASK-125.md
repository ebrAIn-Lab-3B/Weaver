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

## First priority: safe application

Investigate the VS Code document editing API and establish whether edits can be applied against the intended revision without a check-then-apply race. Verify with an injected change at that boundary, not only a change detected before the check. Apply the protection consistently to all rendered-edit paths, including split, text changes, insertions, fences, and checklist toggles. If atomic or equivalently safe application cannot be established for a path, block that path and offer source editing until it can be made safe. A post-application warning alone cannot establish that neither version was overwritten.

For a detected conflict, retain the active in-session input visibly and offer copy or open in a separate document. Do not automatically merge or overwrite either version. Ordinary editing has no extra Apply action, and automatic recovery after close, restart, or crash remains deferred. Record any API limitations and actual test evidence before marking this task complete.


## Investigation and implementation evidence (2026-11-19)

All rendered edit paths submit through a common synchronous version check and handle both rejected and throwing edit calls by reporting failure. Automated host/webview tests exercise refused changes and visible draft preservation. Microsoft VS Code source for 1.90.0 and the installed 1.146.0 shows version information attached for open documents and checked before application, but this is an implementation detail rather than a public atomic-edit guarantee. It does not establish atomic protection from another window or disk changes not yet loaded into the model. A Computer Use test observed a disk change while a rendered paragraph was focused: the warning and copy/open controls appeared and the visible paragraph remained. That observation does not inject a race at the application boundary.

A further local-file development-host test left a Weaver edit unsaved, changed the same file externally, and invoked save. VS Code refused the save and offered Compare/Overwrite while the local text remained visible and the external marker remained on disk. This observation uses the tested VS Code configuration; `files.saveConflictResolution` can change that behavior and other file providers may differ.

A separate two-process VS Code test left a Weaver edit dirty while a second VS Code window saved a different version of the same local file. The first window refused its subsequent save and offered Compare/Overwrite; its unsaved text remained visible and the other version was on disk. This result is specific to the tested local provider and VS Code conflict settings.

## 0.1.22 handover

In-session conflict reporting, draft copy/open, version checks, and local two-window save-conflict observations shipped or were recorded with [0.1.22](https://github.com/ebrAIn-Lab-3B/Weaver/releases/tag/v0.1.22). Remaining: clarify and verify the supported file-provider and VS Code configuration boundary and pending-input transitions; automatic recovery after close, restart, or crash remains deferred.
