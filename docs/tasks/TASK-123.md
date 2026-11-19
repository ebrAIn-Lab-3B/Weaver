---
id: TASK-123
type: task
title: Make direct writing and slash menus flow naturally
requirement: REQ-022
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/326
status: draft
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-010, AC-011]
---

# TASK-123 Make direct writing and slash menus flow naturally

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

Integration verification must include beginning/middle/end splits, selected text replacement, immediate typing and rapid consecutive Enter, Korean IME and composition boundaries, duplicate adjacent source lines, stale projection, external edits at every transition, rejected or delayed acknowledgements, ordinary mode switching, save, and undo/redo. Exercise these in the VS Code extension host with Computer Use as well as automated regression tests. Keep the task in progress until the required ordering and conflict behavior is verified.

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
