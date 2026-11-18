---
id: TASK-127
type: task
title: Verify the human-only authoring journey in VS Code
requirement: REQ-022
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/330
status: draft
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-015]
---

# TASK-127 Verify the human-only authoring journey in VS Code

## Context

TASK-121 covers the human-only journey across the two authoring requirements. This task adds an explicit extension-host verification pass for the Notion-like editing work in TASK-123 through TASK-126; it does not replace the broader requirement or declare it complete.

## Done when

- In a separate test workspace, exercise the actual VS Code extension with Computer Use: create and link ideation and requirement files, write and reopen supported blocks, use slash commands, switch views, save, and reopen outside Weaver.
- Check preservation of front matter, links, Mermaid, unsupported Markdown and line endings, and exercise undo/redo, close/reopen, rapid focus changes, and an external change while editing. Record the exact outcomes and any limitations.
- Check Korean and English UI and exercise Korean input where the environment supports real IME; distinguish real IME use from simulated composition or pasted text.
- Update the user guide for actual entry points and limitations. Record automated checks, the extension-host pass, open bugs, and remaining human decisions; no task or requirement is marked verified without the evidence its policy requires.

This task depends on the implemented slices of TASK-123 through TASK-126. A release decision follows the evidence and the project's release workflow.


## Partial extension-host evidence (2026-11-19)

In a separate temporary workspace, Computer Use exercised the development extension. A paragraph was split at the caret and the following text edited and saved. A checked list item's text was edited while the checked marker remained visible. Undo restored the preceding list text. A requirement view opened the document editor; its outcome paragraph was changed and saved, and the requirement view was reopened. These observations do not establish the complete task. The requirement editor exposed front matter as rendered content, which requires correction and retesting. The checklist control itself was disabled, and real Korean IME, genuine concurrent changes, the full creation/linking journey, redo, and close/reopen remain unverified.

A second extension-host pass after rebuilding confirmed that closed requirement front matter is no longer shown as body content, while the body remains visible. A JavaScript code fence was edited with a second line and saved; the resulting file retained the fence, language, checklist and Mermaid source. The displayed Mermaid diagram remained intact. This was a targeted check, not yet a close-and-reopen or external-conflict test.

A third extension-host pass found that a collapsed insertion field intercepted clicks on the following checklist item. After limiting its hit area, clicking the checkbox visibly checked it and saving wrote `[x]` in the temporary Markdown file; the code fence and Mermaid source remained intact. This does not establish nested checklist behavior or the full verification journey.

A subsequent extension-host test exposed lost input typed immediately after Enter in a list item. As a temporary mitigation, Enter-based splitting is disabled in ordinary rendered text and insertion slots; a retest confirmed the source-mode notice appears and immediately following input remains visible and saves in the current item. This mitigation does not meet the intended Enter editing criterion. Code-fence Enter and slash-menu selection remain available.


A later development-host pass exercised a paragraph split in the middle followed immediately by typing, a checked checklist item followed by a new unchecked item, and a bullet item followed by a new item. Saving, closing, and reopening preserved those edits and the Mermaid source in the temporary file. This pass preceded the latest additions for consecutive Enter, heading-end Enter, and nonempty insertion fields; those additions need a further host pass. Windows was locked during the attempted follow-up. Real Korean IME and the concurrent-change race remain unverified.


After unlocking the Windows session and reloading the rebuilt development host, a further Computer Use pass verified Enter at the end of an existing heading followed by text, a nonempty insertion field split in the middle followed immediately by text, and two consecutive Enter key presses followed by text. Saving, closing, and reopening the temporary document preserved the visible text and Mermaid diagram. This does not establish behavior under deliberately delayed acknowledgements, real Korean IME, or concurrent external edits.
