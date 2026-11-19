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

## Prioritized verification plan

After TASK-125 establishes a safe application mechanism and TASK-123/124 complete the intended Enter paths, exercise the integrated build in a separate VS Code development workspace using Computer Use. Include newly inserted and existing blocks, immediate and consecutive Enter, simple lists and checklists, source fallback, real Korean IME where available, save and reopen, undo/redo, view and focus changes, and a genuine external change. Test the check/apply race with a deterministic automated harness as well; a UI-only external-change observation does not prove that boundary is safe. Record exact outcomes and any unavailable environment capability, keeping incomplete cases open. Re-run the build and required checks after changes; do not mark a card or requirement verified on partial evidence.


## Further extension-host checks (2026-11-19)

Computer Use in a temporary workspace verified a newly created bullet item followed by Enter and a second item, save and reopen; empty paragraph Enter followed by input; and save followed by continued typing at the same caret after a focus-loss fix. A separate disk change while a paragraph was focused showed a conflict notice with copy/open controls. Physical key input through the Korean IME produced `한글`, Enter, and `가`; saving and reopening retained both paragraphs. This is one real IME path, not exhaustive composition or concurrency coverage. A newly created checklist initially produced a false conflict when the first item was checked after save. After a stale-location fix, Computer Use repeated creation, Enter, checking, save, close and reopen; the checked state was retained. A newly inserted heading followed by Enter and paragraph text was also exercised. Undo removed that paragraph and redo restored it, as confirmed in source; pending-operation undo grouping remains unverified.

A later Computer Use check verified a local dirty-document save conflict: VS Code offered Compare/Overwrite, the editor kept the local text, and the external file retained its marker. In another test, undo and redo restored the changed paragraph and returned focus to that paragraph after a focus fix. These are targeted examples and do not prove all timing, provider, or configuration cases.


## Cross-window and delayed-response checks

Using a separate VS Code profile and the same local temporary file, Computer Use left `FIRST WINDOW` unsaved in Weaver, saved `SECOND WINDOW` from another VS Code process, and then attempted to save the first window. VS Code refused the first save with Compare/Overwrite, while its local text remained visible and the second window text was present in the disk file. This confirms the tested local configuration, not every provider or conflict setting.

A nested bullet and Mermaid fixture was rendered and the nested item was clicked and Enter pressed; the source was unchanged and the Source button opened the preserved nested Markdown and Mermaid. Initially the nested item did not explain on click that source editing was required. After adding guidance, Computer Use clicked the nested item, observed the Korean explanation and Source button, and opened the unchanged Markdown through that button. Automated webview tests additionally exercise delayed acknowledgements with queued save and undo, IME composition before save, and failed edits cancelling save without discarding the draft; these are simulations rather than extension-host timing guarantees.


## Subsequent integrated extension-host checks

In a separate test workspace, Computer Use exercised Enter in the middle of an existing heading, at the beginning of a newly inserted heading, and on an empty bullet to leave the list. It pasted three plain lines into an existing paragraph, continued typing, and saved. It also edited a simple nested child, used Enter to create a sibling, saved, and reopened the document. Blank visual spacing is not retained on reopen; multiline paste containing blank lines or formatting, multiline paste in a new insertion field, nested checklists, formatted nested items, and items with children remain source-mode cases.

A further human-only pass used the extension to create an ideation file and a requirement, link the requirement to the ideation file, edit the requirement, and follow the link. A requirement fixture combining a diagram with the rest of the authoring journey was not verified in that pass. These observations are partial evidence; the tasks and requirement remain unverified.
