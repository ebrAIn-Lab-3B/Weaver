# DEC-031: Explicit label-sourced Project status projection

- Status: proposed for review
- Date: 2026-11-27
- Related: `REQ-024`, `TASK-133`, `TASK-136`; extends [DEC-015](DEC-015-process-configuration.md), retains [DEC-007](DEC-007-central-project-is-configuration.md), [DEC-008](DEC-008-agent-identity-and-write-confirmation.md), and the board-ahead boundary of [DEC-012](DEC-012-steward-first-version.md)

## Context

A repository can use labels for its authoritative column while its Project has status options whose names differ from the historic fixed projection. Some Projects have both `Backlog` and `Todo`; their names alone do not declare equivalence. The current fixed mapping cannot express a team-selected projection, and a mismatch alone cannot establish intent.

## Proposal

1. Add an optional `columns.projection` mapping from Weaver column to exact Project Status option for label-sourced processes. An explicit map replaces the legacy mapping in its entirety; omitted columns are unmapped. Retain the fixed legacy projection only when the field is absent, preserving existing repository behavior. `columns.board` remains the board-source option-to-column mapping.
2. Display the effective source, mapping, its origin and the actual Project options. Do not infer an option or order from similar names. A missing or ambiguous mapping or inaccessible process prevents an automatic repair; present a decision path instead.
3. Where the configured projection establishes a permitted behind or empty board state, show the selected Project, Issue, prior and proposed Status and require confirmation. Re-read process, Issue and Project before writing, update only that Project item, and re-read after. A board ahead remains report-only under DEC-012; changing that rule requires another reviewed decision. Never derive Verified from Issue closure or Project Done alone.
4. GitHub does not offer an atomic conditional Project field update in this path. The fresh read narrows but does not eliminate the concurrent-write window. Report this residual limit and uncertain post-write results; retry only after a fresh read.

## Review and compatibility

This proposed decision accompanies implementation and is not evidence of an accepted maintainer decision. Existing processes without `projection` retain the old mapping; a team that wants a different map must commit and review its own process change. This decision does not impose a PALab-specific option, label or board on other organizations.
