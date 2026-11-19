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

## 0.1.22 handover

Partial extension-host checks, automated checks, and the released scope are recorded above and in [0.1.22](https://github.com/ebrAIn-Lab-3B/Weaver/releases/tag/v0.1.22). The subsequent diagram-bearing fixture was edited, saved, reopened, and inspected in the VS Code text editor, as recorded below. The creation/linking flow was tested separately. Do not mark verified on partial passes alone.

## Diagram-bearing requirement round trip (2026-11-19)

In a separate temporary workspace, Computer Use exercised the 0.1.22 development extension with a schema-valid `REQ-991` containing front matter, a story ID, two acceptance criteria, a `TASK-991` reference and local task link, an ideation link, a Mermaid flowchart, and a Markdown table with bold text. The requirement view showed its metadata, criteria and task. The editor displayed the Mermaid diagram; an existing outcome paragraph was edited and saved. Returning to the requirement view, the task details link opened the task, its requirement action returned to the requirement, and the ideation link opened the ideation document. The VS Code text editor showed the edited body and metadata; the saved file retained both links, task and criteria, Mermaid source, table, and bold text. The requirement was reopened in Weaver.

The fixture intentionally has no GitHub Issue link for the task, so Weaver reported that expected warning. This was a targeted local-file test using a development host, not an installed-VSIX test or a complete test of pending changes, remote file providers, offline mode, or all input and conflict timings.

## Card review: remaining local evidence (2026-11-19)

The combined diagram-bearing fixture and the local two-window save-conflict behavior have been exercised in separate tests. Remaining evidence includes a complete local creation-to-reopen journey, the English UI, and the relevant pending-input and focus transitions. Retain the exact tested boundaries rather than requiring exhaustive timing or provider coverage. Remote providers, offline-to-online synchronization, and alternate VS Code settings are not blockers solely because they are untested; record a reproducible defect if one arises.

## Additional local checks (2026-11-19)

Computer Use checked the English requirement view and editor, filtered `/head` to Heading, selected it with Enter, and saved the resulting heading. A requirement paragraph edit was saved, undone and redone in VS Code source, and seen again after closing source and reopening the rendered editor. Front matter, links, Mermaid and the formatted table remained in source. TASK-125 records a false conflict discovered during this pass, its fix, the successful targeted retest, and a separate local disk save conflict viewed in VS Code Compare. These targeted checks do not replace the integrated creation-to-reopen journey or the remaining pending-input and timing evidence.

The deterministic model-level application-boundary test subsequently passed in VS Code 1.147.0 for five representative edit types; its exact scope and limitations are recorded in TASK-125. The integrated user journey and pending-input checks remain open.

The VS Code debug configurations now temporarily disable installed extensions in the development host, avoiding duplicate Weaver registration with the development copy. A follow-up Computer Use pass reached a workspace-trust prompt when opening a temporary fixture from the trusted sample workspace and did not proceed past it. No new extension-host input result was obtained in that pass. The separate jsdom slash-menu checks in TASK-123 are automated simulations.

After the prompt was handled, a later development-host pass edited two existing paragraphs in sequence and saved them, exercised Escape and literal slash input, and reproduced then retested a false conflict when inserting an earlier checklist after a later saved paragraph. The corrected sequence and its limits are recorded in TASK-125. These observations do not establish deliberately rapid focus changes, Korean composition, or the integrated creation journey.

After the queued slash-input fix in TASK-123, Computer Use also saved an unmatched slash string as literal Markdown in VS Code 1.147.0. The delayed-acknowledgement and IME cases for that fix were automated simulations; the integrated journey remains unverified.


## Integrated local journey and split follow-up (2026-11-19)

Computer Use completed the local create, edit, link, Mermaid display, save, close, reopen, link navigation, and VS Code source inspection journey described in TASK-121, using VS Code 1.147.0 on Windows in a separate Restricted Mode workspace. Network connectivity was not disabled. The current build also passed one actual existing-paragraph end split followed by immediate typing and save; transaction identity and stale/replayed acknowledgements have automated coverage as described in TASK-123. Delayed extension-host responses, real Korean IME after the latest changes, and the remaining transition/undo matrix are not established by these checks. The card remains open.


## Debug console and development-host interruption (2026-11-19)

The VS Code Debug Console showed repeated Node `[DEP0169]` warnings about the legacy `url.parse()` API. No direct call was found in Weaver's extension or Markdown source. The same warning appeared in logs from the separate VS Code 1.147.0 application-boundary test, including a main/AgentHost process, but that does not identify every emitter or establish the call stack. An attempt to use `NODE_OPTIONS=--trace-deprecation` was rejected by packaged Electron, so the source of the console warnings remains unconfirmed; they have not been suppressed. The application-boundary test still passed all five cases.

After rebuilding for a new insertion-field multiline paste check, reloading the development host ended its window. Subsequent Computer Use input failed with `foreground window did not report a process id`, including after selecting the main VS Code window again. Consequently the latest paste change has automated coverage but no new actual extension-host result.

A later isolated-profile VS Code 1.147.0 development-host session succeeded; the new nested checklist and insertion-field paste save/reopen results are recorded in TASK-124. The remaining IME and pending-operation timing cases are not implied by that pass.


## Follow-up focus and undo check (2026-11-19)

In the isolated VS Code 1.147.0 development host, Computer Use edited two existing paragraphs sequentially while switching focus, invoked undo and redo, and saved after restoring both additions; the saved source contained both. The screen observations were taken between actions and did not deliberately delay acknowledgements, so they do not establish rapid input under delay or pending-operation undo grouping. A request to send the `Hangul` key returned `unsupported key`; no new real-IME composition was claimed. The earlier real-IME observation remains recorded above.


## Post-merge local smoke check (2026-11-20)

After PR #337 was merged, Computer Use opened a separate local fixture in a Windows VS Code 1.147.0 development host with an isolated profile and Restricted Mode workspace. An existing paragraph was edited, focus was moved to a checklist and the checkbox was checked, then the document was saved, closed and reopened. The rendered document and saved Markdown contained both the paragraph edit and checked marker. On the merged commit, `npm.cmd run check`, the full `npm.cmd test` (616 Markdown, 122 GitHub, 248 CLI tests), and `npm.cmd run test:document-race` passed. The latter remains limited to the five VS Code model edit shapes described in TASK-125. GitHub CI for the merged commit also passed.

The latest changes were not retested with a real Korean IME or a screen reader; the earlier real-IME example and the simulated composition and accessibility-tree checks are recorded above. This check does not treat remote providers or offline-to-online synchronization as blockers.
