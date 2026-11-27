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

Status: implementation and verification in progress; final review is outstanding.

Completion evidence gap (2026-11-28): GitHub reported Issue #395 open with zero closing pull request references. This repository's process requires a merged closing PR for Verified. The merged implementation PRs listed below are evidence of implementation, but do not by themselves establish that required closing relationship. Do not infer Verified from their merge or from Project Status.

## Work in progress (2026-11-27 KST)

The [reconciliation design](../architecture/task-reconciliation-design.md) records the current safety contract and limits. Implementation and verification are in progress; this does not establish task completion.

## Verification evidence (2026-11-27 KST)

`npm run check` and `npm test` passed. Targeted tests cover configured and legacy status mappings, shared Issues, incomplete and inaccessible reads, approval binding, a selected-Project-only write, stale configuration, a failed post-write read, and a stateful mock CLI plan/approve/recheck/retry flow. `node scripts/test-author-host.js reconciliation` passed in VS Code 1.148.0 with mock GitHub data. The [design and verification record](../architecture/task-reconciliation-design.md) describes the live isolated Project write, board-ahead and repeat checks, cleanup, and remaining limits.

The live label-source check exercised a Project status write. A separate board-source read-only check exposed an unexpected Issue reopen; the Issue was restored, but its close time and event history changed. The cause is unconfirmed, as recorded in the design. Error paths were tested with fixtures; the installed production extension and physical clicks were not checked. GitHub field updates are not atomic compare-and-set, so a concurrent change after the final read remains possible. [PR #400](https://github.com/ebrAIn-Lab-3B/Weaver/pull/400) was merged with passing CI; no GitHub review was recorded. Remaining acceptance checks and final review are required before marking this task complete.

The local `packages/markdown/test/examples/task-133` scenarios exercise missing and invalid links, missing and unknown Project membership, shared Issues, both status sources, distinct Backlog and Todo values, and incomplete PR evidence and missing or conflicting Project status on a closed Issue. All seven `task133Scenarios.test.ts` tests passed. These use fictional files and in-memory cards and do not establish live GitHub permission, pagination, or automation behavior. The `examples` directory is excluded from normal workspace discovery so these fictional TASKs are not treated as repository artifacts.

[PR #402](https://github.com/ebrAIn-Lab-3B/Weaver/pull/402) corrected the CLI's distinction between unreadable and missing Status options. [PR #403](https://github.com/ebrAIn-Lab-3B/Weaver/pull/403) added diagnosis of Project status gaps on closed Issues using the actual status label; reconciliation reports these cases without offering a status write. Both were merged with passing CI. A read-only reconciliation on the real ebrAIn.lab Kanban after PR #403 exited successfully, but did not encounter a closed-Issue status gap, so that scenario remains verified with fixtures rather than a live reproduction.

An additional read-only check of ebrAIn.lab Kanban on 2026-11-27 returned 156 Issue items through both `gh project item-list --limit 1000` and `weaver list`, spanning more than Weaver's 100-item Project page. The normalized Issue URL lists matched without differences; the Project had no non-Issue items in this check. `weaver reconcile` returned a plan and 17 incomplete-PR-reference reports; no actions were approved. This supports this particular multi-page read, but does not prove snapshot consistency under concurrent changes or exercise restricted access.

For one of those reports, a separate GitHub GraphQL read of [Issue #169](https://github.com/ebrAIn-Lab-3B/Weaver/issues/169) returned one of one closing references but only three of 22 cross-reference events with the same bounded query. This confirms why that Issue's PR-reference warning was appropriate; it does not independently validate every warning or identify which events refer to pull requests.

On 2026-11-28, a read-only `readProject` request to the actual GitHub API with a deliberately invalid test token returned `project.unauthorized`, not a successful empty Project result. This tests rejected authentication only; a valid identity with restricted Project permissions and other failure modes remain covered by fixtures rather than this live check.

The current workspace packaged successfully as `weaver-0.1.25.vsix` and installed into a separate temporary VS Code extension directory; the installed extension bundle hash matched the newly built bundle. The user's existing 0.1.25 extension bundle had a different hash and lacked the `status-source-needs-decision` and `pulls-incomplete` diagnostic identifiers present in the new build. The isolated installation alone does not verify interactive behavior, and the user's existing extension was not replaced.

The repeatable `node scripts/test-author-host.js packaged-overview` test loaded that installed VSIX directory using `WEAVER_PACKAGED_EXTENSION_PATH`, activated the packaged extension, invoked `weaver.openOverview`, and observed a Weaver webview tab in VS Code 1.148.0. The existing `node scripts/test-author-host.js reconciliation` test also passed after the runner change. The packaged test is an activation and opening smoke test on an empty temporary workspace; it does not inspect the rendered diagnosis or simulate a physical click.

On 2026-11-28 a separate isolated extension-host probe loaded a newly packaged extension against the actual Weaver workspace and read the live ebrAIn.lab Kanban. The probe supplied the existing `gh` token in memory through a test-only authentication hook and intercepted the webview API to inspect generated HTML. It found the actual Project title, `Todo`, `In Progress`, `Done` options, and the status-rules section. It did not test the normal VS Code sign-in flow, screen rendering, or physical interaction; the probe and its result remain in a temporary local directory, and no token was written to that result.

A repeatable opt-in version of this live read-only probe, `node scripts/test-author-host.js packaged-live-overview`, also passed in VS Code 1.148.0 using the workspace and expected Project values supplied through environment variables. With an explicitly supplied expected diagnostic it verified that the generated HTML included the incomplete-PR-reference warning for [Issue #169](https://github.com/ebrAIn-Lab-3B/Weaver/issues/169). Instructions and limitations are in `packages/markdown/test/examples/task-133/README.md`.

The user-approved disposable [Issue #86](https://github.com/blcktgr73/poc-sandbox/issues/86) and temporary Project #6 supplied a live `board-status` diagnosis check on 2026-11-28. Missing Project membership and an unset authoritative Status were detected, a restored `Todo` was reread without a remaining status warning, and cleanup was verified. The initial add returned a verification failure even though the card appeared on a later read. The [design record](../architecture/task-reconciliation-design.md) records that uncertainty, cleanup and the subsequent local fix; this is not evidence that every GitHub failure mode was exercised live.
