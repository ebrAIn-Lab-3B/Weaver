---
id: REQ-021
type: requirement
title: Read ordinary Markdown and diagrams in Weaver
status: draft
owner: ebrAIn.lab
story_ids: [US-062, US-063]
repository: ebrAIn-Lab-3B/Weaver
github_project: ebrAIn.lab Kanban
---

# Read ordinary Markdown and diagrams in Weaver

## Problem

The proposed SlashMD-style canvas focuses on requirements. People also need to read ordinary Markdown documents, including ideation and project documents, with their formatting and diagrams visible. A diagram shown only as source code interrupts reading.

## Outcome

A person opening an ordinary Markdown file sees a SlashMD-like rendered view first, can read its diagrams, and can return to its source. Requirement and task files retain their existing behavior. The repository file remains authoritative.

## Acceptance criteria

- Opening an ordinary workspace Markdown file shows a Weaver rendered view by default without adding Weaver metadata or changing the file.
- Headings, paragraphs, lists, checklists, links, images, tables, and fenced code blocks are readable in the rendered view. Relative links and images resolve relative to the document.
- A valid Mermaid fenced block is displayed as a diagram rather than only as code. Its source remains accessible in source mode, and other code blocks remain code.
- An invalid or unsupported diagram leaves its source accessible and shows a useful explanation; the rest of the document remains readable.
- A person can reach the source editor from the rendered view and see saved source changes in the view. Opening or viewing a file does not rewrite it.
- A person can choose the text editor again for ordinary Markdown. Requirement and task documents retain their existing opening and navigation behavior under [REQ-003](./REQ-003-open-views-from-documents.md).

## Open decisions

- A proposed first slice is recorded for human review in [DEC-027](../decisions/DEC-027-markdown-viewing-and-authoring.md).
- Which diagram formats beyond Mermaid, if any, are supported initially, and how their dependencies are supplied.
- The precise entry point and presentation of the rendered view, including how it relates to the future editable canvas.

## Tasks

- `TASK-115` Decide the Markdown viewing and human authoring approach — [GitHub Issue #314](https://github.com/ebrAIn-Lab-3B/Weaver/issues/314)
- `TASK-116` Open ordinary Markdown in a rendered view — [GitHub Issue #315](https://github.com/ebrAIn-Lab-3B/Weaver/issues/315)
- `TASK-117` Render Mermaid diagrams and preserve failure fallback — [GitHub Issue #316](https://github.com/ebrAIn-Lab-3B/Weaver/issues/316)

TASK-115 is assigned to a human and the implementation tasks to agents; named owners remain to be assigned. The end-to-end verification in [TASK-121](../tasks/TASK-121.md) covers both requirements.

## Evidence policy

Completion requires repository changes, checks covering ordinary Markdown and diagram rendering, and review of remaining gaps.
