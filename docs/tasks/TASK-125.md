---
id: TASK-125
type: task
title: Protect document changes and concurrent edits
requirement: REQ-022
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/328
status: in-progress
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-004, AC-006, AC-013, AC-014]
---

# TASK-125 Protect document changes and concurrent edits

## Current card status (2026-11-20)

Local in-session conflict reporting, draft recovery controls and VS Code save conflict handling are implemented. A local two-window conflict, representative model application races, mode transitions, undo/redo and a real Korean IME example were exercised as recorded below. The false conflict during pending split undo was fixed and Ctrl+S was routed through the pending queue, but a save-and-close action during a delayed split lost a pending draft, as recorded below. The card remains open. Automatic recovery after close, restart or crash is explicitly deferred.

## Current outcome and remaining implementation (2026-11-20)

- Implemented and checked: local save-conflict comparison, visible in-session draft recovery controls, representative VS Code model application races, real Korean IME input, and keyboard save/undo/redo queuing. [PR #344](https://github.com/ebrAIn-Lab-3B/Weaver/pull/344) contains the shortcut fix and its checks.
- Reproduced and not fixed: when a split acknowledgement is delayed, typing in the provisional paragraph and choosing Save in VS Code's close confirmation can close the view with that draft missing from disk. The observed reproduction used an artificially delayed local Windows development host.
- Required implementation: make every supported save-and-close path account for pending webview edits before VS Code can report a successful save or discard the view. Preserve VS Code's local save-conflict and undo behavior; handle a refused, failed, or stale edit without silently losing the draft. Do not equate the explicitly deferred restart/crash recovery feature with this in-session close case.
- Required verification: repeat the reproduced close-confirmation scenario with delayed acknowledgement in the VS Code extension host, including a failed/conflicting pending edit; confirm the saved file or a clearly available draft, then check ordinary save, close/reopen and undo/redo. Add a focused automated regression and record what was actually observed.

### Design investigation, not an implementation decision

The current editor is a VS Code `CustomTextEditorProvider`: VS Code owns the `TextDocument` and its save lifecycle, while a provisional split draft can remain only in the webview until an acknowledgement arrives. Keyboard command interception protects the shortcuts it handles but cannot be assumed to cover the close confirmation, Save All, or other VS Code save entry points.

First investigate keeping accepted in-session edits represented in, or safely synchronized with, the VS Code document model before a save can complete, with explicit handling of version conflicts and of a pending or failed acknowledgement. Prove the ordering against the actual close flow rather than assuming that a queued webview message arrives before disposal. The `onWillSaveTextDocument` hook alone is not a reliable unlimited barrier: VS Code documents a shared 1.5-second budget and says the event may be skipped in some save situations. If the existing text-editor model cannot provide the needed guarantee, evaluate a `CustomEditorProvider` with an extension-owned document and `saveCustomDocument` as a larger alternative; this would require explicit work to preserve text-editor interoperability, external-change handling, undo/redo, and lifecycle behavior. Neither approach is approved as an implementation decision solely by this investigation. Sources: [VS Code custom editors](https://code.visualstudio.com/api/extension-guides/custom-editors), [VS Code API reference](https://code.visualstudio.com/api/references/vscode-api).

## Context

The trial produced false document-change warnings when editing existing content. Block edits must preserve both in-flight user input and the rest of the original Markdown while respecting the VS Code document lifecycle.

## Done when

- A user can edit, switch blocks and modes, undo, redo, save, and close through VS Code without silent loss; pending input is committed or protected before a transition.
- Korean IME composition and rapid input and focus changes do not trigger false conflict warnings, duplicate or lose text, or move input to another block.
- Real concurrent source or external edits are detected without silently overwriting either version; the person can recover uncommitted input and understands the next step.
- Targeted edits preserve untouched front matter, whitespace and line endings, diagrams, and unsupported Markdown. Round-trip tests cover representative constructs and both successful and conflicting changes.

Verify actual VS Code save/undo/redo and external changes, and Korean input in the extension host. Record automated tests and Computer Use evidence before completion; identify any remaining manual IME limitation honestly.


## Current release scope (2026-11-19)

Automatic draft recovery after closing, restart, or crash is deferred by the maintainer. The experimental recovery journal, settings, and UI are removed from this release; existing stored records are not deleted. This task remains in progress for in-session pending input, normal save and mode transitions, conflict detection, and visible copy/open-draft actions.

An extension-host check caused an external change while a test block was focused and observed the conflict and copy/open-draft controls. Further checks must cover fast input, multiple blocks, save, undo/redo, Korean IME, and genuine concurrent edits. Do not mark verified until the remaining criteria have evidence.

## First priority: safe application

Investigate the VS Code document editing API and establish whether edits can be applied against the intended revision without a check-then-apply race. Verify with an injected change at that boundary, not only a change detected before the check. Apply the protection consistently to all rendered-edit paths, including split, text changes, insertions, fences, and checklist toggles. If atomic or equivalently safe application cannot be established for a path, block that path and offer source editing until it can be made safe. A post-application warning alone cannot establish that neither version was overwritten.

For a detected conflict, retain the active in-session input visibly and offer copy or open in a separate document. Do not automatically merge or overwrite either version. Ordinary editing has no extra Apply action, and automatic recovery after close, restart, or crash remains deferred. Record any API limitations and actual test evidence before marking this task complete.


## Investigation and implementation evidence (2026-11-19)

All rendered edit paths submit through a common synchronous version check and handle both rejected and throwing edit calls by reporting failure. Automated host/webview tests exercise refused changes and visible draft preservation. Microsoft VS Code source for 1.90.0 and the installed 1.146.0 shows version information attached for open documents and checked before application, but this is an implementation detail rather than a public atomic-edit guarantee. It does not establish atomic protection from another window or disk changes not yet loaded into the model. A Computer Use test observed a disk change while a rendered paragraph was focused: the warning and copy/open controls appeared and the visible paragraph remained. That observation does not inject a race at the application boundary.

A further local-file development-host test left a Weaver edit unsaved, changed the same file externally, and invoked save. VS Code refused the save and offered Compare/Overwrite while the local text remained visible and the external marker remained on disk. This observation uses the tested VS Code configuration; `files.saveConflictResolution` can change that behavior and other file providers may differ.

A separate two-process VS Code test left a Weaver edit dirty while a second VS Code window saved a different version of the same local file. The first window refused its subsequent save and offered Compare/Overwrite; its unsaved text remained visible and the other version was on disk. This result is specific to the tested local provider and VS Code conflict settings.

## 0.1.22 handover

In-session conflict reporting, draft copy/open, version checks, and local two-window save-conflict observations shipped or were recorded with [0.1.22](https://github.com/ebrAIn-Lab-3B/Weaver/releases/tag/v0.1.22). Remaining: verify local pending-input transitions and the relevant undo/redo and conflict paths against the criteria above. Automatic recovery after close, restart, or crash remains deferred.

## Card review: local baseline (2026-11-19)

The observed local two-window save conflict is evidence for the tested VS Code configuration. Do not treat untested remote providers, offline-to-online synchronization, or alternative conflict settings as defects or release blockers by themselves. Git synchronization and merge conflicts follow the normal Git workflow. This does not prove every change/application race or a universal atomicity guarantee. Keep this card open for the remaining local in-session transition and conflict evidence; investigate other providers only for a concrete reproduced issue or separate requirement.

## Additional local transition check (2026-11-19)

In the existing separate `weaver-req-journey-verify-20261119` local workspace, Computer Use edited the existing outcome paragraph of `REQ-991` in the VS Code 1.146.0 extension development host. After the paragraph lost focus, its added text remained visible. The requirement view and then the VS Code text editor showed the added text; Ctrl+S saved it. Ctrl+Z in the text editor removed that addition, and Ctrl+Y restored it. Front matter, task and ideation links, Mermaid source, and the table with bold text remained visible in the source. This was a single transition, not a rapid-focus or pending-acknowledgement stress test, and it did not repeat the external-change or IME checks.

On the same checkout, `npm.cmd run check` passed and `npm.cmd test` passed (588 Markdown, 122 GitHub, and 248 CLI tests). The application-boundary race injection and the remaining local timing and lifecycle cases still need evidence; this task remains open.

## False conflict on a preceding block (2026-11-19)

Computer Use reproduced a false conflict in the development host: insert a heading through `/head`, save while the insertion field is focused, then edit an existing paragraph before it. No external edit occurred, but Weaver reported a conflict and left the input unsaved. Open draft displayed the input in a separate untitled document. The insertion had marked the whole projection stale even though the preceding block's source line had not moved.

The client now identifies a queued existing editable block strictly before the insertion position; the host still validates the insertion revision and exact text before accepting that transition. Later blocks remain protected by the stale-projection fallback. The host/webview regression test covers insertion, save, focus change, and the preceding edit. After rebuilding and reloading the VS Code 1.146.0 development host, Computer Use repeated the sequence without a warning and verified both changes in the saved Markdown.

In the rebuilt host, a further test left a paragraph edit dirty and appended a marker to the same local file externally. VS Code refused Ctrl+S, offered Compare/Overwrite, and its comparison displayed the local paragraph against the disk version; the disk marker remained on disk. This is a save-conflict check under the tested local settings, not an injected check/apply race. That race, other pending transitions, and broader rapid-input coverage remain unverified.

After the fix, `npm.cmd run check` passed and `npm.cmd test` passed: 589 Markdown, 122 GitHub, and 248 CLI tests. At that point the deterministic application-boundary race harness had not yet been implemented. Automatic recovery after close, restart, or crash is intentionally deferred.

An attempt to launch an isolated VS Code extension-test process for this race did not produce a test result. The launched Electron process inherited an output pipe that closed when its launcher exited, producing an `EPIPE` main-process error dialog. The test process ended and the existing development window was left open. Do not count this attempt as application-boundary evidence. A future runner must keep the launcher alive or redirect the child process output to durable streams and wait for a definitive test result before reporting success.

A retry redirected output to files and kept the launcher alive, avoiding that pipe error. VS Code 1.146.0 reported that its update mutex was held for 30 seconds and exited with code 1 before the test host started. No race assertion ran. The existing VS Code windows and update state were left untouched; this is an environment limitation, not a passing or failing editor test.

## VS Code application-boundary race (2026-11-19)

After VS Code was updated and restarted, `npm.cmd run test:document-race` passed against VS Code 1.147.0 on Windows. The test opens separate local Markdown files in the actual VS Code extension host. For each of inline replacement, insertion, split, fenced-code replacement and checklist replacement, it calls `submitDocumentEdit`, queues a competing `WorkspaceEdit` inside the application callback after Weaver's version check, verifies the extension-host document still reports the original version, and queues the rendered edit without waiting. VS Code applies the competing edit and refuses the rendered edit; the competing model text remains intact. The runner uses a separate temporary profile and workspace, redirects output to files, waits for exit, and requires a result file. It is currently Windows-only.

This is evidence for an open local document whose competing change reaches the VS Code model before application. It exercises the shared submission helper with representative edits, not every webview path end to end or a disk change not yet observed by VS Code. The refused-edit webview tests and earlier local save-conflict checks cover separate parts of the behavior. Remaining local pending-input transitions and rapid input still require evidence before verification.

## Earlier insertion after a saved later block (2026-11-19)

Computer Use in the VS Code 1.147.0 development host reproduced another false conflict: after inserting and saving a paragraph at the end, selecting a checklist in an earlier insertion field showed a conflict despite no external change. The client now recognizes an insertion field strictly before the prior insertion as retaining its source line, while the host continues to validate the prior insertion. The separate same-position heading case retains its existing offset adjustment. A host/webview regression covers a later saved paragraph followed by an earlier checklist.

After rebuilding, Computer Use repeated the sequence in the local temporary `notes.md`: saved `Later block`, selected Checklist with the mouse in the earlier field, entered `Earlier task`, and saved. No conflict appeared, and both the checklist and later paragraph were present in the file. This did not exercise deliberately delayed acknowledgement or rapid input. The broader pending-input and integration criteria remain open.

After the fix, `npm.cmd run check` and `npm.cmd test` passed: 594 Markdown, 122 GitHub, and 248 CLI tests.

Subsequent simulated delayed-acknowledgement tests found and addressed queued slash-menu input and queued IME composition state; see TASK-123. The tests use simulated composition, not a fresh real-IME pass. After these changes `npm.cmd run check` and the full `npm.cmd test` passed (599 Markdown, 122 GitHub, 248 CLI tests).

On 2026-11-20, `npm.cmd run test:document-race` passed again in VS Code 1.147.0 for inline, insertion, split, fenced-code, and checklist model edits. The scope and limitation of this test remain those described in the application-boundary section above.


## Current main Korean IME check (2026-11-20)

With the maintainer enabling the Korean IME, Computer Use exercised the current main implementation in a separate local Restricted Mode workspace in the Windows VS Code 1.147.0 development host. Physical key events composed `한글` in an existing paragraph, then focus moved to another paragraph immediately after composition. The second paragraph received `가`; save, close and reopen preserved both additions. In a new insertion field, physical IME composition of `/체크` filtered the Korean slash menu to Checklist. Enter selected it, physical key events composed `가` in the new checklist item, and saving, closing and reopening preserved both paragraphs and `- [ ] 가` in the Markdown file. No conflict or dropped text appeared in these observed cases. This is a targeted real-IME pass; delayed acknowledgements were not artificially introduced.

## Three-block transition check (2026-11-20)

In a separate local Restricted Mode workspace, Computer Use in the Windows VS Code 1.147.0 development host edited three existing paragraphs in succession, moving focus between them. Undo and redo were invoked; after restoring the edits, save, close and reopen preserved `ONE`, `TWO` and `THREE` in their respective paragraphs without a conflict warning. The automation observed the screen between actions; this was not a deliberately rapid or delayed-acknowledgement host test. On the same checkout, `npm.cmd run test -w @ebrain-lab/weaver-markdown -- markdownWebview.test.ts staleProjection.test.ts splitTransaction.test.ts` passed 74 tests; delayed acknowledgements in those tests are simulated.

## Delayed split acknowledgement and undo (2026-11-20)

A separate Restricted Mode VS Code 1.147.0 development host on Windows used a temporary copy of the current extension with only the `split-applied` host-to-webview message delayed by 15 seconds. Computer Use split a paragraph, typed `Undo buffer` in the provisional block, and invoked Ctrl+Z while the acknowledgement was pending. With no external edit, the editor displayed the document-changed warning twice; `Undo buffer` remained visible with copy/open-draft controls. This is a reproduced false-conflict defect under an artificially delayed response, not a claim of loss or a test of an unmodified host. That observation preceded the fix and recheck recorded in the next section.

## Delayed undo fix and recheck (2026-11-20)

VS Code delivered Ctrl+Z to both the embedded webview and the workbench, allowing the document history to run while a split was still awaiting acknowledgement. The scoped editor shortcut now routes undo and redo through the webview's pending-edit queue; the webview prevents the same key event from enqueueing history twice. Shortcut handling is limited to the Weaver custom editors and excludes focused lists and other input fields.

In the Windows VS Code 1.147.0 development host, Computer Use used a separate temporary copy of the fixed extension with its split acknowledgement deliberately delayed by 60 seconds. After splitting an existing paragraph and typing `Final draft`, Ctrl+Z left the draft visible while waiting, with no conflict. The instrumented host trace recorded one undo after the split and draft were applied. Ctrl+Y restored the draft; save, close and reopen preserved it and the untouched paragraph. The timing delay and trace existed only in the temporary copy. A second development host using the uninstrumented fixed extension verified ordinary paragraph editing, Ctrl+Z and Ctrl+Y. Tests cover the queued request and duplicate-key prevention; `npm.cmd test` passed (620 Markdown, 122 GitHub, 248 CLI) and `npm.cmd run test:document-race` passed the five representative local model cases. These checks cover Windows keyboard shortcuts; menu-driven undo and other operating systems were not separately tested.

## Delayed save and close (2026-11-20)

With the fixed extension copied to a Windows VS Code 1.147.0 development host and a split acknowledgement artificially delayed by 120 seconds, Computer Use typed `Waiting A` into the provisional paragraph, switched to an existing paragraph, typed `Waiting B`, and pressed Ctrl+S. VS Code retained the dirty indicator during the delay; after the acknowledgement, both additions appeared in the saved local file. This is a targeted queued-focus and keyboard-save observation with an instrumented extension, not a claim about every transition.

A separate instrumented host with a 30-second acknowledgement delay exposed an unresolved data-loss case: after Enter and typing `Close pending draft`, Ctrl+W showed the VS Code unsaved-changes dialog. Choosing Save closed the editor, but the saved local file contained the split and did not contain the draft. The Ctrl+S routing fix does not intercept this VS Code save-and-close path. Keep the task open until the close path protects pending input and passes an actual-host regression.
