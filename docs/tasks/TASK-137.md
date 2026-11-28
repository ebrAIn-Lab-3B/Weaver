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

Status: in progress. The detailed evidence reader queries GitHub's repository-qualified closing relationship rather than treating a PR text keyword as proof; failed and incomplete relationship reads remain unknown. The read-only `weaver evidence inspect` additionally reports Issue state, available configured placement and policy, shared task associations, task-file test claims and exceptions, attributed Issue comments, check revisions and formal reviews. Targeted tests cover cross-repository same-number references, unavailable and truncated reads, pagination, closed Issues, absent checks, shared Issues and both message languages. Completion still requires broader PR discovery, explicit handling of independently verifiable test records, further policy and column-source tests, controlled end-to-end evidence review, and a linked implementation PR.

The diagnostic also reads checks, reviews and repository-qualified closing associations for PR candidates identified by task or Issue number even when they do not appear in the Issue timeline. These are labeled candidates rather than invented Issue references. Requirement-entry links can supply a task's Issue when its file omits one; conflicting links remain ambiguous. Controlled tests cover both paths and the all-state repository inventory, including short pages and numeric repository identity. A read-only TASK-131 probe against the actual Weaver Project returned `pullInventory.status: read` on 2026-11-28 after verifying GitHub's numeric repository pagination links. The inventory is bounded to 50 pages, non-atomic and limited to the selected repository; it cannot prove that no other PR exists.

The Overview card menu now includes a narrower read-only evidence view of the existing Issue timeline, checks, reviews and attributed comments with source links. It displays review and head revisions separately and states that comments do not establish independent tests. The CLI distinguishes unavailable test-source reads, no record in the observed sources, and unverified claims, and flags reviews that name a different revision. `npm run test:author-host -- reconciliation` passed in VS Code 1.148.0 with mocked GitHub data; it exercised Overview rules and unavailable process, not the new evidence menu. An extension-host exercise of the new menu remains outstanding; these changes do not establish a common producer contract for independent test records.

On 2026-11-28 KST, `npm run check` passed; `npm test` passed with 705 Markdown, 166 GitHub and 365 CLI tests before the last focused changes. The subsequent targeted CLI run passed 121 tests and the evidence and localization run passed 29 tests, including both configured column sources and disabled exceptions. A read-only `node packages/cli/dist/bin.js evidence inspect TASK-131` against the configured Weaver Project returned a readable Issue, PR inventory and comments, with three review collections read. It reported merged non-closing references and absent formal reviews; this observation is not an independent test or formal review, does not verify private test claims, and does not exercise every evidence source. Three pre-existing personal-configuration contributor warnings were printed. This live read did not exercise writes.
