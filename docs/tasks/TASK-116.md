---
id: TASK-116
type: task
title: Open ordinary Markdown in a rendered view
requirement: REQ-021
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/315
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-001, AC-002, AC-005, AC-006]
---

# TASK-116 Open ordinary Markdown in a rendered view

Implement a default rendered view for ordinary workspace Markdown, with the required common Markdown elements, document-relative links and images, source access, and refresh after saved changes. Preserve requirement/task navigation and the ability to choose the text editor; viewing must not rewrite the file.

Verify with representative files, including relative assets, saved source changes, and existing Weaver document navigation. A named agent owner remains to be assigned.

Progress: ordinary Markdown now opens in a rendered custom editor with source access and refresh on document changes. On 2026-11-18 the maintainer confirmed Markdown rendering and the requirement view in the installed build, and requested rendered task files with a link to the requirement. Verification of other links and images remains open.

Defect found during the 0.1.21 trial: closing a requirement view while its workspace was loading could leave a disposed panel registered, causing later requirement views to fail. The loading lifecycle now discards results for closed panels and has a regression test; the fix still needs verification in VS Code.

Manual verification on 2026-11-18: the maintainer confirmed that a task file renders and its action opens the linked requirement. The other checks noted above remain to be accounted for separately.
