# DEC-029: Recovery of pending editor input

- Status: proposed; implementation and human review pending
- Date: 2026-11-19
- Related: `REQ-022`, `TASK-125`, `TASK-127`, [DEC-028](./DEC-028-notion-like-markdown-editing.md)

## Problem

The rendered editor sends changes from a webview to a `CustomTextEditorProvider`, which applies targeted edits to a VS Code `TextDocument`. User input can be visible in the webview before the host receives or applies it. A conflict can also leave a draft in the webview after the document changes. That input is not necessarily reflected in the `TextDocument`, its dirty state, undo history, or VS Code's hot-exit backup. Closing a tab, switching modes, saving, reloading, an extension-host crash, or a process termination can therefore lose it. In addition, a queued source line may address a different block after a structural change, even if the text happens to match.

This is a release blocker for `TASK-125`. The current behavior must not be described as durable recovery or accepted as complete on the strength of a warning alone.

## Constraints from VS Code

- A `CustomTextEditorProvider` uses VS Code's `TextDocument` model; applied text edits participate in its normal dirty, undo, save, and hot-exit behavior. This protection starts only when the edit is actually applied to that model. [Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors)
- Webview `getState`/`setState` can retain JSON state when a webview is hidden and recreated, but the documentation says the state is destroyed with its panel. A `WebviewPanelSerializer` has a separate restart lifecycle. Neither fact is a guarantee that an unacknowledged keystroke survives closing a custom text editor or an abrupt process failure. [Webview persistence](https://code.visualstudio.com/api/extension-guides/webview#persistence)
- `onWillSaveTextDocument` can delay a save and supply edits, but VS Code can save without firing it, has a shared time budget, and can ignore its edits after concurrent changes. It is not a general close interception or durability barrier. [VS Code API](https://code.visualstudio.com/api/references/vscode-api#workspace.onWillSaveTextDocument)
- VS Code is authoritative for already-applied document edits. A separate recovery mechanism must not silently alter a repository file or override a user's decision to discard a document.

## Options considered

| Option | Benefit | Gap |
| --- | --- | --- |
| Apply edits to `TextDocument` promptly and rely on VS Code | Uses built-in dirty state, save, undo, and hot exit for applied edits. | A webview-to-host message, an in-flight apply, and a conflicting draft remain outside the model until accepted. |
| Save the webview draft only with `setState` | Lightweight across webview recreation while the panel is retained. | Panel closure and process failure are not covered; no independent recovery copy exists. |
| Keep a separate extension-managed recovery journal plus prompt model updates | Can preserve acknowledged pending or conflicting input outside the repository while retaining the normal `TextDocument` workflow. | Adds privacy, storage, crash-consistency, concurrency, cleanup, and recovery-UI work. Asynchronous messaging and storage still leave a window before a draft is durably acknowledged. |
| Replace the text editor with a custom document model and backup provider | Can explicitly integrate a different dirty/backup lifecycle. | A much larger migration affecting text editing, undo, save, backup, and multiple views; it does not by itself make input durable before the host receives it. |

## Proposed first design

Use the existing text-document model **plus a separate recovery journal**, rather than treating either `setState` or a custom-document migration as an immediate fix. This is a design to implement and test, not a statement that the current editor satisfies the requirement.

1. Treat each committed input or IME composition result as a sequenced operation owned by a document session. The webview sends it promptly; the host serializes operations and checks the original document identity, session, version, and expected content before applying a minimal `WorkspaceEdit`. Suppress or coalesce duplicate acknowledgements without losing a newer draft. A content match alone does not authorize applying a stale source-line location after a structural change.
2. Before acknowledging a pending or conflicting operation as **recoverable**, persist a versioned journal record outside the workspace repository. It includes the document URI, session and monotonic sequence, base document identity and content digest, sufficient original context and intended replacement to recover the user's text, and a timestamp. Persist only what recovery needs; do not assume a line number or a digest alone uniquely identifies the target. Support multiple documents and editor instances without overwriting each other's drafts.
3. Serialize writes for each journal, write a complete new record to a temporary file, then atomically replace the committed record where the storage provider supports it. Define and test what a successful flush means on each supported platform; if durable flush or atomic replacement is unavailable, do not label the record durably recoverable. On a write, quota, permission, or corruption failure, retain the visible draft, present a localized error and a way to copy it, and stop acknowledging it as protected. Do not drop an earlier valid checkpoint when updating one fails.
4. Apply a validated operation to the `TextDocument` and wait for acknowledgement before declaring it incorporated. VS Code's dirty state and undo/redo apply to incorporated edits. A journal is supplementary and must not be used to invent or clear the document's dirty state. Pending webview text is explicitly indicated until it has reached the model or durable journal; a save indication must not imply that pending input is in the saved file.
5. On a conflict, preserve the recoverable pending text separately and show the current document plus the draft to the user. Offer explicit copy or a reviewable recovery document/diff; do not automatically write to the original file. Any later apply must revalidate the current target and be an explicit user action. Ambiguous matches, duplicate blocks, renamed or deleted files, and stale structures must not be automatically replayed. Reopening after restart offers recovery even when the original tab was closed; a missing original remains recoverable as text.
6. When the user explicitly discards the pending draft, or when the host confirms the corresponding operation was incorporated and the resulting document state was saved, retire only the journal records covered by that confirmation. Do not remove a newer or conflicting record. A close, mode switch, reload, automatic save, or unsuccessful save alone is not proof that the pending draft was saved. If normal close/save cannot be intercepted reliably, recovery remains available on reopening and the UI must say so rather than promising a synchronous close guard.
7. Serialize state changes per document, bind acknowledgements to the exact operation and sequence, and preserve later input while an earlier write is in flight. On multiple views or sessions, a stale acknowledgement cannot mark newer input as durable, saved, or safe to delete. Do not render away unacknowledged composition text. Undo and redo concern applied document edits; recovery records for unresolved drafts remain separately visible.

## Durability boundary and privacy

The supported recovery guarantee begins only **after** the host has confirmed a journal record was durably written using the supported storage protocol. Input still in an IME's uncommitted composition, a webview message in transit, or a failed/unacknowledged write can be lost if a process or machine stops abruptly. UI copy and tests must distinguish visible, pending, journaled, applied, and saved states. No software-only design here promises recovery from device failure or a storage provider that does not honor the required durability operations.

Journal files can contain private document text and paths. Store them under the extension's VS Code-managed storage, not the repository, Git, logs, telemetry, or a sync service introduced by Weaver. A remote extension host may place that storage on the remote machine; explain the location and restrict the first implementation to providers whose storage and recovery semantics are tested. Use appropriate restrictive permissions where supported, without claiming that hashing a filename encrypts the record. Provide a localized way to inspect and explicitly discard recoverable drafts. Keep unresolved drafts until the user resolves them; delete resolved records promptly and specify a bounded, user-visible retention policy for abandoned records before implementation. Never purge unresolved drafts merely because a timer elapsed without an explicit policy and user-facing notice.

## Verification required before release

- Automated tests inject delayed, reordered, duplicated, and failed messages/writes; a crash between temporary write, durable flush, rename, model apply, and journal cleanup; duplicate source blocks; two views; stale versions; invalid journal records; and storage full/unavailable. Verify that an acknowledged recoverable draft is restored exactly once or offered for review, never silently applied to a different block.
- Extension-host tests cover typing, real Korean IME where available, selection replacement, fast focus movement, slash-menu input, save from keyboard and menu, autosave, undo/redo, source/view switching, tab close and reopen, hot exit, extension-host termination, and reopening after VS Code restart. Distinguish actual IME and actual termination from simulation. Use Computer Use for the end-to-end flow and retain evidence.
- Verify real external changes and simultaneous views, save failure, user discard, file rename/deletion, conflict review, recovery copy, CRLF and front matter, unsupported Markdown, Mermaid, and no unintended Git-tracked files. Exercise missing or corrupt journals and inaccessible storage without deleting the only recoverable input.
- Verify the original document is never silently overwritten on conflict, that a journaled draft is not reported as saved, that retention and deletion match the documented policy, and that the interface is localized in English and Korean.

## Implementation work and decisions still needed

1. Specify the per-document operation protocol, supported local/remote storage and crash-consistency capabilities, exact acknowledgement semantics, and the retention policy. Prototype the journal and fault-injection tests without connecting it to the live editor.
2. Implement journal persistence, error reporting, sequencing, and recovery review UI; connect them to the `TextDocument` without weakening source-preservation checks. Decide the treatment of input before the journal acknowledgement and how unsaved composition is communicated.
3. Integrate save, mode-switch, close, restart, undo, and conflict flows to the extent the VS Code APIs support them. Verify the real behavior rather than relying on `onWillSaveTextDocument` or panel serialization as a guarantee.
4. Run the full `TASK-125` and `TASK-127` checks, record tested environments and limitations, and resolve any remaining release blockers. Human review must accept the final retention, storage-location, and recovery UX choices before this decision is marked accepted.
