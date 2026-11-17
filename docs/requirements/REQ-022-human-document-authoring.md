---
id: REQ-022
type: requirement
title: People can author ideation and requirement documents without an agent
status: draft
owner: ebrAIn.lab
story_ids: [US-064, US-065]
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
- The author can see where a new file will be saved and review its initial content before creation. Existing files are not silently overwritten; unsaved changes are not silently discarded.
- The created documents can be reopened and edited as ordinary Markdown outside Weaver, and saved changes appear in Weaver. Creating or editing them does not require GitHub, a board, or an agent.
- The product documents how a person starts an ideation document, creates a requirement, links the two, and switches between rendered and source editing.

## Open decisions

- A proposed first slice is recorded for human review in [DEC-027](../decisions/DEC-027-markdown-viewing-and-authoring.md).
- The initial block and slash-command set, and the editing behavior for constructs that have no block editor.
- How requirement IDs and destination paths are proposed and how collisions are reported across a workspace.
- Whether ideation documents have optional templates; no organization-specific structure is assumed.

## Tasks

- `TASK-118` Create ideation and requirement Markdown files — [GitHub Issue #317](https://github.com/ebrAIn-Lab-3B/Weaver/issues/317)
- `TASK-119` Edit Markdown blocks without losing source content — [GitHub Issue #318](https://github.com/ebrAIn-Lab-3B/Weaver/issues/318)
- `TASK-120` Link a requirement to its originating ideation document — [GitHub Issue #319](https://github.com/ebrAIn-Lab-3B/Weaver/issues/319)
- `TASK-121` Document and verify the human-only authoring journey — [GitHub Issue #320](https://github.com/ebrAIn-Lab-3B/Weaver/issues/320)

These tasks are assigned to agents; named owners remain to be assigned. The shared decisions are tracked in [TASK-115](../tasks/TASK-115.md), and rendered reading and diagram display in [REQ-021](./REQ-021-render-ordinary-markdown.md). Story authoring is covered by [REQ-016](./REQ-016-user-stories-on-the-board.md).

## Evidence policy

Completion requires repository changes, checks of the human-only authoring and round-trip flows, and review of remaining gaps.
