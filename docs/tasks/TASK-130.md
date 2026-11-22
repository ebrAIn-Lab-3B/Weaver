---
id: TASK-130
type: task
title: Link explicit human decision waits to their task
requirement: REQ-023
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/388
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
assignee: codex
criteria: [AC-002, AC-004]
---

# Link explicit human decision waits to their task

## Acceptance criteria

- An open card whose linked task explicitly records `status: needs-human-decision` links its existing decision-wait indicator to the task file, including when no participant is recorded.
- A closed Issue does not show a current decision wait solely from a retained task status.
- Missing task paths produce no invented source link; other notices remain unchanged. English and Korean text remain available.
- The slice is read-only and policy-neutral. Verify status and rendering behavior and record remaining host and source limitations.

This slice uses the existing task status, rather than inferring a request from Project values, Issue labels, participants or PRs. It does not complete REQ-023's broader action or review evidence criteria.

## Verification evidence

`npm run check` and `npm test` passed. The tests cover an open and a closed Issue with an explicit decision-wait task status, both languages, a task path that needs HTML escaping, no participant, an absent task path, and unrelated notices. The link uses the existing `openFile` message and workspace file lookup; a physical click in the installed extension has not yet been independently checked. No arbitrary Issue text or organization-specific Project field is interpreted as a decision request.
