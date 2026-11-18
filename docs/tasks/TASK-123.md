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

Enter in an existing text block remains disabled until the complete protocol below is integrated and verified. A pure transaction planner and regression tests are available in `apps/vscode-extension/src/splitTransaction.ts` and `packages/markdown/test/splitTransaction.test.ts`; neither is connected to the editor. Passing those tests alone does not establish editor behavior or complete this task.

1. Bind the operation to a unique transaction ID, document identity, projection generation, document version, exact source line range, source text, block kind, and the UTF-16 selection captured after composition ends. Resolve the range from the current validated projection, not by searching for matching text. Reject invalid ranges and surrogate-pair boundaries.
2. Serialize pending edits before the split. The host must verify the current document identity, revision, range and original text immediately before applying the split. A comparison against text alone is insufficient when multiple lines have the same contents. A version comparison followed by an unversioned edit is not inherently atomic: the integration must establish and verify a version-bound application strategy, including handling changes between checking and applying.
3. While waiting for the matching acknowledgement, retain a provisional right-hand block and buffer its entire text, selection and IME composition state. Do not rerender it away. Acknowledgement must match the transaction, document, projection, resulting text and expected version; unrelated acknowledgements are ignored. On acknowledgement, replay the buffered draft only against the acknowledged exact revision and right-hand range, after composition ends. Subsequent input and edit acknowledgements must remain serialized.
4. A failed operation or external change must never silently discard the draft or apply it to a different block. Preserve the draft and selection in a recoverable form and provide an explicit conflict/recovery path. The integrated design must cover view reload, document switching and closing; the current in-memory model does not provide durable recovery.
5. Save, undo and redo must act as barriers to the transaction queue. Define and verify actual VS Code undo grouping and selection restoration, including undo during a pending operation; inverse-string tests in the pure model do not verify VS Code undo behavior.

Integration verification must include beginning/middle/end splits, selected text replacement, immediate typing and rapid consecutive Enter, Korean IME and composition boundaries, duplicate adjacent source lines, stale projection, external edits at every transition, rejected or delayed acknowledgements, reload/close recovery, save, and undo/redo. Exercise these in the VS Code extension host with Computer Use as well as automated regression tests. Keep the existing safe restriction if any required recovery or ordering behavior is missing.

## API and alternative-editor review (2026-11-19)

The public `WorkspaceEdit` API used by the current custom text editor does not expose a caller-supplied document version for a text replacement. A separate check of `document.version` before `applyEdit` therefore does not itself make the check and application atomic. [VS Code issue #114656](https://github.com/microsoft/vscode/issues/114656) discusses this race and version-bound edit requests; it is historical evidence, not proof of the behavior of every current runtime. The [VS Code custom-editor guide](https://code.visualstudio.com/api/extension-guides/custom-editors) uses `workspace.applyEdit`, and the [current built-in Markdown editor implementation](https://github.com/microsoft/vscode/blob/main/extensions/markdown-language-features/src/preview/markdownEditorProvider.ts) uses a serialized edit queue and verifies expected content. Those patterns warrant evaluation but do not establish lossless conflict handling for Weaver.

The local VS Code 1.146.0 installation registers a separate `vscode.markdown.editor` editor and commands including `markdown.editor.smartEnter`. Weaver's declared compatibility begins at VS Code 1.90.0, so availability cannot be assumed across supported versions. Opening that editor in the isolated untrusted test workspace displayed a Workspace Trust warning; no trust setting was changed and Enter, slash insertion, and save behavior were not verified. The optional built-in editor is not a replacement for this task until availability, Markdown round trips, editing safeguards, slash interaction, and a safe fallback have been tested.
