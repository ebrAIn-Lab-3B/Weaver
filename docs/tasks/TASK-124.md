---
id: TASK-124
type: task
title: Edit structured Markdown blocks in the rendered document
requirement: REQ-022
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/327
status: draft
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-010, AC-012]
---

# TASK-124 Edit structured Markdown blocks in the rendered document

## Context

The trial can insert structured blocks but cannot reliably edit them again. A person should be able to continue working in the document after insertion or reopening it.

## Done when

- Reopened supported headings, paragraphs, bullet lists, checklist items, and fenced code blocks can be edited in place, including more than one line or list item.
- Typing, Enter, deletion, and checkbox changes behave predictably for supported blocks and survive save and reopen as Markdown. A block's surrounding content remains unchanged.
- Constructs that cannot be safely edited, including unsupported nested or inline syntax, remain preserved and have an accessible way to open the relevant source.
- Supported behavior is documented without claiming complete Notion compatibility or assuming an organization's document structure.

Verify insertion followed by editing, existing documents, multiple items and code lines, source fallback, and save/reopen in the VS Code extension host. Record tests and a Computer Use result before completion.


## Current support and limitations

Supported plain paragraphs, headings, top-level list items, and simple nested child items can be edited in place. Enter splits supported headings and items; a newly selected empty bullet can return to a paragraph. Ordinary closed top-level fenced code can be edited. Computer Use exercised a simple nested child edit and Enter, then saved and reopened it. Plain nested list and checklist items are now editable and toggleable, including nonempty parents; splitting a parent with children and formatted nested items still require source mode; selecting an unsupported nested item offers source guidance.

Pasting multiple nonempty plain lines into an existing supported paragraph is supported. Blank lines and formatted text still require source mode. Plain nonempty multiline paste into a new paragraph insertion field is implemented and has automated and extension-host coverage described below. Blank visual spacing created in an empty paragraph field does not survive reopening Markdown. Concurrent external changes not yet loaded into VS Code remain a limitation. The full task remains in progress.

## Scope and fallback decision

Prioritize predictable Enter and continued typing for newly created and reopened simple top-level bullet and checklist items. Allow safely supported simple nested children; retain unsupported nested structures unchanged and offer source mode. Do the same for other unsupported Markdown rather than silently converting it. Confirm behavior after save and reopen in the actual extension host.

An unsupported nested item offers source-editing guidance when selected; Computer Use verified the explanation and Source button with nested Markdown and Mermaid preserved.

## 0.1.22 handover

Supported paragraphs, headings, simple lists and nested child bullets, checklist toggles, code blocks, and bounded multiline plain-text paste shipped in [0.1.22](https://github.com/ebrAIn-Lab-3B/Weaver/releases/tag/v0.1.22) via [PR #331](https://github.com/ebrAIn-Lab-3B/Weaver/pull/331). Remaining: decide and implement splitting nested parents and formatted-block editing and multiline paste with blank lines; source mode remains available. Plain multiline paste in a new paragraph insertion field has since been implemented as recorded below.

Splitting nested parents, formatted nested items, and blank-line paste remain unimplemented. Verification of the supported paths across the complete local authoring journey and pending-edit transitions also remains incomplete; see TASK-125 and TASK-127.


## Multiline paste in a new paragraph field (2026-11-19)

The rendered editor now accepts bounded plain nonempty lines in a new paragraph insertion field using the same queued split and draft-preservation path as an existing paragraph. Automated webview and host-handler integration tests exercise a three-line paste and acknowledgement sequence between surrounding blocks. Markdown syntax, blank lines, other insertion kinds, pending operations and unsupported cases still use the source fallback. `npm.cmd run check` and the existing full test suite passed; the added host-handler integration test also passed. A VS Code development-host recheck is outstanding: after the host reload, the Computer Use helper reported that the foreground window did not report a process ID.

A follow-up automated webview check typed into the final provisional paragraph before any paste acknowledgement arrived, then delivered the queued acknowledgements; the final edit retained that input. The multiline webview and host-handler regression suites passed (32 tests). This is simulated timing, not a real VS Code or Korean IME result.


## Nested checklist leaves (2026-11-19)

Plain nested checklist leaves, including empty items, can now be edited and toggled using the same exact-line and document-version checks as other list edits. Automated tests cover source mapping, empty leaves, checkbox toggling followed by text editing through the host message handler, preservation of parent and peer items, and rejection of nested parents and fenced or quoted lookalikes. At the time of this leaf check, nested items containing children and formatted nested content used source mode; the parent line follow-up below extends the former. An initial Computer Use attempt could not reopen the development host; the later successful extension-host check is described below.

After the nested checklist change, `npm.cmd run check` and the full `npm.cmd test` passed (606 Markdown, 122 GitHub, 248 CLI tests).


## Nested parent line edits (2026-11-19)

Plain nonempty nested list items with children can now be edited without rewriting the child structure; nested checklist parents can also be toggled. A webview/host-handler integration test toggles and edits a parent and checks that its child and sibling remain unchanged. Enter on a parent with children remains unavailable in rendered mode and leaves the source unchanged. This check was automated; the later VS Code save/reopen result is described below.

After the nested parent change, `npm.cmd run check` and the full `npm.cmd test` passed.


## VS Code extension-host recheck (2026-11-19)

On Windows with VS Code 1.147.0, Computer Use used the rebuilt development extension in a separate local Restricted Mode workspace and isolated profile. In a nested-list fixture it checked a parent and a leaf, edited the parent text, saved, closed, and reopened; the checked states and edited text remained, and the child and peer list structure was intact in the saved Markdown. In a separate file, it copied three nonempty plain lines from the VS Code text editor, pasted into a new paragraph insertion field, typed ` plus` on the final paragraph, saved, closed, and reopened. All three paragraphs and the additional text remained in the rendered document and Markdown file. This does not cover formatted nested editing, blank-line paste, real Korean IME after the latest changes, or deliberately delayed responses.

The successful host was launched with a separate profile and its stdout and stderr redirected to files while its launcher stayed alive. The earlier disappearing-window attempt did not establish a root cause.


## Unsupported paste fallback (2026-11-19)

In the Windows VS Code 1.147.0 development host, Computer Use copied `Alpha`, a blank line, and `Beta` from a temporary source file and pasted into a new rendered insertion field. Weaver displayed the source-mode guidance and did not change the existing target document; the saved Markdown remained unchanged. The English and Korean guidance was clarified to refer to the particular unsupported paste, since nonempty plain multiline paste is supported. `npm.cmd run check` and the focused i18n and multiline-paste tests passed. This is fallback verification, not implementation of blank-line paste.
