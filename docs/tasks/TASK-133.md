---
id: TASK-133
type: task
title: Diagnose and guide repair of task registration gaps
requirement: REQ-024
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/395
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
assignee: codex
criteria: [AC-002, AC-004, AC-005, AC-010, AC-011]
---

# Diagnose and guide repair of task registration gaps

## Dependencies

TASK-131 design; coordinate shared recovery behavior with TASK-132.

## Acceptance criteria

- Produce deterministic rule-based findings without requiring an AI model or agent service; explain unresolved cases without guessing intent.
- Extend existing mismatch diagnostics and safe repair guidance for missing or invalid Issue links, Project membership, required state and conflicting projections for both process sources.
- Show the effective process source, mapping origin and actual Project Status options; distinguish unmapped and ambiguous values without equating similar names. Cover missing Project membership and missing status on existing Issues, including closed Issues.
- Track completeness for Project item pages and nested label, PR and evidence pages; incomplete or inaccessible reads are unknown, never confirmed absence.
- Surface shared Issue references for review without declaring them erroneous or automatically changing links; preserve established repair tiers and existing statuses.
- Test complete and partial reads, inaccessible sources, shared Issues, custom labels and board mappings, distinct Backlog/Todo options, and truncated nested pages; verify suggestions do not equate failed reads with absence. Catalog English and Korean messages.

## Tests and completion evidence

Linked implementation PR and passing diagnostic and repair tests, including uncertainty and shared-Issue cases; record unsupported repair paths.

Status: planned. No implementation or completion evidence has been recorded.
