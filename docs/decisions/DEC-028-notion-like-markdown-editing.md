# DEC-028: Notion-like Markdown editing

- Status: accepted for product direction on 2026-11-18
- Related: `REQ-022`, `TASK-119`, [DEC-027](./DEC-027-markdown-viewing-and-authoring.md)

## Context and review

The first slash trial put a visible Add block button between document blocks and opened a separate input. The maintainer found that the repeated controls made the document unpleasant to read. The team compared a Notion-like direct editor, adopting or integrating SlashMD, and a source editor with GitHub-style slash commands. Notion is familiar to users and sets the desired interaction: click and type in the document, start a new block, and use a searchable slash menu at the caret; normal reading is not interrupted by repeated controls.

## Decision

Weaver's target is a Notion-like block experience backed by repository Markdown, with source mode always available. The first implementation may support a subset of blocks but must identify its limits, avoid silently rewriting unsupported content, and use VS Code's document and undo/dirty lifecycle for committed edits. A slash menu offers initial heading, bullet list, checklist, and code block commands; Escape dismisses it and keyboard selection works. Existing Mermaid, front matter, and unsupported constructs must survive edits and saves.

## Implementation review

SlashMD is a relevant reference, but its repository's README declares MIT while GitHub's license endpoint returned 404 on 2026-11-18. Licensing and integration have not been established sufficiently to copy or depend on its code. A Markdown-aware editor can be evaluated separately, with round-trip tests before adoption. The first Weaver slice uses targeted text edits and retains source fallback for constructs it cannot safely edit. It does not claim full Notion parity.

## Remaining decisions

Nested block editing, rich inline formatting, drag-and-drop, and any external editor dependency need their own implementation and verification. TASK-124 covers supported multiline code and list editing; TASK-126 covers the route from requirement view to the authoring surface and back. Existing DEC-027 questions about templates and requirement ID allocation remain open.

## Release scope decision (2026-11-19)

The maintainer chose to finish direct editing in Weaver with Enter and simple top-level lists and checklists. Automatic draft recovery after close, restart, or crash is outside this release; remove its experimental implementation and configuration. Keep normal in-session input preservation, conflict detection, explicit copy/open-draft actions, source fallback, and Markdown round-trip verification. Previously stored recovery data must not be deleted as part of removing the feature.

## Prioritized editing and conflict decision (2026-11-19)

The maintainer chose the simplest ordinary authoring flow: click a supported block, type, use Enter, and save through VS Code. Weaver applies edits to the VS Code document without an extra Apply action. It does not automatically merge conflicting changes. When a conflict is detected, keep the pending input visible and offer copy or open in a separate document; explain only the action needed. Unsupported structures retain their Markdown and offer a clear source-mode route. Do not enable an editing path merely because a version was checked before an unversioned edit: the application mechanism and conflict behavior must be established with tests, including changes between the check and application. If safe application cannot be established, use source mode for the affected path until it can be made safe.

The alternatives considered were an independent draft applied at a later boundary and switching to source editing whenever in-place editing cannot be protected. A deferred draft makes versions easier to compare but adds state and uncertainty around save, focus, and mode changes; it is not the default interaction. Source editing is the safe fallback, not the ordinary workflow, because switching views interrupts writing. Existing in-session copy/open-draft actions remain; automatic recovery after close, restart, or crash remains outside this release.

Implement and verify in this order: (1) concurrent-change safety, (2) ordinary Enter behavior for paragraphs and simple lists, including new insertion fields, (3) actual VS Code verification of Korean IME, rapid input, save, undo/redo, view changes, and concurrent edits, then (4) review the remaining limitations and release evidence. A passing CI run or a partial development-host pass alone does not establish the release criteria. Nested or rich constructs may remain source-only where safe direct editing is not established.

## Local authoring and sync boundary (2026-11-19)

The maintainer clarified that ordinary local Markdown editing and VS Code save/conflict handling are the baseline. A disconnected local workspace can be edited locally; subsequent Git synchronization and any resulting merge conflict belong to the normal Git workflow. Weaver does not promise automatic synchronization or merging. Remote SSH, other file providers, and alternative VS Code conflict settings are not proven by the local tests, but that lack of coverage alone is neither a known defect nor a release blocker. Investigate a specific provider when an actual reproducible problem or a separate requirement warrants it. Continue to protect visible in-session input on detected conflicts and verify local pending-input transitions; this decision does not establish atomic behavior for unobserved changes.

## Pending edits and save-and-close decision (2026-11-20)

The maintainer chose to reduce the interval during which accepted input exists only in the webview, and to make saving and closing wait until pending input has been processed. A save must not be reported as successful or close the editor while accepted input remains unapplied; on a refused or conflicting edit, retain the draft and let the person resolve it. Earlier application can reduce the risk window but is not, by itself, evidence of this guarantee.

Prefer VS Code's existing text-document save, close, file-name and location prompts, and local conflict handling. The maintainer asked to keep Weaver's responsibility focused on synchronizing its visible edits to that document rather than reimplementing the normal VS Code lifecycle. First reduce avoidable delays in applying input and investigate whether the existing document model can safely cover the reproduced tab-close case. Do not treat faster synchronization alone as proof that the loss is fixed. The earlier proposed migration to `CustomEditorProvider` is not an implementation commitment; revisit it only if evidence shows that the narrower approach cannot meet the agreed in-session behavior. Verify the actual tab X, Save, and reopen flow with a deliberately delayed pending edit, as well as failure and external-change paths, before closing TASK-125 and its dependent tasks. Automatic recovery after restart or crash remains outside scope.

The Windows VS Code development host was checked with a separate untitled document: closing its tab prompted Save, Don't Save, or Cancel; Save opened the native Save As dialog, and the selected temporary file contained the entered text. This confirms the tested ordinary text-editor flow, not synchronization of Weaver-only drafts. VS Code's [custom text editor documentation](https://code.visualstudio.com/api/extension-guides/custom-editors#custom-text-editor) assigns synchronization between the webview and `TextDocument` to the extension. Its [API reference](https://code.visualstudio.com/api/references/vscode-api#workspace.onWillSaveTextDocument) documents limits on save participants, and its [conflict guidance](https://code.visualstudio.com/docs/editing/getting-started/tips-and-tricks) describes Compare for disk changes.

## Immediate ordered edit investigation (2026-11-20)

The maintainer chose to investigate sending edits to the extension host immediately and applying them in order, with batching where appropriate, while retaining VS Code's `TextDocument` and native save flow. The current client waits for the split acknowledgement before sending input typed into the new block; that dependency is the observed delay window. The target design is: (1) send split and subsequent accepted input without waiting for a host-to-webview acknowledgement; (2) serialize application at the host and bind each operation to its document, projection, transaction, expected revision and source range; (3) report rejection without applying an edit to a different block, and retain the visible input; (4) reconcile acknowledged state without overwriting later input; and (5) preserve undo/redo, IME composition, source edits and local save conflicts. Coalescing consecutive edits is permitted only if ordering, selection and failure handling remain correct.

Microsoft's [experimental Markdown editor implementation](https://github.com/microsoft/vscode/blob/main/extensions/markdown-language-features/src/preview/markdownEditorProvider.ts) provides an example of serialized host-side edits and an epoch for stale state; it is not evidence that the tab-close case is safe. The [VS Code issue on asynchronous custom text edits](https://github.com/microsoft/vscode/issues/149016) illustrates why overlapping `WorkspaceEdit` calls need coordination. The [custom editor guide](https://code.visualstudio.com/api/extension-guides/custom-editors) assigns webview-to-document synchronization to the extension. The [save event reference](https://code.visualstudio.com/api/references/vscode-api#workspace.onWillSaveTextDocument) documents its time budget and possible omission; it is not a guaranteed save barrier.

Implement in reviewable steps: first establish and test host ordering, then add the immediate provisional-input protocol and client reconciliation, then exercise a deliberately delayed split acknowledgement, conflicts, undo/redo and the real tab X save flow in the extension host. Earlier delivery reduces the risk window, but it cannot alone establish safety when a message itself has not reached the host before close. Keep TASK-125 and dependent cards open until the actual behavior meets their criteria.
