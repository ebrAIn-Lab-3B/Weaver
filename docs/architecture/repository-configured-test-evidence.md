# Repository-configured independent test evidence

## Scope and decision

On 2026-11-28 the user chose repository-specific configuration. Weaver must not assume an organization, an agent identity, a field name or a trusted workflow. This document describes an implementation plan; it does not establish that a CI run is independent or change the meaning of Verified. REQ-024 AC-009 and TASK-137 remain in force. Existing Issue comments and task-file text remain attributed, unverified claims.

## First source: GitHub Actions observations

The first adapter should read a GitHub Actions run by a repository-configured workflow identity and an explicitly associated PR head revision. A workflow's name alone is not sufficient identity: use a repository-qualified workflow path or ID, a run ID and exact head SHA, and re-read the run and workflow metadata from GitHub. Display source URLs, repository, workflow identity, run ID, event, actor and triggering account, conclusion, head SHA and observation time. A passing workflow is a successful CI observation, not proof that a particular person independently tested it.

A proposed optional `evidence.independent-tests` section will name the source adapter and repository-specific workflow identity. No section means no configured producer. The exact serialized shape and schema validation must be added together with tests and English/Korean messages. A malformed or unsupported configuration must not silently fall back to a trusted default. Configuration by itself must not mark a run or task verified.

## Trust and uncertainty

A record can be shown as matched to configured source and revision only after the adapter validates repository, workflow and SHA against authoritative GitHub observations. Distinguish no configured source, no matching run, unavailable or incomplete results, pending/failing/successful runs and revision mismatch. Pagination, stale reads, forks and changed configuration must fail closed. Do not treat an account name, a different triggering actor, a PR merge, a passing run or a comment as proof of independence. Until a separately defined verifier and organization policy establish independence, report the independent-execution assessment as unverified even when a configured run is readable and successful.

No evidence inspection makes a GitHub write or moves a task. Existing exceptions, confirmation and DEC-006/DEC-008 boundaries remain unchanged. Evidence from other adapters must not be guessed or interpreted as GitHub Actions evidence.

## Verification

Exercise valid configuration and absence, malformed and unknown adapters, different repositories and workflow IDs, revisions, run conclusions and events, partial pages, access denial, stale and concurrent observations, and identical and distinct actor accounts. Check both languages and machine-readable output. Use an isolated test repository with its own configured workflow for a live read, compare the run and revision to GitHub, and record which facts were observed rather than claiming independent execution. Review an actual second producer before introducing a common cross-producer verifier contract.
