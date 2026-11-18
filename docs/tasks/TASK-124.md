---
id: TASK-124
type: task
title: Edit structured Markdown blocks in the rendered document
requirement: REQ-022
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/327
status: draft
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-010, AC-012]
---

# TASK-124 Edit structured Markdown blocks in the rendered document

## Context

The trial can insert structured blocks but cannot reliably edit them again. A person should be able to continue working in the document after insertion or reopening it.

## Done when

- Reopened supported headings, paragraphs, bullet lists, checklist items, and fenced code blocks can be edited in place, including more than one line or list item.
- Typing, Enter, deletion, and checkbox changes behave predictably for supported blocks and survive save and reopen as Markdown. A block's surrounding content remains unchanged.
- Constructs that cannot be safely edited, including unsupported nested or inline syntax, remain preserved and have an accessible way to open the relevant source.
- Supported behavior is documented without claiming complete Notion compatibility or assuming an organization's document structure.

Verify insertion followed by editing, existing documents, multiple items and code lines, source fallback, and save/reopen in the VS Code extension host. Record tests and a Computer Use result before completion.


## Current limitations (2026-11-19)

Simple list-item text and top-level checklist toggles are supported, and ordinary closed top-level fenced code can be edited. A Computer Use test found that input typed immediately after Enter could be lost during a refresh. Enter for rendered paragraphs, headings, list items, and insertion slots is temporarily blocked with an instruction to open source; code-fence Enter and slash-menu selection remain available. Safe line splitting requires an acknowledged transition that preserves subsequent input and a repeat of extension-host verification. Nested lists, rich inline formatting, and unsupported fences still require source mode. The full task remains in progress.
