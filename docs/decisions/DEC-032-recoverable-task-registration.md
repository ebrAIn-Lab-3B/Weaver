# DEC-032: Recover task registration with retained reservations and explicit handoff

- Status: accepted
- Date: 2026-11-28
- Accepted: 2026-11-28, following the user's explicit approval of DEC-032.
- Related: `REQ-024`, `TASK-131`, `TASK-132`; retains [DEC-007](DEC-007-central-project-is-configuration.md), [DEC-008](DEC-008-agent-identity-and-write-confirmation.md), [DEC-016](DEC-016-task-contract-in-process-file.md) and [DEC-031](DEC-031-label-project-status-projection.md)

## Context

Task registration crosses repository files, GitHub Issues, a Project and a file PR. These systems do not provide one transaction. A request can succeed while its response is lost, a Project listing can lag an item addition, and an earlier executor can be paused while another process retries. A title search or a local lock cannot prove that another Issue will not be created.

## Decision

1. Resolve initial state and task fields from the target repository's effective process. The organization owns mappings; Weaver does not assume an organization's labels, roles or Project. Missing, conflicting or unreadable required facts stop writes.
2. Before creating an Issue, reserve repository-visible refs for a conservative operation key and repository-qualified task ID. Only an execution that receives confirmation for both new refs can create the Issue. Initial file-PR creation and recovery of a pushed branch share a separate task-specific PR reservation. Refs remain after success, failure or an unknown outcome; timeout alone never transfers ownership or removes them.
3. New Issues contain an operation/task marker and a digest of requested task details, Project and effective process. Resume requires an explicitly selected Issue and rejects a mismatched v2 digest. The Issue body is editable; the digest is not an immutable manifest or proof of exclusive ownership. Older v1 or unmarked Issues require a person to compare the original intent before explicitly resuming.
4. After an uncertain Issue request, retain known identifiers and stop. The operator first establishes that every prior executor has stopped, inspects complete available repository, Project, branch and PR evidence, then explicitly chooses a verified Issue or leaves the case unresolved. No search result, elapsed time or missing item proves that a paused creator cannot still write. Cleanup or takeover of a retained ref is a separate human decision after investigation; no bulk or automatic cleanup is performed.
5. Each write remains individually approved. Read before mutation and verify the intended effect with a fresh read; an unconfirmed response or post-read is not success. For Project membership only, a complete read that omits the returned item may be followed by bounded read-only checks. Do not retry the mutation or overwrite a different valid status or field value. Approval remains tied to the observed identity, inputs and process.
6. A proposed file PR is pending. Report registration complete only after rereading the merged files and their links, Project membership and configured state. Registration completion does not prove the task's implementation or verification. Shared Issues and ambiguous or incomplete reads require a human decision, not automatic splitting or relinking.

## Limits and alternatives

Git refs exclude cooperating creators using the same reserved key while the refs remain intact. They do not fence an external writer or a former executor after a privileged actor removes a ref. GitHub offers no conditional Issue creation tied to a ref and no atomic compare-and-set for the Project fields used here; a concurrent change after the last read remains possible. Project addition is idempotent for an Issue in one Project, but a listing can lag. A safe handoff is therefore unavailable when executor termination or identity cannot be established.

Title-only search was rejected as identity, a local-only journal cannot coordinate hosts, and an expiring lease without fencing cannot stop a paused former holder. A separate lock service would add an infrastructure dependency without solving the GitHub mutation's lack of fencing. A durable immutable intent manifest, safe ref cleanup interface and stronger coordination remain future decisions; the editable digest and manual investigation do not claim to implement them.

## Review and evidence

The [investigation and recovery procedure](../architecture/task-registration-recovery.md) and [TASK-132 evidence map](../tasks/TASK-132.md#acceptance-evidence-map) describe the tested boundaries, private fixture observations and residual limits. The user accepted this retained-ref and explicit-handoff tradeoff; acceptance does not establish that all work under REQ-024 is complete.
