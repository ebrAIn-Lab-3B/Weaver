---
id: REQ-024
type: requirement
title: Register and recover traceable tasks across configured sources
status: draft
owner: ebrAIn.lab
story_ids: [US-068]
repository: ebrAIn-Lab-3B/Weaver
github_project: ebrAIn.lab Kanban
---

# Register and recover traceable tasks across configured sources

## Problem and outcome

A task split can stop after local files exist, leaving no Issue or Project card; a manually added card can still lack the configured source of its Weaver status. In HealthBridge, TASK-011–014 / Issues #26–29 were manually brought to Project Backlog and `status:backlog` (reported by the user on 2026-11-27). HealthBridge's default-branch process uses `columns.source: labels`, so Project Status alone does not establish Weaver placement. These are incident observations, not verification of a fix.

Build on [REQ-007](REQ-007-steward-agent-for-the-kanban.md) and TASK-046/053 for creation and repair, [REQ-006](REQ-006-overview-kanban-across-repositories.md) for mismatch reporting, and [REQ-010](REQ-010-organization-defined-task-contract.md) for configured fields. Their existing evidence does not establish the recovery and configuration guarantees below. Current `planTaskCreate` and `planLinkIssue` hard-code `status:backlog`; the latter searches existing Project cards before creating an Issue. Do not assume that search finds an Issue outside the Project. Preserve DEC-007, DEC-008, DEC-012 and DEC-016; the task file remains repository source of truth and file changes follow the established review path.

## Acceptance criteria

- **AC-001 — Linked registration.** Given a requirement, task details, target repository, configured Project and valid process, creation yields mutually traceable requirement task entry, task file, Issue and Project item. Show the links and distinguish proposed file PR from merged files; do not report registration fully complete while any required step is pending or failed.
- **AC-002 — Configured state.** Resolve initial column and its writable representation from the target repository's effective process. With `labels`, apply the configured initial status label; with `board-status`, set the corresponding Project Status. Where a board projection is required or configured, detect disagreement. Missing, ambiguous or unwritable mappings are actionable failures, never silently guessed. No organization-specific labels or fields are assumed.
- **AC-003 — Recovery.** Report each step as succeeded, failed, pending or unavailable with identifiers and actionable cause in human and machine-readable output. After interruptions or uncertain responses, re-read authoritative sources and safely resume only missing steps; repeated or concurrent attempts must not create duplicate Issues, Project items or labels. If unique identity or the outcome cannot be established, stop and explain rather than create another. Preserve confirmation and PR boundaries.
- **AC-004 — Diagnosis.** Inspect existing tasks and Issues for absent or invalid Issue links, absent Project membership, missing configured status and conflicting status representations; identify the source and offer a safe resolution or explain the manual decision. Detect multiple tasks referencing one Issue as a reviewable shared association, not automatically an error, and never relink or split it without a decision. Do not overwrite an existing valid status merely to impose an initial state.
- **AC-005 — Uncertainty.** Distinguish confirmed absence from access denied, partial results, failed GitHub or process reads and stale observations. Show the affected source and retry path; do not offer a destructive fix or create duplicates based on an incomplete read. Support both configured column sources and independent repositories.
- **AC-006 — Agent guidance.** Give agents a discoverable, product-neutral path to use Weaver creation and verification, inspect step outcomes and follow recovery without treating locally written files as completed registration. Explicitly describe current limitations until the implementation lands and preserve existing consent rules.
- **AC-007 — Evidence.** Automated tests cover both sources, custom mappings, partial failures at every write boundary, reruns, ambiguous identity, shared Issues, authorization and failed reads. Verify the complete flow on an appropriately isolated real or test Project, including observed links and statuses, and record limitations and English/Korean user-facing messages. Do not claim full verification from unit tests alone.

- **AC-008 — Resolve recurring status divergence.** Beyond initial registration, show the current Issue label, Project Status, configured authoritative source and mapped column, and offer applicable, explicit resolution choices for missing or divergent state. A confirmed choice must identify each change and its effect, use the configured mappings, retain the existing evidence and confirmation rules, and re-read before writing to detect stale or inaccessible data. An ambiguous mapping, concurrent change or unknown source stays unresolved with a reason. Repeating a successful resolution makes no further change. A Project move alone must not silently change the authoritative label or close an Issue. Support both column sources without inventing an organization policy.

- **AC-009 — Completion evidence.** For the same task and Issue, distinguish Issue state, current configured placement, merged and unmerged PRs, GitHub closing association, CI/check results, independent test evidence and review evidence, with sources, revisions and read time where available. A merged PR or Project Done is not proof that a PR closed the Issue, that CI or an independent test passed, that a review occurred, or that work is Verified. Clearly show missing, conflicting, stale, unverified or inaccessible evidence. Do not create evidence or infer independent test execution from a self-report. Keep existing explicit exception and confirmation policies.
- **AC-010 — Inspect, act and recheck.** Display actual Project Status options and the effective configuration and mapping, including its origin and unsupported or ambiguous mappings; similar option names do not establish equivalence. For each permitted repair show target and before/after values, obtain approval for each action, then report per-step outcome and re-read the same scope to show resolved findings, remaining warnings and newly unavailable or stale data. A partial failure or incomplete page must never be represented as a clean result.

- **AC-011 — Deterministic rule-based operation.** Diagnosis, repair planning, approved execution and same-scope recheck work without an AI model or agent service, using the effective process configuration, complete observed facts and explicit rules. For the same facts and configuration, the same rules produce the same findings and proposals. Missing policy, conflicting facts, ambiguity or incomplete reads remain unresolved with an explanation and a human decision path; do not guess intent. Optional AI assistance must not be required to run the workflow or bypass its approvals and evidence safeguards.

## Tasks

- `TASK-131` Investigate and design recoverable task registration — [GitHub Issue #393](https://github.com/ebrAIn-Lab-3B/Weaver/issues/393)
- `TASK-132` Create tasks with configured initial state and resumable steps — [GitHub Issue #394](https://github.com/ebrAIn-Lab-3B/Weaver/issues/394)
- `TASK-133` Diagnose and guide repair of task registration gaps — [GitHub Issue #395](https://github.com/ebrAIn-Lab-3B/Weaver/issues/395)
- `TASK-134` Guide agents through task registration and verification — [GitHub Issue #396](https://github.com/ebrAIn-Lab-3B/Weaver/issues/396)
- `TASK-135` Verify task registration and recovery end to end — [GitHub Issue #397](https://github.com/ebrAIn-Lab-3B/Weaver/issues/397)

- `TASK-136` Resolve recurring status divergence with explicit choices — [GitHub Issue #398](https://github.com/ebrAIn-Lab-3B/Weaver/issues/398)

- `TASK-137` Diagnose task completion and verification evidence separately — [GitHub Issue #399](https://github.com/ebrAIn-Lab-3B/Weaver/issues/399)

## Evidence policy

This requirement is draft. A design or issue registration is not implementation evidence. Record tests, real observations, access limitations and links in each task; only mark the requirement verified after its acceptance criteria and remaining gaps are reviewed.

## TASK-131 and TASK-132 implementation evidence (2026-11-28 KST)

[PR #416](https://github.com/ebrAIn-Lab-3B/Weaver/pull/416) was merged at `912dd1b0c8a6fa8f4f75c6b5efbff547095cfe7f`; [CI run 46056736052](https://github.com/ebrAIn-Lab-3B/Weaver/actions/runs/46056736052) passed on its head. The user explicitly approved [DEC-032](../decisions/DEC-032-recoverable-task-registration.md), including the retained-ref and manual handoff limitations. [TASK-131](../tasks/TASK-131.md) records the design and [TASK-132](../tasks/TASK-132.md) records automated coverage and isolated real GitHub observations for both column sources. No formal GitHub code review or independent test run is inferred from those facts. This evidence covers these two tasks, not the remaining REQ-024 acceptance criteria or a Verified requirement status.

## Registration evidence (2026-11-27 KST)

GitHub reads confirmed Issues #393–#397 are open, carry `task` and `status:backlog`, and each has an item on [ebrAIn.lab Kanban](https://github.com/orgs/ebrAIn-Lab-3B/projects/1) with `Status=Todo`. Weaver's repository process uses labels and maps Backlog to `status:backlog`; Todo is the matching board projection. At the time of this registration check the REQ and TASK documents and this task list were local working-tree changes, not yet available on the default branch. HealthBridge Issues #26–#29 were separately read with `status:backlog`; their Project state was reported by the user and was not independently checked here. This registration is not evidence of product implementation.

On 2026-11-27 KST, TASK-136 was added for recurring status divergence beyond registration. GitHub Issue #398 was added to the same Project with `task`, `status:backlog` and Project `Todo`; at the time of the check the task document was a local change not yet published. Existing reconcile already proposes bringing a behind board up to its label, while a board ahead is report-only under DEC-012; this task must retain that boundary unless a reviewed decision changes it.

## Investigation: HealthBridge and PALab Ops (2026-11-27 KST)

The reported earlier observation was that TASK-005/#20 and TASK-006/#23 were not on the Project, and #2 and #26–#30 had Project Backlog. A later read of [PALab Ops Kanban](https://github.com/users/blcktgr73/projects/1) found both #20 and #23 on it; #20 was Done without labels, #23 Todo with `status:backlog`; #2 and #26–#30 were all Todo with `status:backlog`. These are observations at different times, not proof of how or when the earlier state changed. GitHub's Project Status options included distinct Backlog, Ready, Todo, In Progress and Done values. HealthBridge's process selects `labels` and omits `columns.board`. Current `PROJECT_STATUS_FOR_COLUMN` hard-codes Backlog to Todo in label-based mismatch checks; this is current behavior, not a configured equivalence between the Project's Backlog and Todo options.

[#20](https://github.com/blcktgr73/HealthBridge/issues/20) is closed, has no labels, and returned no closing PR association; [PR #22](https://github.com/blcktgr73/HealthBridge/pull/22) is merged and returned no closing Issue association, no reported GitHub checks and no formal review in the queried lists. The implementation report records its own test success. A [later closure comment](https://github.com/blcktgr73/HealthBridge/issues/20#issuecomment-7193326939) asserts independent test evidence, while an [earlier review comment](https://github.com/blcktgr73/HealthBridge/issues/20#issuecomment-7151542829) says the reviewer could not independently rerun it; the cited independent run was not established by this investigation. Neither Project Done nor closure establishes Verified. No HealthBridge item was changed during this investigation.

Existing `findMismatches` reports missing Project membership and label/board differences for its readable inputs, and `reconcile` proposes adding cards and some board changes with confirmation. It does not establish complete pagination for nested labels and PR lists (the Project query limits them), uses fixed board comparisons and ranks, and omits closed Issues from its merged-PR-not-linked report. Project reads paginate items and report failures, but that alone does not prove all nested data is complete. TASK-133, TASK-136 and TASK-137 cover the remaining diagnosis, resolution and evidence work; TASK-135 verifies the combined flow. [REQ-023](REQ-023-collaboration-evidence.md) remains the existing collaboration-evidence requirement and is not replaced.
