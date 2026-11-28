---
id: TASK-134
type: task
title: Guide agents through task registration and verification
requirement: REQ-024
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/396
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
assignee: codex
criteria: [AC-001, AC-003, AC-006]
---

# Guide agents through task registration and verification

## Dependencies

TASK-131; final guidance depends on TASK-132 and TASK-133.

## Acceptance criteria

- Identify where agents discover repository instructions and the existing Weaver CLI/editor workflow; propose a portable guidance location and update it for the delivered path.
- Explain how to create, inspect each result, verify configured state and recover incomplete work, including PR versus merged file and permissions failures; avoid prescribing an organization profile.
- Test the documented commands or equivalent workflow against a controlled fixture and record observed results and current limitations.

## Tests and completion evidence

Documentation PR, reproducible guidance checks and evidence of discovery by an agent workflow; explicitly identify any untested environment.

Completion review: the entry point and portable contract cover the discovery and guidance criteria; the controlled guidance test and the real board- and label-source exercises below cover the documented workflow. The implementing agent followed the entry point, while discovery by an independently operated agent and other host environments were not tested. [PR #423](https://github.com/ebrAIn-Lab-3B/Weaver/pull/423) records the post-merge evidence and the proposed completion for review.

Status: complete, subject to acceptance of the evidence and limitations below. The repository's [agent entry point](../../AGENTS.md) links to the product-neutral [registration, verification and recovery procedure](../onboarding/agent-contract.md#register-verify-and-recover-a-task). `npm test -w @ebrain-lab/weaver-cli -- --run test/registrationGuidance.test.ts` passed: it discovers the link and section, runs the documented process read, an unapproved task creation plan and reconcile against a controlled fixture, and observes no write. Other CLI fixtures exercise partial registration recovery. This is a simulated discovery and workflow check, not an independent agent run. [PR #418](https://github.com/ebrAIn-Lab-3B/Weaver/pull/418) delivered the guidance to main; [PR #421](https://github.com/ebrAIn-Lab-3B/Weaver/pull/421) delivered the placeholder fix and subsequent evidence to main.

On 2026-11-28 KST, using the private verification checkout and Project #7 described in [TASK-135](TASK-135.md), the current compiled CLI ran `task create` for a synthetic title, REQ-001, assignee `probe-agent` and configured `band=alpha`, without `--approve`. It returned exit 4 and four `unconfirmed` actions: Issue creation, Project addition, configured Project field and file PR. The plan exposed a provisional TASK-011 and reservation refs; neither the plan nor these IDs establish allocation or a created registration. The same fixture's read-only process, evidence and reconcile observations are recorded under TASK-135. The complete controlled approval, interruption and recovery workflow for this exact current plan remains outstanding; no action from it was approved or executed.

A live label-source registration exposed a stale `No tasks yet.` placeholder beside the generated task entry. The shared task-list authoring helper now replaces that standalone placeholder when adding the first task, while retaining adjacent text. `npm test -w @ebrain-lab/weaver-markdown -- --run test/taskDraft.test.ts` and `npm run check` passed; this is a targeted authoring fix, not an additional live registration run.

On 2026-11-28 KST, the compiled fix was exercised against the isolated private label-source fixture. [Fixture PR #5](https://github.com/blcktgr73/weaver-label-reconcile-test-20261128/pull/5) added REQ-002 with the standalone placeholder. Weaver created [Issue #6](https://github.com/blcktgr73/weaver-label-reconcile-test-20261128/issues/6), added it to Project #8, and opened [fixture PR #7](https://github.com/blcktgr73/weaver-label-reconcile-test-20261128/pull/7); its diff replaced the placeholder with the task link. After the authorized squash merge `0764987dfe636a97683f89de779e28b49e51dea6`, a fresh resume observed the merged files and Project item and returned `done` with no actions. The fixture has no configured CI or formal human review; this verifies registration and document output, not task work.

Update: [PR #418](https://github.com/ebrAIn-Lab-3B/Weaver/pull/418) was merged into main as `081d712`. The subsequently approved TASK-011 board-source registration and recovery were exercised through Issue #21, Project membership, configured field, [fixture PR #22](https://github.com/blcktgr73/weaver-registration-verification-20261128-025546/pull/22) merge and a fresh resume; see [TASK-135](TASK-135.md) for observations and limits. The earlier paragraph describes the initial unapproved plan, not the final state. The discovery test remains simulated; no independent agent discovery is claimed.

A later 2026-11-28 KST guidance exercise followed the `AGENTS.md` link to this contract, read the effective process and tried the original TASK-002 arguments with `--resume-issue` for fixture Issue #6. After fixture PR #9 changed the process projection, the current CLI returned `cli.task-create.resume-unsafe` and did not offer actions. Separate GitHub reads still showed Issue #6 open with its labels, Project Status `Todo`, and fixture PR #7 merged; the local default-branch task file retained its link. The process change is a plausible intent mismatch, but this error does not name which safety check failed. The refusal is not a failed task registration or permission to create a duplicate; earlier successful resume was observed before the process change. This was the implementing agent following the guidance, not an independent agent test.

On 2026-11-28 KST, the PR #421 branch merged main at `ff81c6d`, combining the placeholder fix with merged PRs #419 and #420. `npm run check`, `npm test` (711 Markdown, 187 GitHub, 384 CLI tests), `npm run package`, and the VS Code 1.148.0 mocked `evidence-menu` and `reconciliation` host cases passed. The resulting unmerged VSIX has SHA-256 `8456d5b156e065385fd656319dfef060bbc8d0ea3395547926b36ce556cb2f54`. These tests cover the combined source and mocked host behavior, not physical UI interaction or a published release.
