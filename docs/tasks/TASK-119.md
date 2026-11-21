---
id: TASK-119
type: task
title: Edit Markdown blocks without losing source content
requirement: REQ-022
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/318
status: verified
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
assignee: codex
criteria: [AC-001, AC-002, AC-004, AC-005, AC-006]
---

# TASK-119 Edit Markdown blocks without losing source content

## Current outcome (2026-11-21)

The maintainer requested Verified within the accepted DEC-028 scope. Supported editing, Markdown preservation, mode transitions and the real local external-save conflict are evidenced below and in TASK-123 through TASK-127. Input still in transit or in an unfinished IME composition at close may be lost, as explicitly accepted in DEC-028 and REQ-022. The status in this file is effective with the closing PR's merge.

After TASK-115 and TASK-116, implement the agreed rendered block editing and source mode for ideation and requirement files. Preserve diagram source and unsupported constructs when saving; protect unsaved changes when switching or closing. Integrate with ordinary filesystem changes.

Verify editing and reopening common blocks, switching modes, unsaved changes, external edits, and round trips containing diagrams and unsupported Markdown. A named agent owner remains to be assigned.

Progress: the rendered editor supports direct editing of simple single-line headings and paragraphs, and a slash menu on empty block boundaries. Other constructs use source mode. Full block editing and broader round-trip verification remain open.

Manual verification on 2026-11-18: the maintainer confirmed that document content was preserved after editing, saving, and reopening. This does not by itself establish coverage of every unsupported construct or the remaining full block editor scope.

## Revised direction and first slice

Follow [DEC-028](../decisions/DEC-028-notion-like-markdown-editing.md): write directly on the document and show a caret-positioned slash menu, without repeated Add block buttons. Implement safe direct editing for supported text and retain source fallback for other constructs. Existing content, including front matter, diagrams, and unsupported Markdown, is not rewritten. Protect against changes made concurrently. Requirement documents retain their existing requirement view; TASK-126 tracks the route to the authoring surface and back.

Verify insertion at more than one position, all commands, cancellation, source preservation, save and reopen, and a concurrent source change. These criteria define a trial slice, not completion of the full task.

Development-host check on 2026-11-18: an existing plain paragraph was edited in place, Enter opened an empty line, and `/` opened a menu from which a heading was inserted and saved. The saved Markdown retained the existing Mermaid source. This is a partial check; other commands, IME, undo, external changes, and the complete document round trip remain to be verified.

Maintainer feedback on 2026-11-18: editing selected existing content produced a spurious document-change warning. The editor now keeps edits queued across a rapid focus change and recognizes its own delayed document-change events; a development-host check replaced existing text with Korean and saved it without the warning. Automated tests simulate Korean composition and delayed acknowledgements. Real Korean IME input and genuine concurrent file changes still need extension-host verification.

## 0.1.22 handover

The supported rendered editor and source fallback shipped in [0.1.22](https://github.com/ebrAIn-Lab-3B/Weaver/releases/tag/v0.1.22) via [PR #331](https://github.com/ebrAIn-Lab-3B/Weaver/pull/331). Follow-up work is tracked by TASK-123 through TASK-127. Remaining: complete the broader document-preservation and mode-switch criteria; see the child tasks for specific limits and verification.

## Card review: current evidence (2026-11-19)

Later checks recorded in TASK-125 through TASK-127 exercised real Korean IME, a local external save conflict, and a requirement containing Mermaid and unsupported Markdown. The earlier outstanding statements above describe the state at the time of those checks. The parent task remains open for the documented local mode-transition and preservation criteria; remote-provider coverage is not a blocker by itself.

## Completion review (2026-11-20)

The maintainer subsequently accepted the pending-input and unfinished-composition limitation for this release; see the final section of DEC-028. The two paragraphs immediately below record the earlier assessment and are superseded where they require an unconditional save barrier.

The verified child cards record accepted test scope and substantial local evidence. They do not establish that input still in transit or an unfinished IME composition is saved on close. REQ-022 requires that input and unsaved changes not be silently lost, and DEC-028 calls for pending accepted edits to be processed before a successful save and close. The narrower observed behavior therefore does not by itself satisfy those statements.

Resolve this gap by establishing the required save-and-close behavior and recording host evidence for delayed or refused input and composition, or by recording an explicit decision to change the requirement's acceptance scope. Do not infer that exception solely from the child cards' verified status. Keep this parent open until its acceptance criteria and evidence policy are met.

Baseline on 2026-11-20: `npm.cmd run check` and `npm.cmd test` passed (640 Markdown, 122 GitHub, 248 CLI tests). This is a regression baseline, not evidence that a save barrier covers input still in transit or unfinished composition.

The existing `npm.cmd run test:document-race` also passed in VS Code 1.147.0 for the inline, insertion, split, fenced-code and checklist model edit cases. It exercises the application boundary, not delayed webview input or save and close, and does not resolve the remaining gap.

Follow-up in progress: queued keyboard save now invokes VS Code's workbench save command instead of directly invoking `TextDocument.save()`, which had overwritten an external disk change in the isolated probe described in TASK-125. If the originating panel is no longer active, the command does not save another editor and reports that the person should return and save. An automated message-handler test checks command routing and the inactive-panel guard. `npm.cmd run check` and `npm.cmd test` passed (643 Markdown, 122 GitHub, 248 CLI tests). The new route still needs an end-to-end local external-change conflict check in the development host; it does not provide a universal pending-input save barrier.

`npm.cmd run test:save-conflict` passed in an isolated Windows VS Code 1.147.0 extension host. The actual message handler and workbench save command saved an ordinary dirty local document; after a separate disk change to another dirty document, the external disk text remained intact and the local model remained dirty and intact. The panel and incoming message were simulated, and the test did not inspect the conflict UI or the webview's pending-input path. A real rendered-editor conflict check and the save/close barrier remain open.

The maintainer's acceptance removes the universal save barrier as a completion prerequisite; it does not establish the real rendered-editor conflict behavior of the new workbench save route. Verify that route and record implementation and review evidence before closing the card.

## Actual rendered-editor save conflict (2026-11-20)

In a local Windows VS Code 1.147.0 Extension Development Host built from the current working tree, Computer Use edited a paragraph in the Weaver rendered editor to `Local rendered draft.` and observed the dirty indicator. A separate filesystem write changed the same file to `External disk version.`; Ctrl+S from the rendered editor produced VS Code's newer-file save error with Compare and Overwrite choices. Compare displayed both the external disk version and the local rendered draft in the conflict editor. A filesystem read confirmed the external version remained on disk; the local version remained visible in the dirty editor session. No overwrite or conflict resolution was selected.

This is a targeted local-file, in-session check of the workbench save route, not evidence of recovery after closing or restarting, remote providers, or preservation of input still in transit or unfinished IME composition. The latter limitation is accepted in DEC-028 and REQ-022. Implementation review and normal completion evidence remain open; this card is not marked verified.

## Save-route review and regression rerun (2026-11-20)

The queued save handler uses the workbench save command only while its originating panel is active; otherwise it warns instead of saving the newly active editor. The real rendered-editor comparison above confirms the tested local conflict path, while the host harness exercises the handler with a simulated panel. `npm.cmd run check`, `npm.cmd test` (643 Markdown, 122 GitHub, 248 CLI), and `npm.cmd run test:save-conflict` passed; the last used VS Code 1.147.0 and confirmed the external disk content and dirty local model remained intact. This review does not establish a pending-input save barrier or recovery after closure, which are outside the accepted scope, and does not replace closing PR evidence.

## PR validation (2026-11-21)

Before submitting the save-route change for review, `npm.cmd run check` and `npm.cmd test` passed (643 Markdown, 122 GitHub, 248 CLI). In isolated VS Code 1.147.0 extension hosts, `node scripts/test-author-host.js save-conflict` preserved the external disk text and dirty local model, and `node scripts/test-document-race.js` passed the inline, insert, split, fence and checklist cases. `npm.cmd run package` and `npm.cmd run package:cli`, followed by `node dist/weaver.js --help`, passed. The real rendered-editor conflict observation and accepted close limitation remain recorded above. This PR is implementation evidence; the task remains open pending its remaining review and normal completion evidence.

## Post-merge evidence review (2026-11-21)

The supported editing, mode transitions, Markdown preservation, Korean IME and local conflict evidence is recorded here and in TASK-123 through TASK-127. The actual rendered-editor conflict check above covers both versions in the open session. DEC-028 and REQ-022 explicitly accept the remaining in-transit input and unfinished IME composition limitation at close; a universal save barrier is not a remaining prerequisite. These observations are limited to the scenarios and environments recorded in those tasks.

[PR #355](https://github.com/ebrAIn-Lab-3B/Weaver/pull/355) merged as `4150ab4`; its CI and the [post-merge main CI](https://github.com/ebrAIn-Lab-3B/Weaver/actions/runs/44824900846) passed. The PR explicitly does not close [issue #318](https://github.com/ebrAIn-Lab-3B/Weaver/issues/318), which remains open. The recorded implementation and acceptance evidence supports completion within the accepted scope, but DEC-006 still requires a merged PR that closes the issue or a human-approved evidence exception reviewed in a PR. This review did not run new editor tests or change the task status.
