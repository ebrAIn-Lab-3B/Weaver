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

## Tasks

- `TASK-131` Investigate and design recoverable task registration — [GitHub Issue #393](https://github.com/ebrAIn-Lab-3B/Weaver/issues/393)
- `TASK-132` Create tasks with configured initial state and resumable steps — [GitHub Issue #394](https://github.com/ebrAIn-Lab-3B/Weaver/issues/394)
- `TASK-133` Diagnose and guide repair of task registration gaps — [GitHub Issue #395](https://github.com/ebrAIn-Lab-3B/Weaver/issues/395)
- `TASK-134` Guide agents through task registration and verification — [GitHub Issue #396](https://github.com/ebrAIn-Lab-3B/Weaver/issues/396)
- `TASK-135` Verify task registration and recovery end to end — [GitHub Issue #397](https://github.com/ebrAIn-Lab-3B/Weaver/issues/397)

- `TASK-136` Resolve recurring status divergence with explicit choices — [GitHub Issue #398](https://github.com/ebrAIn-Lab-3B/Weaver/issues/398)

## Evidence policy

This requirement is draft. A design or issue registration is not implementation evidence. Record tests, real observations, access limitations and links in each task; only mark the requirement verified after its acceptance criteria and remaining gaps are reviewed.

## Registration evidence (2026-11-27 KST)

GitHub reads confirmed Issues #393–#397 are open, carry `task` and `status:backlog`, and each has an item on [ebrAIn.lab Kanban](https://github.com/orgs/ebrAIn-Lab-3B/projects/1) with `Status=Todo`. Weaver's repository process uses labels and maps Backlog to `status:backlog`; Todo is the matching board projection. At the time of this registration check the REQ and TASK documents and this task list were local working-tree changes, not yet available on the default branch. HealthBridge Issues #26–#29 were separately read with `status:backlog`; their Project state was reported by the user and was not independently checked here. This registration is not evidence of product implementation.

On 2026-11-27 KST, TASK-136 was added for recurring status divergence beyond registration. GitHub Issue #398 was added to the same Project with `task`, `status:backlog` and Project `Todo`; at the time of the check the task document was a local change not yet published. Existing reconcile already proposes bringing a behind board up to its label, while a board ahead is report-only under DEC-012; this task must retain that boundary unless a reviewed decision changes it.
