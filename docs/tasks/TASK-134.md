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

Status: in progress. The repository's [agent entry point](../../AGENTS.md) links to the product-neutral [registration, verification and recovery procedure](../onboarding/agent-contract.md#register-verify-and-recover-a-task). `npm test -w @ebrain-lab/weaver-cli -- --run test/registrationGuidance.test.ts` passed: it discovers the link and section, runs the documented process read, an unapproved task creation plan and reconcile against a controlled fixture, and observes no write. Other CLI fixtures exercise partial registration recovery. This is a simulated discovery and workflow check, not an independent agent run. [Draft PR #418](https://github.com/ebrAIn-Lab-3B/Weaver/pull/418) contains the guidance; review and merge remain outstanding.

On 2026-11-28 KST, using the private verification checkout and Project #7 described in [TASK-135](TASK-135.md), the current compiled CLI ran `task create` for a synthetic title, REQ-001, assignee `probe-agent` and configured `band=alpha`, without `--approve`. It returned exit 4 and four `unconfirmed` actions: Issue creation, Project addition, configured Project field and file PR. The plan exposed a provisional TASK-011 and reservation refs; neither the plan nor these IDs establish allocation or a created registration. The same fixture's read-only process, evidence and reconcile observations are recorded under TASK-135. The complete controlled approval, interruption and recovery workflow for this exact current plan remains outstanding; no action from it was approved or executed.

A live label-source registration exposed a stale `No tasks yet.` placeholder beside the generated task entry. The shared task-list authoring helper now replaces that standalone placeholder when adding the first task, while retaining adjacent text. `npm test -w @ebrain-lab/weaver-markdown -- --run test/taskDraft.test.ts` and `npm run check` passed; this is a targeted authoring fix, not an additional live registration run.

On 2026-11-28 KST, the compiled fix was exercised against the isolated private label-source fixture. [Fixture PR #5](https://github.com/blcktgr73/weaver-label-reconcile-test-20261128/pull/5) added REQ-002 with the standalone placeholder. Weaver created [Issue #6](https://github.com/blcktgr73/weaver-label-reconcile-test-20261128/issues/6), added it to Project #8, and opened [fixture PR #7](https://github.com/blcktgr73/weaver-label-reconcile-test-20261128/pull/7); its diff replaced the placeholder with the task link. After the authorized squash merge `0764987dfe636a97683f89de779e28b49e51dea6`, a fresh resume observed the merged files and Project item and returned `done` with no actions. The fixture has no configured CI or formal human review; this verifies registration and document output, not task work.
