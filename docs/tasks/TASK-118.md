---
id: TASK-118
type: task
title: Create ideation and requirement Markdown files
requirement: REQ-022
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/317
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-001, AC-002, AC-005, AC-006]
---

# TASK-118 Create ideation and requirement Markdown files

After TASK-115, implement a human-driven creation flow with repository and destination selection, preview before creation, and no silent overwrite. Create an ideation document without a mandatory organization-specific format and a requirement that satisfies the current artifact schema, including a workspace-unique ID. Handle ID and path collisions according to the decision.

Verify both creation paths, required metadata, collision and cancellation behavior, and offline operation without an agent, board, or GitHub. A named agent owner remains to be assigned.

Progress: the command-palette creation flow is implemented on branch `feat/req-021-022-markdown-authoring`. It proposes an ID, reviews the initial file, and uses exclusive file creation. The shared decisions, concurrent ID allocation, automated integration coverage, and VS Code host verification remain open; this task is not yet verified.

## 0.1.22 handover

Creation commands shipped in [0.1.21](https://github.com/ebrAIn-Lab-3B/Weaver/releases/tag/v0.1.21); a later development-host pass created an ideation and requirement file, reviewed proposed content, and linked them. Remaining: resolve concurrent ID allocation and verify collision, cancellation, and offline behavior against the full criteria.

## Card review: offline scope (2026-11-19)

The remaining offline check concerns creating local files without a board, GitHub, or an agent, as specified above. It is not a requirement to test remote file providers or to implement Git synchronization. Concurrent ID allocation and collision/cancellation behavior also remain open.

## Completion work (2026-11-20)

- Define and implement a local allocation protocol that prevents two cooperating Weaver creation processes from committing the same requirement ID to different paths in overlapping workspaces. Recheck the workspace while holding the allocation protection; exclusive creation of the destination alone does not protect the ID. Document its scope, failure and recovery behavior, including interrupted processes and workspace changes. Do not claim protection against independent writers that do not participate in the protocol.
- Exercise two simultaneous creators with different destinations, a requirement added after preview, an existing destination, and cancellation before confirmation. Assert that no existing file is overwritten and no duplicate ID is committed by the participating creators. Include integration coverage of the actual creation path.
- In a local VS Code extension host, verify both creation commands, schema metadata, preview, cancellation and collision feedback without depending on an agent, board or GitHub. Record the environment and observed results. A Restricted Mode session with connectivity available is not evidence of network-disconnected operation.
- Record the implementation and test evidence before changing the card status. The proposed decision in DEC-027 must be updated to describe the implemented allocation and its limits.

Baseline on 2026-11-20: `npm.cmd run check` and `npm.cmd test` passed (640 Markdown, 122 GitHub, 248 CLI tests). These existing tests do not exercise concurrent creation through the extension command, cancellation or disconnected creation and do not close this task.

Implementation in progress: cooperating local Weaver processes using the same temporary directory now protect the final ID recheck and exclusive write with a lock. A competing or abandoned lock fails closed and shows its path. This does not coordinate other machines, separate temporary directories, independent writers, or workspace scans that do not see the same files. The lock helper has automated contention and failure-cleanup coverage; extension-command integration and the host checks above remain necessary.

After this change, `npm.cmd run check` and `npm.cmd test` passed (642 Markdown, 122 GitHub, 248 CLI tests). The two new tests cover the lock helper and exclusive-file failure, not two VS Code processes or the complete creation command.

The compiled creation command was subsequently exercised by `npm.cmd run test:author-document` with simulated VS Code dialogs and real local files. Requirement and ideation creation, cancellation, destination collision, an ID introduced after preview, and two interleaved command invocations passed. The second invocation was refused while the first held the lock. This is not a real VS Code UI or multi-process test, and it does not establish network-disconnected behavior. The extension-host and offline checks remain open.

`npm.cmd run test:author-host` passed in an isolated Windows VS Code 1.147.0 extension host, using the real workspace scan, file system and commands with simulated dialogs. It covered schema-valid requirement and ideation creation, cancellation, destination collision, an ID introduced after preview, and refusal while the creation lock was held. It did not test actual dialog interaction, two independent VS Code processes, or a network-disconnected environment. `npm.cmd test` also passed (642 Markdown, 122 GitHub, 248 CLI tests). The remaining checks above are still open.

`npm.cmd run test:author-process` passed with two independent Node processes running the compiled creation command, a shared local workspace and temporary directory, and simulated VS Code APIs. While the first held the lock during the final scan, the second was refused; only the first requirement file was created. This checks process-level lock coordination, not two VS Code extension hosts or dissimilar workspace scans.

The `test:author-document` harness was also run with common Node TCP, HTTP, HTTPS, DNS lookup and fetch entry points set to fail on use. Both local creation paths and the collision and cancellation cases passed with simulated VS Code APIs. This is evidence that the exercised command paths do not use those network entry points; it is not an actual disconnected VS Code host or a comprehensive network sandbox.

Remaining review: verify the real creation dialogs and cancellation in VS Code; exercise local creation in a disconnected host; and assess whether the documented allocation scope meets the workspace-ID criterion. Record implementation review and closing PR evidence before verification. Do not claim cross-machine or independent-writer coordination.

## Actual VS Code UI verification (2026-11-20)

In a local Windows VS Code 1.147.0 Extension Development Host built from the current working tree, Computer Use exercised the commands in a separate temporary folder. The ideation flow showed the chosen destination and `# UI ideation` before creating `ideation.md`. The requirement flow showed `REQ-001`, type, title, draft status, outcome and acceptance criterion in the preview; cancelling that preview left no `REQ-001.md`, and repeating and confirming created the displayed file with those contents. No agent, board or GitHub was used in these interactions.

For a destination race, an ideation preview selected `collision.md`; an external process created that file after the preview and before confirmation. The host displayed a creation failure with `EEXIST`, and the existing sentinel content remained on disk. This checks actual UI feedback for that collision, not every collision or two VS Code hosts. Connectivity was available, so this is not a disconnected-host test. The allocation-scope review and normal implementation and PR evidence remain open; this card is not marked verified.

## Allocation review and regression rerun (2026-11-20)

The lock serializes participating creators sharing `os.tmpdir()`, and the protected scan detects a prior creation only when the later creator's workspace scan includes it. This does not satisfy the completion-work statement above for all overlapping workspaces: for example, a parent workspace can create `REQ-001` outside a nested workspace, after which the nested workspace cannot see that file and can also allocate `REQ-001`. Different exclusions, temporary directories, machines, and independent writers also limit the guarantee. The current two-process test uses the same workspace and therefore does not prove the broader statement. A shared allocation domain or an explicit decision narrowing the criterion is still needed; do not mark this task verified on the current evidence.

Regression rerun: `npm.cmd run check`, `npm.cmd test` (643 Markdown, 122 GitHub, 248 CLI), `npm.cmd run test:author-process`, and `npm.cmd run test:author-host` passed. The latter used VS Code 1.147.0 with simulated dialogs. A genuinely disconnected extension host remains untested.

## Reproduced overlapping-workspace defect (2026-11-20)

A temporary Node probe invoked the compiled `createDocument('requirement')` command twice with simulated VS Code APIs and real local files, using the same process and temporary-directory lock. The first workspace was a parent folder and wrote `parent.md` with `REQ-001`; the second workspace was its nested folder and wrote `child.md`, also with `REQ-001`. Both calls completed without a collision warning. This is a reproducible failure of the overlapping-workspace completion criterion, not an actual VS Code UI test. The earlier two-process test used identical scan roots and cannot detect this case.

The schema also says IDs are never reused, while the current maximum-of-visible-files algorithm has no memory of a deleted highest ID. A design must define the allocation domain and durable history before claiming those guarantees. A repository-level domain can address nested folders within one repository but does not by itself establish workspace-wide uniqueness across multiple repositories, or across unrelated nested workspaces without a shared repository. The allocation choice remains a human decision; do not infer approval to narrow the existing criterion.

## Repository allocation scope (2026-11-20)

The maintainer selected the repository as the common allocation scope. The creation command now includes Markdown files from the nearest enclosing Git checkout in both the proposal and the recheck under the existing lock, in addition to the current workspace scan. This addresses the reproduced parent/nested example when both folders belong to that checkout and the participating creators share the lock. The scan skips `.git`, `node_modules`, `dist`, and `out`, does not follow symbolic links, and fails if a directory cannot be read. A `.git` file is accepted for a worktree. Without a Git checkout the command retains its workspace-only scan. DEC-027 and the getting-started guide record the scope and limitations.

`npm.cmd run test:author-document` passed, including parent/nested creation (`REQ-001`, then `REQ-002`) and an ID introduced outside the nested workspace after preview. In an isolated VS Code 1.147.0 extension host with simulated dialogs, `node scripts/test-author-host.js nested-repository` previewed and created `REQ-002` in a nested workspace after `REQ-001` existed outside it. The regular author host and independent-process lock test also passed. This does not verify different multi-repository workspace compositions, separate temporary directories, independent writers, disconnected operation, or deleted-ID non-reuse. Those broader schema conditions and normal review and PR evidence remain open.

## Repository allocation history (2026-11-20)

The maintainer selected a repository-native allocation history. Requirement creation now reads `.weaver/requirement-ids.txt` in the checkout root (or selected folder outside a checkout) as well as visible requirement files. After confirmation and the locked recheck, it appends and flushes the reservation before exclusive file creation. A cancelled preview adds nothing; an unsuccessful creation after reservation can leave a gap. Incomplete or invalid history stops creation with a localized message. Preserve and commit the history, including IDs whose documents are deleted. This protects reservations recorded by participating creators in the same allocation domain; it cannot reconstruct IDs removed before this history existed, prevent independent clones allocating the same ID, or ensure cross-repository workspace uniqueness.

`npm.cmd run test:author-document` passed with cancellation, failed destination reservation, deletion and subsequent allocation, CRLF history, malformed history, nested checkout and stale preview coverage. In an isolated VS Code 1.147.0 extension host with simulated dialogs, `node scripts/test-author-host.js nested-repository` created `REQ-002` in a nested folder, removed that file and created `REQ-003`; the regular author-host and independent-process nested-workspace tests passed too. `npm.cmd test` passed (643 Markdown, 122 GitHub, 248 CLI); the author-document command rebuilt all packages and the extension. Actual disconnected-host operation, history bootstrap from older deleted IDs, cross-domain guarantees, and review and PR evidence remain open. Do not mark this card verified.

## Multi-repository workspace follow-up (2026-11-20)

The proposal and locked recheck now read allocation histories and scan the enclosing checkout of each local workspace folder, not only the selected destination's checkout. This includes existing requirements outside an open nested folder. It reduces collisions among repositories visible in the same workspace; different workspace compositions, excluded paths, symlinks, separate temporary directories and independent clones still limit coordination. An invalid history reports the path requiring review in English and Korean.

`npm.cmd run test:author-document` passed with a second repository's reservation and a history changed after preview. `node scripts/test-author-host.js multi-repository` passed in VS Code 1.147.0 with simulated dialogs: a reservation in one checkout led to `REQ-008` in the other, and a subsequently added `REQ-010` outside the first checkout's open nested folder led to `REQ-011`. The independent-process nested-repository test and 11 i18n tests passed. The command build compiled all packages and the extension. Actual disconnected operation, pre-history deleted IDs, cross-domain coordination, review and PR evidence remain open.

## Allocation history failure and large-ID checks (2026-11-20)

A review found that an empty existing history was treated as a new allocation domain. Truncating a previously populated history could therefore permit reuse. Empty existing histories now fail closed with the same localized path-specific error as incomplete or malformed histories. A missing history still means first use: the program cannot distinguish an intentionally new domain from a history file deleted or omitted from a checkout. Preserve the file and restore it from trusted history if missing; this limitation is recorded in DEC-027.

The schema permits three or more digits without an upper bound. Allocation now compares and increments IDs with arbitrary-precision integers rather than rounding large IDs as JavaScript numbers. `npm.cmd run test:author-document` passed for empty and incomplete histories, and sequential allocation beyond `Number.MAX_SAFE_INTEGER`. `node scripts/test-author-host.js multi-repository` passed in VS Code 1.147.0 with simulated dialogs, including an empty history in another workspace repository and preservation of the existing file; the independent-process nested repository test also passed. These checks do not establish disconnected-host operation or recovery of IDs lost before history existed.

## Workspace scan exclusions (2026-11-20)

Review found that the new allocation scan included `examples` and `.claude/worktrees`, even though the existing workspace reader excludes those sample and agent-worktree copies under TASK-076. The workspace search and checkout traversal now use the same exclusions; other directories under `.claude` are retained. A workspace explicitly opened inside an enclosing checkout is still scanned relative to that workspace and checkout. These exclusions also define limits on which artifacts participate in ID allocation.

In isolated VS Code 1.147.0 extension hosts with simulated dialogs, `node scripts/test-author-host.js multi-repository-root` and `node scripts/test-author-host.js multi-repository` passed with `REQ-999` under `examples` and `REQ-998` under `.claude/worktrees`: the proposed ID was `REQ-008`, based on the included allocation history. The first scenario opened the repository root, the second a nested workspace folder. `npm.cmd run test:author-document`, the independent-process test, `npm.cmd run check`, and `npm.cmd test` (643 Markdown, 122 GitHub, 248 CLI) passed. Network-disconnected host verification and the other recorded scope and completion evidence remain open.

## Allocation history preview (2026-11-20)

The requirement creation confirmation now states the history path and explains that the ID can remain reserved if creation fails. The initial Markdown remains in the detail preview; ideation uses its original confirmation. The message is in the English and Korean catalogs. A VS Code host integration check confirmed the nested checkout history path and reservation warning were passed to the dialog; `npm.cmd run test:author-document` and the 11 message-catalog tests passed.

Computer Use exercised the English confirmation in a Windows VS Code 1.147.0 development host with an isolated profile and temporary local folder. The dialog displayed the requirement's proposed content, identified the allocation history file and warned that reservation can persist after a failed creation. Its native display abbreviated the middle of the long document and history paths, so this observation does not establish that their complete paths are visually readable in that dialog. Escape cancelled creation; filesystem checks confirmed neither `REQ-001.md` nor `.weaver/requirement-ids.txt` was created. Network connectivity was available, so this is not an offline-host test. Normal review, historical and coordination limitations, and disconnected-host evidence remain open.

## PR validation (2026-11-21)

Before submitting the current implementation for review, `npm.cmd run check`, `npm.cmd test` (643 Markdown, 122 GitHub, 248 CLI), `npm.cmd run test:author-document`, and `node scripts/test-author-process.cjs` passed. In VS Code 1.147.0 isolated extension hosts, the standard author host, nested repository, multi-repository and multi-repository-root cases passed with simulated dialogs. `npm.cmd run package` and `npm.cmd run package:cli`, followed by `node dist/weaver.js --help`, passed. The actual UI checks and their limitations are recorded above. This PR is implementation evidence, not a claim that disconnected operation, earlier deleted IDs, or cross-domain uniqueness have been verified; keep the task open for those remaining items.
