---
id: TASK-096
type: task
title: Make the release workflow publish an official release with prepared notes
requirement: REQ-004
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/257
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-002]
assignee: claude-code
---

# TASK-096 Make the release workflow publish an official release with prepared notes

Tracked in [Issue #257](https://github.com/ebrAIn-Lab-3B/Weaver/issues/257). Ownership is recorded here; the Kanban column comes from the Issue.

The workflow `.github/workflows/release.yml` already builds the extension file and the `weaver` tool when a tag is pushed and attaches both to a GitHub Release. What is left, found on 2026-11-08 while planning the first official release ([DEC-021](../decisions/DEC-021-ebrain-lab-names-and-first-official-release.md)):

- It always marks the release as a pre-release (`--prerelease`), so an official release is not possible. It should do that only for a version with a suffix such as `-rc.1`.
- It generates the notes from the commits (`--generate-notes`). It should use a notes file kept in the repository for that version (`docs/releases/<version>.md`) when there is one.
