---
id: REQ-022
type: requirement
title: People can author ideation and requirement documents without an agent
status: draft
owner: ebrAIn.lab
story_ids: [US-064, US-065, US-067]
repository: ebrAIn-Lab-3B/Weaver
github_project: ebrAIn.lab Kanban
---

# People can author ideation and requirement documents without an agent

## Problem

People can write Markdown by hand, but the product does not define an end-to-end way to start and develop ideation and requirement documents themselves in Weaver. Existing discussions and examples often involve an agent, which should be optional.

## Outcome

A person can create and edit an ideation document and a schema-valid requirement in a repository through Weaver, without an AI service or agent, and connect the requirement to its originating ideation document. The files remain readable and editable Markdown.

## Acceptance criteria

- A person can choose a workspace repository and destination, create an ideation Markdown file, enter and edit its content, and save it without an AI service or agent. Ideation does not require a requirement ID or a prescribed organization-specific process.
- A person can create and edit a requirement without an AI service or agent, supplying its title, intent, and acceptance criteria. The resulting file follows the current [artifact schema](../product/artifact-schema-v0.1.md), including a unique requirement ID and required metadata.
- The author can link a requirement to an existing ideation document using a readable repository link and navigate that link. Creating the link does not alter the ideation document without the person's action.
- The author can edit common document content through a rendered block experience and use source mode; saving preserves existing content, including diagram source and unsupported Markdown, without silent loss.
- In the rendered ordinary Markdown and task editor, an author can insert a heading, bullet list, checklist, or fenced code block at a block boundary using a keyboard-accessible slash menu, with cancellation and protection against edits based on a stale document. Requirement documents also provide a route from their view into the editor and back.
- The author can see where a new file will be saved and review its initial content before creation. Existing files are not silently overwritten. Unsaved changes in the VS Code document follow its save and close lifecycle; input still in transit from the rendered editor or in an unfinished IME composition at close has the accepted limitation in DEC-028.
- The created documents can be reopened and edited as ordinary Markdown outside Weaver, and saved changes appear in Weaver. Creating or editing them does not require GitHub, a board, or an agent.
- The product documents how a person starts an ideation document, creates a requirement, links the two, and switches between rendered and source editing.
- The requirement view lists navigable Markdown links from the requirement body, including the link to its originating ideation document.
- The rendered editor provides a Notion-like writing flow: a person clicks a supported block and types in place, uses Enter at the caret to split a paragraph or create the next block, and can continue writing without repeated insertion controls or disproportionate blank space.
- In an empty editable block, `/` opens a searchable menu at the caret with heading, bullet list, checklist, and fenced code block choices. Keyboard navigation and mouse selection work, Escape closes the menu, and a literal slash can still be entered as content.
- A person can reopen and directly edit supported headings, paragraphs, bullet lists, checklist items, and fenced code blocks, including multiple lines or items. Content the editor cannot safely edit remains intact and has an accessible source-mode route.
- Editing, undo and redo, save, close, and mode changes use VS Code's document lifecycle. Verify representative Korean IME and rapid block transitions; do not claim a universal guarantee for input still in transit or an unfinished IME composition at close, which may be lost as accepted in DEC-028. Detected concurrent source or external edits do not silently overwrite either version; while the editor remains open, conflicts retain visible drafts and offer copying or opening them in a separate document. Automatic draft recovery after a tab closes, restart, or crash is outside this release.
- Requirement documents retain the requirement view and navigation, and offer a clear route to the rendered editor and back. Editing their bodies preserves front matter, IDs, metadata, links, tasks, Mermaid, and unsupported Markdown.
- Before claiming the authoring journey verified, exercise creation, slash insertion, subsequent editing, mode switches, save and reopen, Markdown preservation, undo, Korean input, and a genuine concurrent change in a VS Code extension host using Computer Use. Record the actual results and remaining gaps in repository artifacts. UI messages are provided in English and Korean.

## Open decisions

- A proposed first slice is recorded for human review in [DEC-027](../decisions/DEC-027-markdown-viewing-and-authoring.md).
- The initial direction for direct editing and slash commands is recorded in [DEC-028](../decisions/DEC-028-notion-like-markdown-editing.md); multi-line and nested editing, and the behavior for constructs that have no block editor, need further work.
- How requirement IDs and destination paths are proposed and how collisions are reported across a workspace.
- Whether ideation documents have optional templates; no organization-specific structure is assumed.

## Tasks

- `TASK-118` Create ideation and requirement Markdown files — [GitHub Issue #317](https://github.com/ebrAIn-Lab-3B/Weaver/issues/317)
- `TASK-119` Edit Markdown blocks without losing source content — [GitHub Issue #318](https://github.com/ebrAIn-Lab-3B/Weaver/issues/318)
- `TASK-120` Link a requirement to its originating ideation document — [GitHub Issue #319](https://github.com/ebrAIn-Lab-3B/Weaver/issues/319)
- `TASK-121` Document and verify the human-only authoring journey — [GitHub Issue #320](https://github.com/ebrAIn-Lab-3B/Weaver/issues/320)
- `TASK-123` Make direct writing and slash menus flow naturally — [GitHub Issue #326](https://github.com/ebrAIn-Lab-3B/Weaver/issues/326)
- `TASK-124` Edit structured Markdown blocks in the rendered document — [GitHub Issue #327](https://github.com/ebrAIn-Lab-3B/Weaver/issues/327)
- `TASK-125` Protect document changes and concurrent edits — [GitHub Issue #328](https://github.com/ebrAIn-Lab-3B/Weaver/issues/328)
- `TASK-126` Edit requirement documents from their Weaver view — [GitHub Issue #329](https://github.com/ebrAIn-Lab-3B/Weaver/issues/329)
- `TASK-127` Verify the authoring journey in VS Code — [GitHub Issue #330](https://github.com/ebrAIn-Lab-3B/Weaver/issues/330)

These tasks are assigned to agents; named owners remain to be assigned. The shared decisions are tracked in [TASK-115](../tasks/TASK-115.md), and rendered reading and diagram display in [REQ-021](./REQ-021-render-ordinary-markdown.md). Story authoring is covered by [REQ-016](./REQ-016-user-stories-on-the-board.md).

## Evidence policy

Completion requires repository changes, checks of the human-only authoring and round-trip flows, and review of remaining gaps.

## Prioritized implementation decision

Follow [DEC-028](../decisions/DEC-028-notion-like-markdown-editing.md): establish safe concurrent-change handling first, complete the ordinary Enter flow next, then verify the integrated journey in an actual VS Code extension host. In normal use, authors click and type and use VS Code save, without a separate Apply action. On a detected conflict retain visible in-session input, offer copying or opening it separately, and do not automatically overwrite or merge either version. Where safe direct editing is not established, preserve the source and offer source editing. Input still in transit or unfinished IME composition at close is an accepted limitation; automatic recovery after close, restart, or crash remains deferred. The requirement and related tasks remain unverified until their acceptance criteria and evidence policy are satisfied.

## Local authoring and synchronization boundary (2026-11-19)

The acceptance baseline is local Markdown editing and saving with VS Code, including its conflict handling under the tested settings. Later Git synchronization and merge conflicts follow the normal Git workflow. Remote providers and offline-to-online synchronization are not independently verified and are not release blockers solely because they are untested. Record actual defects separately. The accepted pending-input limitation and the evidence for local save and conflict paths are recorded in [DEC-028](../decisions/DEC-028-notion-like-markdown-editing.md) and TASK-119.
