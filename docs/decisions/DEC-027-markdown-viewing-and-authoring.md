# DEC-027: Markdown viewing and human authoring

- Status: proposed; awaiting human review
- Date: 2026-11-18
- Related: `REQ-021`, `REQ-022`, `TASK-115`

## Context

People need to read ordinary Markdown and diagrams and author ideation and requirement documents without an agent. Files in the repository remain the source of truth. Existing users can choose the text editor and the Requirement view remains available.

## Proposed first slice

1. Ordinary Markdown and task files open in a Weaver rendered editor by default, with an action to open their source. A task also offers an action to open its requirement at that task. Requirement documents retain their existing view. Weaver contributes a bundled Mermaid renderer to this view and VS Code's Markdown preview; valid Mermaid fences render as diagrams and an invalid fence remains visible with an explanation. The renderer runs locally. Other diagram formats are not promised in this slice.
2. The commands for creating an ideation or requirement file ask for the destination and show the initial content before creating it. Ideation begins with only the chosen title. A requirement starts with the required schema fields, outcome, and one acceptance criterion. Both remain ordinary Markdown.
3. The initial requirement ID proposal follows the largest existing parsed requirement ID in the workspace. The ID is checked again before creation, and exclusive file creation prevents overwriting a destination. This is not yet an atomic workspace-wide allocation across concurrent processes; that remains implementation work.
4. A requirement can link to an ideation file in the same workspace folder with an ordinary relative Markdown link, inserted as an unsaved text edit.
5. The initial view edits a single-line heading or paragraph as a targeted Markdown text edit. The subsequent product direction for a Notion-like block editor and slash commands is recorded in [DEC-028](./DEC-028-notion-like-markdown-editing.md). Source mode remains available.

## Review and limitations

Human review should confirm the initial Mermaid-only support, templates, and ID rules. Compatibility with other Mermaid extensions, preview security settings, live editing, and source preservation must be checked in the extension host. No task or requirement is verified by this proposal alone.
