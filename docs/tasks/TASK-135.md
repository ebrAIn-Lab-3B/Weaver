---
id: TASK-135
type: task
title: Verify task registration and recovery end to end
requirement: REQ-024
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/397
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
assignee: codex
criteria: [AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011]
---

# Verify task registration and recovery end to end

## Dependencies

TASK-132, TASK-133, TASK-134, TASK-136 and TASK-137.

## Acceptance criteria

- Run the automated matrix and an isolated end-to-end registration and verification flow for both configured column sources; inspect requirement, file PR/merge state, Issue, Project item and configured status.
- Exercise partial failures, reruns and inaccessible sources in controlled fixtures; confirm no duplicate artifacts and review a deliberately shared Issue without treating sharing as an error.
- Exercise confirmed resolution of existing status divergence, including board-ahead and stale-read cases, and verify repeat execution is a no-op.
- Verify the end-to-end diagnosis, approval, repair and recheck without an AI service; identical fixtures yield identical findings and proposals, and ambiguous cases remain unresolved.
- Exercise missing cards, actual options Backlog and Todo, closed Issue with merged non-closing PR, absent CI, conflicting independent test claims, approval/cancellation and same-scope post-action recheck; include failed and truncated pages. Verify no unsupported Verified claim.
- Record commands, outputs, artifact links, observed permissions, cleanup and untested boundaries; review all REQ-024 criteria before proposing requirement completion.

## Tests and completion evidence

Linked test results and real or isolated Project observations, including limitations and requirement review. A fixture alone must not be described as live verification.

Status: in progress. On 2026-11-28 KST, `npm run check` and `npm test` passed on the work branch: 705 Markdown, 169 GitHub and 370 CLI tests. The suites include configured creation and recovery, deterministic reconciliation and stale reads, shared-Issue diagnosis, evidence observations and guidance discovery. These are controlled fixtures, not an independent test or a live end-to-end run of the combined implementation.

Earlier isolated GitHub registration observations for both column sources, including merged files, are recorded in [TASK-132](TASK-132.md); status-resolution observations and their cleanup and limits are recorded in [TASK-136](TASK-136.md) and the [reconciliation design](../architecture/task-reconciliation-design.md). They are evidence for their exercised versions, not a substitute for checking the current combined flow. The new read-only TASK-137 probe against Weaver is recorded in [TASK-137](TASK-137.md). A current integrated run, complete failure and cancellation matrix, evidence review and requirement-by-requirement audit remain outstanding.

On 2026-11-28 KST, a fresh temporary clone of the existing private fixture at `dab4e0c6c790083cf7511196befa9e5d2d1c4160` was configured for the retained private Project #7. The current compiled CLI read `process`, ran `evidence inspect TASK-010`, and twice planned `reconcile` without approving any action. Issue #18 was open, Project membership was present, the process source was `labels`, and Issue label `state:queued` and Project Status `Todo` mapped to Backlog. Timeline, PR inventory and Issue comments were readable; the diagnostic reported a merged non-closing PR, no check runs and no formal review. Both reconciliation plans had the same seven action IDs and eight report kind/subject pairs; every action remained unconfirmed. This was a read-only comparison of those observed facts, not a proof of determinism under concurrent change or a live repair. The temporary clone and its locally generated JSON outputs remain in the system temporary directory; the pre-existing private Issue, PR, Project and reservation resources were not changed.

The `rule-based status reconciliation flow` controlled CLI fixtures also compare two identical plans and decline an interactive board-status repair, checking that no mutation is sent without invoking an AI service. A current live board-source registration and full combined acceptance review remain outstanding; the earlier board-source registration record is historical because the private fixture process now uses labels.

On 2026-11-28 KST, a separate temporary clone of `blcktgr73/poc-sandbox` at `2303452` was configured for the existing PALab Ops Project #1. The current CLI's read-only `evidence inspect` for [Issue #18](https://github.com/blcktgr73/poc-sandbox/issues/18) observed `columns.source: board-status`, Project membership, Status `Done`, configured placement Verified and a closed Issue. For disposable [Issue #86](https://github.com/blcktgr73/poc-sandbox/issues/86), the same command observed confirmed absence from that Project and a closed Issue, with no inferred placement. Both reads reported the PR inventory and timeline as readable. This is a live read of current board-source diagnosis, not an assertion that either Issue is independently verified or a new board-source registration or repair. No action was approved and no remote write was made; the temporary clone remains under the system temporary directory. The private board-source registration observations recorded in TASK-132 are earlier, not a current rerun.
