---
id: TASK-133
type: task
title: Diagnose and guide repair of task registration gaps
requirement: REQ-024
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/395
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
assignee: codex
criteria: [AC-002, AC-004, AC-005]
---

# Diagnose and guide repair of task registration gaps

## Dependencies

TASK-131 design; coordinate shared recovery behavior with TASK-132.

## Acceptance criteria

- Extend existing mismatch diagnostics and safe repair guidance for missing or invalid Issue links, Project membership, required state and conflicting projections for both process sources.
- Surface shared Issue references for review without declaring them erroneous or automatically changing links; preserve established repair tiers and existing statuses.
- Test complete and partial reads, inaccessible sources, shared Issues, custom labels and board mappings; verify suggestions do not equate failed reads with absence. Catalog English and Korean messages.

## Tests and completion evidence

Linked implementation PR and passing diagnostic and repair tests, including uncertainty and shared-Issue cases; record unsupported repair paths.

Status: planned. No implementation or completion evidence has been recorded.
