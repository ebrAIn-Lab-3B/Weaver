---
id: TASK-126
type: task
title: Edit requirement documents from their Weaver view
requirement: REQ-022
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/329
status: draft
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-002, AC-004, AC-014]
---

# TASK-126 Edit requirement documents from their Weaver view

## Context

Requirement files currently open the Weaver requirement view, while the trial rendered editor is available for ordinary Markdown and task documents. The authoring flow must work for requirements without losing their existing navigation and evidence view.

## Done when

- A person can reach rendered editing from a requirement and return to its Weaver requirement view and source with clear, localized controls.
- Editing supported body content does not rewrite or discard requirement front matter, stable IDs, metadata, acceptance criteria, task links, Mermaid, or unsupported Markdown.
- Unsaved changes, mode changes, and external modifications follow the safeguards of TASK-125. Requirement/task/evidence navigation and ordinary Markdown editing remain functional.

Verify a schema-valid requirement with links, criteria, a task and a Mermaid block in the VS Code extension host, including save, reopening, and navigation. Record tests and a Computer Use result before completion.
