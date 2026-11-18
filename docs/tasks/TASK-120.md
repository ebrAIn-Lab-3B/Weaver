---
id: TASK-120
type: task
title: Link a requirement to its originating ideation document
requirement: REQ-022
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/319
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-003, AC-006]
---

# TASK-120 Link a requirement to its originating ideation document

After TASK-118, provide a human-driven way to choose an existing ideation document and add a readable repository link to a requirement, then navigate it. Do not modify the ideation file. Work without an agent, GitHub, or board.

Verify the link resolves from the requirement, survives reopening as Markdown, and leaves the target unchanged. A named agent owner remains to be assigned.

Progress: the command-palette action inserts a relative link into the active requirement as an unsaved edit. It operates on local files and applies the edit only to the requirement; the ideation file is not changed. The usage is documented in the getting-started guide.

Manual feedback on 2026-11-18 confirmed link insertion but found the link invisible in the requirement view. The view was subsequently changed to list body links.

Manual verification on 2026-11-18: the maintainer confirmed that opening the ideation document link from the requirement view works.

Verification: the maintainer confirmed link insertion, navigation, and content retention after editing, saving, and reopening. PR #321 delivered the implementation and passed CI. The document-links tests pass and cover extraction and rendering of relative links. Code review confirms the link command edits only the requirement and does not call GitHub or an agent.
