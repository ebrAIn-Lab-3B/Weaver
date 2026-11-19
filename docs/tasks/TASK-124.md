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


## Current support and limitations

Supported plain paragraphs, headings, top-level list items, and simple nested child items can be edited in place. Enter splits supported headings and items; a newly selected empty bullet can return to a paragraph. Ordinary closed top-level fenced code can be edited. Computer Use exercised a simple nested child edit and Enter, then saved and reopened it. Nested checklists, formatted nested items, and items with children still require source mode; selecting an unsupported nested item offers source guidance.

Pasting multiple nonempty plain lines into an existing supported paragraph is supported. Blank lines, formatted text, and multiline paste into a new insertion field still require source mode. Blank visual spacing created in an empty paragraph field does not survive reopening Markdown. Concurrent external changes not yet loaded into VS Code remain a limitation. The full task remains in progress.

## Scope and fallback decision

Prioritize predictable Enter and continued typing for newly created and reopened simple top-level bullet and checklist items. Allow safely supported simple nested children; retain unsupported nested structures unchanged and offer source mode. Do the same for other unsupported Markdown rather than silently converting it. Confirm behavior after save and reopen in the actual extension host.

An unsupported nested item offers source-editing guidance when selected; Computer Use verified the explanation and Source button with nested Markdown and Mermaid preserved.

## 0.1.22 handover

Supported paragraphs, headings, simple lists and nested child bullets, checklist toggles, code blocks, and bounded multiline plain-text paste shipped in [0.1.22](https://github.com/ebrAIn-Lab-3B/Weaver/releases/tag/v0.1.22) via [PR #331](https://github.com/ebrAIn-Lab-3B/Weaver/pull/331). Remaining: decide and implement broader nested checklist and formatted-block editing and multiline paste with blank lines or from a new insertion field; source mode remains available.
