---
id: TASK-123
type: task
title: Make direct writing and slash menus flow naturally
requirement: REQ-022
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/326
status: review
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-010, AC-011]
---

# TASK-123 Make direct writing and slash menus flow naturally

## Current card status (2026-11-20)

Direct editing and the slash choices are implemented. English and Korean menu selection, Escape, literal slash and a real Korean IME example have been checked in the VS Code development host. The supported paragraph split and concurrent-change checks are documented below; beginning, middle and end paragraph splits were also exercised in the host. The delayed split undo false conflict was fixed and targeted keyboard checks passed. Ctrl+W waits for pending edits ([PR #348](https://github.com/ebrAIn-Lab-3B/Weaver/pull/348)). An early-input change now passes the prior artificially delayed split-acknowledgement tab X reproduction; see TASK-125 for the precise test and remaining limitations. The card remains open.

## Current outcome and dependency (2026-11-20)

- Implemented and checked: direct editing, paragraph splitting at the start/middle/end, slash-menu selection and cancellation, literal slash input, and representative Korean IME input. The delayed-acknowledgement undo false conflict was fixed and rechecked in [PR #344](https://github.com/ebrAIn-Lab-3B/Weaver/pull/344).
- Remaining dependency: TASK-125 owns provisional input and save-and-close safety. Its unmerged change passed the targeted delayed-acknowledgement reproduction, but the affected writing, conflict and undo/redo flows still require integrated verification before closing this card. Do not count untested remote providers or offline-to-online synchronization as defects.

## Additional keyboard menu recheck (2026-11-20)

In the existing local Restricted Mode Windows VS Code development host, Computer Use opened a new temporary Markdown file, filtered the English menu with `/head` and `/check`, and selected Heading and Checklist with Enter. Each item was saved with Ctrl+S, closed with Ctrl+W, and reopened; the rendered content remained visible and the saved Markdown contained `## Keyboard heading` and `- [ ] Keyboard checklist`. This repeats ordinary keyboard interaction without an artificially delayed acknowledgement; it does not resolve the TASK-125 tab X save-and-close defect. The focused `markdownWebview.test.ts` and `splitTransaction.test.ts` suites passed 48 tests.

## Context

The first trial exposed repeated insertion controls and unnecessary gaps, and Enter did not reliably behave like editing at the caret. The maintainer chose a Notion-like writing experience in [DEC-028](../decisions/DEC-028-notion-like-markdown-editing.md).

## Done when

- A person clicks a supported paragraph or heading and edits it in place; the document does not display repeated insertion controls or oversized gaps.
- Enter at the beginning, middle, and end of a paragraph creates the expected blocks without dropping or moving text, places the caret appropriately, and allows continued typing.
- Typing `/` in an empty block opens a searchable menu near the caret. Heading, bullet list, checklist, and code choices support keyboard and mouse; Escape closes the menu and literal `/` remains possible.
- The interaction works in English and Korean, with accessible focus and labels. Existing files and navigation remain intact.

Verify ordinary writing, editing, splitting, slash filtering and selection, cancellation, and literal slashes in the VS Code extension host. Record tests and a Computer Use result before completion.

## Split transaction design

The integration splits supported paragraphs, headings, and simple list items while buffering immediate typing and queuing consecutive Enter actions. In the VS Code development host, Computer Use exercised Enter within an existing heading, at the start of a newly inserted heading, and after an empty bullet. Empty paragraph fields allow continued typing, although visual blank space is not retained on reopen. The full protocol and extension-host verification below remain incomplete. A version check and submission are synchronous and observed VS Code versions carry a version with open-document edits; this internal behavior is not a public atomicity guarantee, particularly for changes not yet loaded from disk.

1. Bind the operation to a unique transaction ID, document identity, projection generation, document version, exact source line range, source text, block kind, and the UTF-16 selection captured after composition ends. Resolve the range from the current validated projection, not by searching for matching text. Reject invalid ranges and surrogate-pair boundaries.
2. Serialize pending edits before the split. The host must verify the current document identity, revision, range and original text immediately before applying the split. A comparison against text alone is insufficient when multiple lines have the same contents. A version comparison followed by an unversioned edit is not inherently atomic: the integration must establish and verify a version-bound application strategy, including handling changes between checking and applying.
3. While waiting for the matching acknowledgement, retain a provisional right-hand block and buffer its entire text, selection and IME composition state. Do not rerender it away. Acknowledgement must match the transaction, document, projection, resulting text and expected version; unrelated acknowledgements are ignored. On acknowledgement, replay the buffered draft only against the acknowledged exact revision and right-hand range, after composition ends. Subsequent input and edit acknowledgements must remain serialized.
4. A failed operation or external change must never silently discard the draft or apply it to a different block. Preserve the draft and selection in a recoverable form and provide an explicit conflict/recovery path. Protect ordinary in-session transitions and preserve visible drafts on conflicts. Automatic recovery after close, restart, or crash is deferred from this release.
5. Save, undo and redo must act as barriers to the transaction queue. Define and verify actual VS Code undo grouping and selection restoration, including undo during a pending operation; inverse-string tests in the pure model do not verify VS Code undo behavior.

The scenarios below identify useful regression coverage for split ordering: beginning/middle/end splits, selection replacement, immediate typing, consecutive Enter, IME boundaries, duplicate adjacent lines, stale projection, external edits, rejected or delayed acknowledgements, mode switching, save and undo/redo. The acceptance baseline is the Done when section and REQ-022; record which scenarios were actually checked and distinguish simulations from the VS Code extension host. Do not infer a defect solely from an untested scenario.

## Priority and interaction decision

After concurrent-change protection in TASK-125, complete ordinary Enter behavior for existing paragraphs, headings, and simple top-level lists as well as empty and nonempty insertion fields. A supported flow should not require an Apply action. Preserve input and focus through immediate typing and consecutive Enter; unsupported or unproven cases use a clear source-mode route instead of risking a source rewrite. Extension-host checks must distinguish ordinary input from actual Korean IME composition and exercise delayed acknowledgements.

## 0.1.22 handover

The supported direct-writing and slash-menu slice shipped in [0.1.22](https://github.com/ebrAIn-Lab-3B/Weaver/releases/tag/v0.1.22) via [PR #331](https://github.com/ebrAIn-Lab-3B/Weaver/pull/331). Remaining: verify complete caret/selection, delayed-acknowledgement, undo/redo, and input-boundary behavior against the criteria above.

## English menu check (2026-11-19)

In the VS Code 1.146.0 development host, with `weaver.language` set to `en` in a temporary workspace, Computer Use entered `/head`, observed the filtered Heading option, selected it with Enter, typed a heading, and saved it as `##` Markdown. The English requirement view, editor buttons, and insertion prompt were also visible. This checks one keyboard selection, not all choices, mouse selection, Escape, or literal slash behavior. A false conflict found when returning to a preceding paragraph was fixed and retested as recorded in TASK-125.

Additional jsdom webview tests exercise heading filtering and keyboard selection, arrow-key checklist selection, mouse selection of code, and Escape followed by a literal slash. They simulate edit acknowledgements and are not an extension-host interaction test. `npm.cmd test` passed with 593 Markdown, 122 GitHub, and 248 CLI tests; `npm.cmd run check` passed. A VS Code 1.147.0 development-host pass was prepared with installed extensions disabled to avoid duplicate Weaver registration, but opening the separate temporary fixture displayed a workspace-trust prompt and the pass stopped there. The remaining real interaction and focus checks are not verified by these tests.

After the trust prompt was handled, Computer Use in the VS Code 1.147.0 development host opened the slash menu, used Escape, continued with `/literal path`, and saved it unchanged. It also chose Checklist with the mouse and saved a new item after the false-conflict fix described in TASK-125. This does not cover every menu choice or delayed acknowledgement.

## Queued slash input (2026-11-19)

A delayed-acknowledgement webview test exposed that a newly focused queued insertion field did not show the slash menu and did not handle Enter before the preceding edit completed. The client now displays and handles the menu for that queued field and retains its chosen kind and subsequent text until the field is activated. Queued IME composition state is carried across activation. Another fix submits unmatched slash strings as literal text instead of leaving them uncommitted. Tests exercise queued selection and typing through the webview and host message handler, Escape with a literal slash, and simulated composition.

After rebuilding, Computer Use in the VS Code 1.147.0 development host typed `/not-a-command` in a new field and saved; the literal string appeared in the local Markdown file. The deliberately delayed response and composition cases were simulated, not verified with real IME or an artificially delayed extension host. The task remains open for its remaining integrated interaction criteria.


## Split acknowledgement identity (2026-11-19)

Split requests now carry a document identity, projection generation, and unique transaction ID; the host rejects stale projections and repeated IDs. The webview accepts only a matching acknowledgement with the expected version and resulting split text, and keeps its draft on mismatches. Split failure messages are associated with the originating transaction. Automated regression tests cover unrelated acknowledgements, incorrect resulting text, stale projections, and replay. In the VS Code 1.147.0 development host on Windows, Computer Use split an existing paragraph at its end, immediately typed in the new paragraph, and saved both paragraphs. `npm.cmd run check` and the full `npm.cmd test` passed after the changes. This is one actual split case, not completion of the selection, undo-barrier, delayed host response, or real-IME matrix above.


## Slash menu access and interaction (2026-11-20)

The open slash menu now exposes its input as a combobox with an associated listbox and active option; closing the menu restores the text field and removes those associations. Automated webview tests cover keyboard and mouse selection of each of Heading, Bullet list, Checklist and Code block, arrow navigation, filtering with the Korean message catalog, Escape, literal slashes, and selection-state accessibility attributes. Delayed queued input remains covered by the host-handler simulation described above.

In a separate Restricted Mode workspace using the Windows VS Code 1.147.0 development host, Computer Use observed the English combobox and all four options in the Windows accessibility tree, selected Bullet list with the arrow key and Enter, and selected Code block with the mouse after filtering `/code`; both were saved, closed, reopened, and retained as Markdown. With `weaver.language=ko`, the menu displayed the Korean choices, `/체크` filtered to Checklist, and the saved source contained the Korean item. Korean text was injected as literal text, not through an IME. The accessibility tree was inspected, but no screen reader announcement was tested. `npm.cmd run check` and the full `npm.cmd test` passed (616 Markdown, 122 GitHub, 248 CLI tests). TASK-123 remains open for the separate split, delayed-host, undo-barrier and real-IME criteria above.

In the same Korean-interface session, reopening retained the checklist; Escape dismissed a newly opened menu, and continuing to type `/literal` saved that exact text in the Markdown file.


## Current main Korean IME check (2026-11-20)

With the maintainer enabling the Korean IME, Computer Use exercised the current main implementation in a separate local Restricted Mode workspace in the Windows VS Code 1.147.0 development host. Physical key events composed `한글` in an existing paragraph, then focus moved to another paragraph immediately after composition. The second paragraph received `가`; save, close and reopen preserved both additions. In a new insertion field, physical IME composition of `/체크` filtered the Korean slash menu to Checklist. Enter selected it, physical key events composed `가` in the new checklist item, and saving, closing and reopening preserved both paragraphs and `- [ ] 가` in the Markdown file. No conflict or dropped text appeared in these observed cases. This is a targeted real-IME pass; delayed acknowledgements were not artificially introduced.

## Paragraph boundary check (2026-11-20)

In a separate local Restricted Mode workspace on Windows, Computer Use used the VS Code 1.147.0 development host on current main to press Enter at the start, middle and end of an existing paragraph, then type into the new end block. Saving and reopening retained `Alpha mi`, `ddle omega.`, `Boundary continuation` and the untouched following paragraph. The empty visual block at the start did not persist on reopen, consistent with the documented Markdown behavior. The test did not deliberately delay host acknowledgements or exercise pending-operation undo.

## Delayed split acknowledgement and undo (2026-11-20)

A separate Restricted Mode VS Code 1.147.0 development host on Windows used a temporary copy of the current extension with only the `split-applied` host-to-webview message delayed by 15 seconds. Computer Use split a paragraph, typed `Undo buffer` in the provisional block, and invoked Ctrl+Z while the acknowledgement was pending. With no external edit, the editor displayed the document-changed warning twice; `Undo buffer` remained visible with copy/open-draft controls. This is a reproduced false-conflict defect under an artificially delayed response, not a claim of loss or a test of an unmodified host. That observation preceded the fix and recheck recorded in the next section.

## Delayed undo fix and recheck (2026-11-20)

VS Code delivered Ctrl+Z to both the embedded webview and the workbench, allowing the document history to run while a split was still awaiting acknowledgement. The scoped editor shortcut now routes undo and redo through the webview's pending-edit queue; the webview prevents the same key event from enqueueing history twice. Shortcut handling is limited to the Weaver custom editors and excludes focused lists and other input fields.

In the Windows VS Code 1.147.0 development host, Computer Use used a separate temporary copy of the fixed extension with its split acknowledgement deliberately delayed by 60 seconds. After splitting an existing paragraph and typing `Final draft`, Ctrl+Z left the draft visible while waiting, with no conflict. The instrumented host trace recorded one undo after the split and draft were applied. Ctrl+Y restored the draft; save, close and reopen preserved it and the untouched paragraph. The timing delay and trace existed only in the temporary copy. A second development host using the uninstrumented fixed extension verified ordinary paragraph editing, Ctrl+Z and Ctrl+Y. Tests cover the queued request and duplicate-key prevention; `npm.cmd test` passed (620 Markdown, 122 GitHub, 248 CLI) and `npm.cmd run test:document-race` passed the five representative local model cases. These checks cover Windows keyboard shortcuts; menu-driven undo and other operating systems were not separately tested.

## Delayed save and close (2026-11-20)

With the fixed extension copied to a Windows VS Code 1.147.0 development host and a split acknowledgement artificially delayed by 120 seconds, Computer Use typed `Waiting A` into the provisional paragraph, switched to an existing paragraph, typed `Waiting B`, and pressed Ctrl+S. VS Code retained the dirty indicator during the delay; after the acknowledgement, both additions appeared in the saved local file. This is a targeted queued-focus and keyboard-save observation with an instrumented extension, not a claim about every transition.

A separate instrumented host with a 30-second acknowledgement delay exposed an unresolved data-loss case: after Enter and typing `Close pending draft`, Ctrl+W showed the VS Code unsaved-changes dialog. Choosing Save closed the editor, but the saved local file contained the split and did not contain the draft. The Ctrl+S routing fix does not intercept this VS Code save-and-close path. Keep the task open until the close path protects pending input and passes an actual-host regression.
