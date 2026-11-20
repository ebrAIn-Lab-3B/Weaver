# DEC-027: Markdown viewing and human authoring

- Status: proposed; awaiting human review
- Date: 2026-11-18
- Related: `REQ-021`, `REQ-022`, `TASK-115`

## Context

People need to read ordinary Markdown and diagrams and author ideation and requirement documents without an agent. Files in the repository remain the source of truth. Existing users can choose the text editor and the Requirement view remains available.

## Proposed first slice

1. Ordinary Markdown and task files open in a Weaver rendered editor by default, with an action to open their source. A task also offers an action to open its requirement at that task. Requirement documents retain their existing view. Weaver contributes a bundled Mermaid renderer to this view and VS Code's Markdown preview; valid Mermaid fences render as diagrams and an invalid fence remains visible with an explanation. The renderer runs locally. Other diagram formats are not promised in this slice.
2. The commands for creating an ideation or requirement file ask for the destination and show the initial content before creating it. Ideation begins with only the chosen title. A requirement starts with the required schema fields, outcome, and one acceptance criterion. Both remain ordinary Markdown.
3. The initial requirement ID proposal follows the largest existing parsed requirement ID in the workspace. After preview, cooperating local Weaver processes using the same temporary directory serialize the final workspace recheck and exclusive destination creation using a lock directory. A competing creator fails and can retry; a changed proposal requires a new preview. A process interrupted while holding the lock can leave it behind: after confirming no Weaver creation is running, remove the lock directory shown in the message. The lock does not coordinate independent writers, other temporary directories or other machines, and cannot guarantee uniqueness across workspaces whose scans do not see the same files. Exclusive creation also prevents overwriting a destination.
4. A requirement can link to an ideation file in the same workspace folder with an ordinary relative Markdown link, inserted as an unsaved text edit.
5. The initial view edits a single-line heading or paragraph as a targeted Markdown text edit. The subsequent product direction for a Notion-like block editor and slash commands is recorded in [DEC-028](./DEC-028-notion-like-markdown-editing.md). Source mode remains available.

## Review and limitations

On 2026-11-20 the maintainer selected the repository as a common allocation scope for nested workspaces and chose a repository allocation history. The proposal and protected recheck scan the workspace, and, for each local workspace folder inside a Git checkout, also scan Markdown and allocation history under the nearest enclosing checkout, including files outside a nested workspace folder. The repository scan does not follow symbolic links and skips `.git`, `node_modules`, `dist`, `out`, `examples`, and `.claude/worktrees`, matching the existing workspace exclusions. Folders without an enclosing checkout use their workspace scan and folder history. The lock still requires the same temporary directory and cooperating processes. Repository scope alone does not guarantee uniqueness across differently composed multi-repository workspaces or disconnected copies.

After confirmation and the protected recheck, Weaver appends the ID to `.weaver/requirement-ids.txt` in the checkout root (or selected folder when no checkout exists), flushes it, and then exclusively creates the document. Commit and preserve this file; each line is a reserved `REQ-###` ID. A failure after reservation consumes the ID, including a destination collision. Cancellation before confirmation does not reserve one. An empty, incomplete or invalid existing history stops creation until the history is reviewed and repaired; do not delete entries merely because a document was removed. A missing file is treated as a first use, so Weaver cannot distinguish that case from a deleted history file. Existing files contribute to the proposal, but IDs deleted before history existed cannot be inferred from current files. Bootstrap those from trusted historical records when needed. Separate clones and nonparticipating writers can still allocate the same ID and require reconciliation. These limitations leave the schema's broader workspace uniqueness and historical never-reuse guarantees unresolved.

Human review should confirm the initial Mermaid-only support, templates, and ID rules. Compatibility with other Mermaid extensions, preview security settings, live editing, and source preservation must be checked in the extension host. No task or requirement is verified by this proposal alone.
