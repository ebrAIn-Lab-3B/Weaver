# DEC-030: Optional root-level requirement ID allocation

- Status: withdrawn on 2026-11-21; retained for historical context
- Date: 2026-11-21
- Related: `REQ-022`, `TASK-118`, [DEC-018](./DEC-018-operating-root-configuration.md), [DEC-027](./DEC-027-markdown-viewing-and-authoring.md)

## Context

Requirement IDs are scoped to a repository, and `owner/repository` plus the ID identifies a requirement across repositories (DEC-027). Independent repositories may therefore already contain the same ID. A person may additionally want repositories under one operating root to use distinct new ID numbers without requiring an online service. A root configuration and a personal configuration already exist under DEC-018.

## Withdrawal (2026-11-21)

The maintainer chose repository-local allocation and repository-qualified references, without the optional shared allocation domain. The decision below is retained as the withdrawn proposal and is not an implementation requirement. The proposed change to operating-root discovery is also withdrawn with this decision; DEC-018's existing nearest-root rule remains the baseline. TASK-128 is cancelled, not verified. This does not change the limitations of repository histories, independent clones or nonparticipating writers documented in DEC-027.

## Withdrawn decision

- Keep repository-qualified identity. Root-level allocation is optional; when it is not enabled, repository-local allocation continues. It does not require a central or organization-specific policy.
- A root's `.weaver/config.yaml` may opt into a shared local requirement ID allocation domain. Repositories beneath that root participate automatically, without a per-repository registration list. The configuration format and user-facing setup are implementation work, not an existing setting.
- Use one personal configuration and at most one operating-root configuration on a folder's ancestry. The personal configuration is not a root file. Nested or otherwise multiple root configuration files on that ancestry are unsupported: report the conflict and do not silently select an allocation domain. Independent roots in separate folder trees are allowed. This changes DEC-018's nearest-root behavior for the conflicting multiple-root case; update shared configuration discovery and its callers consistently rather than creating a different rule only for allocation.
- Show the applicable configuration, allocation domain, and history location before creation. Keep the repository's `.weaver/requirement-ids.txt` and the root allocation history; do not delete existing reservations. Root configuration and history are local operating files, not substitutes for repository history.
- Initialize the shared domain from the readable repository allocation histories and existing requirement documents beneath the root. Show discovered repositories, included and excluded paths, existing duplicate IDs, and read failures before applying initialization. Existing duplicate IDs in different repositories are reported, not automatically renumbered. Allow additional IDs from trusted historical records. Scanning cannot reconstruct IDs deleted before history existed. Fail closed on an incomplete scan or an unreadable or invalid history.
- A repository newly appearing under the root must have its existing visible IDs and history incorporated under the allocation lock before a new ID is reserved for it. Define and report scan exclusions and the handling of nested checkouts, inaccessible directories, symbolic links and multiple clones. A partial scan must not be represented as complete.
- For participating local creators, acquire the shared-domain lock, recheck applicable configuration and histories, reserve and flush the ID in the root history first, then reserve and flush it in the target repository history, then create the requirement file exclusively. Keep a recovery record with the target and stages needed to reconcile interruptions. A failure after reservation can consume an ID; never silently reuse it. Report an abandoned lock and require safe recovery. If an initialized shared history or an expected recovery record is missing, invalid or incomplete, fail closed and require explicit restoration or reinitialization rather than assuming first use. The absence of a pending recovery record in a clean domain is normal.
- Initialization, the shared lock and recovery protocol must be designed and tested together. File writes do not form a single atomic filesystem transaction; define recovery for interruption after every durable step and concurrent creators before claiming this behavior implemented. The existing repository history is preserved when the feature is disabled or a repository leaves the root.
- The guarantee applies only to participating creators using the same local domain and lock. Independent clones on other computers or domains, nonparticipating writers, and missing pre-history IDs remain limitations. DEC-027 describes optional server qualification for same-named repositories; it does not expand allocation coordination. Offline operation and conflict handling are not verified by this decision.

## Alternatives

An empty root history is easy to create but ignores existing reservations. A manually authored history makes review explicit but places the discovery burden on the person. The selected approach combines discovery with review and manual historical additions. Writing the repository history before the root history can allow a second participant to reuse an ID after an interruption; writing only the root history loses repository-portable evidence. A network allocation service could coordinate more machines but is outside this local-first decision.

## Former verification plan (withdrawn)

Define acceptance criteria and implementation tasks before changing behavior. Cover initialization with existing duplicates, deleted-ID reservations and partial failures; adding a repository; multiple root configuration conflicts; concurrent creators; interruption and recovery at each durable step; missing or malformed histories; and preservation of repository histories. Test a real network-disconnected VS Code host separately when requested. Normal review and DEC-006 closing evidence remain required; this decision does not mark TASK-118 or REQ-022 verified.
