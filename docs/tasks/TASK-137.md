---
id: TASK-137
type: task
title: Diagnose task completion and verification evidence separately
requirement: REQ-024
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/399
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
assignee: codex
criteria: [AC-004, AC-005, AC-009]
---

# Diagnose task completion and verification evidence separately

## Dependencies and scope

Follow TASK-131's investigation and coordinate with TASK-133's diagnostic and TASK-135's end-to-end verification. Extend existing PR evidence from TASK-114 and the collaboration view under REQ-023; do not build a parallel handoff record. This task concerns observation and provenance, not changing the meaning of Verified or inventing a new organization-specific review or test contract.

## Acceptance criteria

- For existing linked tasks, including closed Issues, distinguish current Issue state, configured status, merged PRs, GitHub's closing relationship, checks, independent test records and reviews. Show source links and revision/read time where available. No PR association, no check, failed or partial retrieval and an unavailable independent record are distinguishable.
- Identify a merged PR that references work but is not known to close the Issue even when the Issue is closed. Do not infer closing, CI success, independent testing, review or Verified from Project Done, closure, merge or a bare self-reported test. Surface conflicting claims and manual evidence as attributed claims; do not infer who independently tested without evidence.
- Respect configured evidence policy and exceptions without silently marking Verified or creating evidence; link to the source and provide the next manual investigation or existing confirmed action. A shared Issue remains a reviewable association.
- Test closed Issue with merged non-closing PR, no CI, self-reported and conflicting independent test claims, no formal review, explicit exception, inaccessible or paginated evidence and shared Issues. Test both column sources and English/Korean messages.

## Tests and completion evidence

Link implementation PR, targeted automated tests and a controlled end-to-end evidence review including source and revision provenance, pagination/access limits and outstanding warnings. Do not claim an independent test or formal review solely from a reported outcome.

Status: in progress. The existing detailed evidence reader now queries GitHub's repository-qualified closing relationship rather than treating a PR text keyword as proof; failed and incomplete relationship reads remain unknown. Targeted tests cover a cross-repository same-number reference, unavailable and truncated reads, and pagination. Completion still requires the broader task/Issue diagnosis, review and independent-test provenance, policy and exception cases, controlled end-to-end evidence review, and a linked implementation PR.
