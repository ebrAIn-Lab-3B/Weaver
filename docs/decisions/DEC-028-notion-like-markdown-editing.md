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
