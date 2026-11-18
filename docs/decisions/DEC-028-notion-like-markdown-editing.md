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
