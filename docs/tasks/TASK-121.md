---
id: TASK-121
type: task
status: verified
title: Document and verify the human-only authoring journey
requirement: REQ-022
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/320
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007]
---

# TASK-121 Document and verify the human-only authoring journey

After TASK-117 through TASK-120, document and exercise the complete journey: create ideation and requirement files, edit and link them, read a diagram, switch modes, and reopen the files outside Weaver. Record checks and manual verification evidence against both requirements, including offline operation and any remaining gaps.

The documentation must identify the actual product entry points and avoid assuming an organization-specific process. A named agent owner remains to be assigned.

Manual verification reported by the maintainer on 2026-11-18: a task file renders and opens its linked requirement; an ideation document opens from its link in the requirement view; and document content is retained after editing, saving, and reopening. The report does not identify the exact constructs or cover every step of the journey and offline operation.

## Current card status (2026-11-20)

The local creation, linking, diagram, editing and reopening journey was exercised in the VS Code development host as recorded below. On 2026-11-20 the maintainer confirmed the TASK-121 offline check and instructed that it be treated as verified. The maintainer did not supply the detailed steps or environment for that check; the disconnected pass was not independently observed by the agent. Offline-to-online synchronization and remote providers are outside the baseline. See TASK-127 for the separate editor checks.

## 0.1.22 handover

The documented create, link, edit, and link-navigation flow was exercised in a temporary VS Code development workspace. A later diagram-bearing requirement fixture was edited, saved, reopened, and inspected in the VS Code text editor; creation and linking were tested separately. TASK-127 records the detailed evidence. The complete local journey and the specified local offline operation still need an integrated check. Remote-provider synchronization is outside this check.

The documented entry points and individual local operations exist; an integrated creation-through-reopening run with the diagram and the specified offline operation remain unverified. TASK-125's application-boundary safety work is also still open.


## Integrated local journey (2026-11-19)

On Windows in the VS Code 1.147.0 development host, Computer Use used a separate local temporary workspace in Restricted Mode to create an ideation document, edit and save it, create a requirement, and link the ideation file from the requirement. In the VS Code text editor it added a Mermaid flowchart; Weaver displayed the diagram. An existing outcome paragraph was edited in Weaver, saved, closed, and reopened with the new text and diagram intact. The link opened the ideation document, and the VS Code text editor showed the edited content, front matter, relative link, and Mermaid source. This combines creation through reopening in one local run. The network was not disconnected, so actual offline operation remains unverified. The remaining editor timing and conflict evidence is tracked by TASK-123 through TASK-127.

## Maintainer offline confirmation (2026-11-20)

The maintainer confirmed TASK-121 as personally checked and directed that the task proceed on that basis in response to the outstanding disconnected local-workspace verification. This is maintainer-reported evidence, separate from the connected development-host journey above; specific offline steps and environment were not provided.
