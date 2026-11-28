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

Status: in progress. The repository's [agent entry point](../../AGENTS.md) links to the product-neutral [registration, verification and recovery procedure](../onboarding/agent-contract.md#register-verify-and-recover-a-task). The CLI suite exercises task creation and partial recovery fixtures. A focused discovery and guidance check, controlled workflow observation and documentation PR remain outstanding.
