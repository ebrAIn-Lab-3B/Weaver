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

## 0.1.22 handover

Requirement view to rendered editor and back shipped in [0.1.22](https://github.com/ebrAIn-Lab-3B/Weaver/releases/tag/v0.1.22) via [PR #331](https://github.com/ebrAIn-Lab-3B/Weaver/pull/331). A development-host pass edited a generated requirement and followed its ideation link. Remaining: verify a schema-valid requirement combining metadata, task links, criteria, Mermaid, and unsupported Markdown through edit, save, reopen, and navigation.

## Diagram-bearing requirement round trip (2026-11-19)

In a separate temporary workspace, Computer Use exercised the 0.1.22 development extension with a schema-valid `REQ-991` containing front matter, a story ID, two acceptance criteria, a `TASK-991` reference and local task link, an ideation link, a Mermaid flowchart, and a Markdown table with bold text. The requirement view showed its metadata, criteria and task. The editor displayed the Mermaid diagram; an existing outcome paragraph was edited and saved. Returning to the requirement view, the task details link opened the task, its requirement action returned to the requirement, and the ideation link opened the ideation document. The VS Code text editor showed the edited body and metadata; the saved file retained both links, task and criteria, Mermaid source, table, and bold text. The requirement was reopened in Weaver.

The fixture intentionally has no GitHub Issue link for the task, so Weaver reported that expected warning. This was a targeted local-file test using a development host, not an installed-VSIX test or a complete test of pending changes, remote file providers, offline mode, or all input and conflict timings.
