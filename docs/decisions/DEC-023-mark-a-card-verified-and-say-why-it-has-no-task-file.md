# DEC-023: A card can be marked Verified, and says why it has no task file

- Status: proposed on 2026-11-08; it becomes accepted when the maintainer merges the pull request that adds it
- Date: 2026-11-08
- Related: `REQ-020`, `US-056`, builds on [DEC-003](./DEC-003-board-status-mapping.md) and [DEC-006](./DEC-006-closing-pr-evidence.md), keeps [DEC-008](./DEC-008-agent-identity-and-write-confirmation.md)

## Context

A closed Issue is Verified ([DEC-003](./DEC-003-board-status-mapping.md)), and it carries the label `status:verified`. When a pull request closes an Issue, GitHub closes it but does not add the label, so the card shows the gap "closed without status:verified". The label is added through a move to Verified, which the requirement view offers for a task whose files are in the open folder, and the terminal offers as `weaver card move`. A card has no way to do it, and on 2026-11-08 the label was set by hand for each task that was finished.

A card is joined to its requirement by the task and requirement files of the folder that is open. When the folder is behind GitHub, the files are missing, the card opens its Issue, and nothing says why.

## Decision

1. **A card shows a button "Mark verified"** when its Issue is closed, it carries the gap "closed without status:verified", and none of its pull requests is open. The card does not need a requirement.
   *Amended on 2026-11-11 (`TASK-113`):* the button also appears on an **open** card whose title names no task and that is not in Verified, when none of its pull requests is open. Such a card is work before a requirement ([DEC-026](./DEC-026-work-before-a-requirement-is-an-ordinary-card.md)), which a decision finishes rather than a pull request that closes it. The move then closes the Issue, and the dialog says so with the evidence that is missing. A card that names a task keeps the closing pull request as its way to finish.
2. **The button does what the requirement view does for a move to Verified.** It reads the Issue, its evidence, and its board status, plans the move with the rules of the repository ([DEC-015](./DEC-015-process-configuration.md)), shows the plan and the evidence gaps in a dialog, and applies the plan only after the person says yes ([DEC-008](./DEC-008-agent-identity-and-write-confirmation.md)). A repository whose rules cannot express Verified, or a card that is already there, is told so and nothing is written.
3. **A card whose title names a task but has no task file in the folder says so.** Under the title it says, for example, "No task file for TASK-098 in this folder. If it is merged on GitHub, update the folder (git pull)". It looks only at the folder, which is what decides the link, so it makes no request.
4. **A card that is a plain Issue** (no task in its title) says nothing more than it does now.
5. **The offer after a merge is not decided here.** The notice of REQ-018 could offer the button for the card that the merged pull request closed. It is left to a later decision, because it needs the pull request to say which Issues it closed.

## Reasons

- The step that marks a finished card Verified should be where the person sees the gap, not in another view that may not open.
- Saying why a card has no task file turns a puzzle into one instruction.
- The plan and the confirmation are the ones every write already has, so nothing is written without being shown.

## Consequences

- Tasks of `REQ-020` follow once this is accepted: the line on a card without a task file; the button.
- The requirement view and the button share the planning code (`planMove`, `describeMove`, `applyMove`) and differ only in where the dialog is opened.
- The label is still set by a move, not by a hidden rule: a closed Issue does not become Verified by itself.

## Decision points for the maintainer

- **Item 1, no button while a pull request is open.** The alternative is to offer it always. It would let a person mark a task Verified while a pull request of that task is still open, which is the case that was found on 2026-11-08.
- **Item 3, only the folder.** The alternative is to ask GitHub whether the file exists, which would say "it is on GitHub, update the folder" instead of "it may be". It costs a request for each card without a file.

## Not decided yet

- The offer in the notice after a merge (item 5).
- Whether Weaver updates the folder itself. It does not, because it never changes the working tree of the person.
