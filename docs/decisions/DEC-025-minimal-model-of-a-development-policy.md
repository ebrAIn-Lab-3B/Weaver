# DEC-025: Weaver keeps a minimal model of a development policy; a guideline decides the rest

- Status: accepted on 2026-11-11 by the maintainer; amended the same day (`TASK-109`): item 3 no longer adds ID settings
- Date: 2026-11-11
- Related: `REQ-015`, `TASK-108`, `TASK-109`, amends [DEC-019](./DEC-019-operating-guidelines-by-reference.md) item 9, keeps [DEC-005](./DEC-005-task-files.md), [DEC-015](./DEC-015-process-configuration.md), [DEC-023](./DEC-023-mark-a-card-verified-and-say-why-it-has-no-task-file.md)

## Context

[DEC-019](./DEC-019-operating-guidelines-by-reference.md) item 9 kept the levels of a guideline outside Weaver until a second guideline needed more. Two development policies are now in use, and they differ in more than names:

| | Guideline A (`agentic-base`) | Guideline B (`palab-platform`) |
| --- | --- | --- |
| Unit of intent | Promise (Experience → Moment → Promise) | User Story on a story map |
| Acceptance criteria | Acceptance Checks of a Promise | ACs of a User Story |
| What a requirement is | A release slice that names Promises | The source of truth, above the stories |
| Verification record | One Evidence Ledger per Promise | One Evidence Ledger table per project |
| Verifier | Story Chain validator | `verify-ac` skill |

Both keep `REQ-###` and `TASK-###` files that Weaver reads. Weaver accepts only `US-###` in a requirement's `story_ids` and only `AC-###` in a task's `criteria`. So a requirement of guideline A cannot put its Promise IDs in `story_ids`, and its tasks cannot put Acceptance Check IDs in `criteria`.

Weaver could model intents, directions, and verification for both. Each new policy would then need Weaver to change, which is what the independence principle in `AGENTS.md` rules out.

## Decision

1. **What Weaver owns stays as it is.** A requirement (`REQ-###`), a task (`TASK-###`) under a requirement, and the evidence of a task (Issue, pull request, checks), with the existing rules for columns and Verified ([DEC-015](./DEC-015-process-configuration.md), [DEC-023](./DEC-023-mark-a-card-verified-and-say-why-it-has-no-task-file.md)).
2. **A guideline fits Weaver's contract; Weaver does not learn the guideline's IDs.** A requirement's `story_ids` stay in the form `US-###` or stay empty. A guideline whose intents have other IDs leaves `story_ids` empty and links its intents in the requirement's body, as [DEC-019](./DEC-019-operating-guidelines-by-reference.md) item 9 already allows. A guideline whose acceptance criteria live in its intents lists them as links under the requirement's `## Acceptance criteria`; Weaver numbers that list `AC-001`, `AC-002`, and a task's `criteria` names those numbers. Weaver's coverage view works unchanged.
3. **When Weaver changes for a guideline.** Only when both hold:
   - Weaver's contract (frontmatter, `## Acceptance criteria`, `## Tasks`, links in the body) cannot express what the guideline needs at all; and
   - the change removes an assumption Weaver makes, rather than adding something one guideline needs.

   The trigger is friction met in real use and recorded in the user story map, not friction foreseen. A setting added for one guideline is not a fix; the next guideline would need the next setting.
4. **Everything else is the guideline's decision.** Weaver does not model or check any of the following. Each guideline decides and documents its own answer:
   - what an intent is, and whether a requirement sits above or below it;
   - where acceptance criteria live, and whether a requirement may restate them;
   - what makes a requirement verified, which record holds the evidence, and which tool reports on it;
   - which work is tracked before a requirement exists, and where;
   - what happens when an intent changes after work has started.
5. **Weaver publishes the questions, not the answers.** The guide [Work under an operating guideline](../onboarding/operating-guidelines.md) lists these questions with the two guidelines above as worked examples. A guideline answers them in its own repository.
6. **Still no guideline in the code** ([DEC-019](./DEC-019-operating-guidelines-by-reference.md) item 11). No guideline's words, IDs, or folders reach Weaver's code, schema, or settings.

## Reasons

- Weaver only displays `story_ids`, so an empty list and links in the body lose nothing. `AC-###` is Weaver's own numbering of the requirement's criteria list, and a list of links fills it without restating the guideline's criteria.
- A setting per guideline grows with every guideline. A rule for when Weaver changes keeps the core still.
- The guidelines disagree on direction and verification. A model that fits both would carry the union of their ideas, and the next policy would need a third.
- A guideline already has its own validator and record. Weaver adds the link between them and the work, not a second judgement.

## Consequences

- No code changes. `REQ-015` records the criterion that a guideline fits the existing contract.
- `agentic-base` and `palab-platform` each answer the questions of item 4 in their own repositories. `agentic-base` does it in its development flow and its requirement and task templates (agentic-base pull request #5), checked with Weaver's parser: no issue on either file.

## Decision points (settled by the maintainer)

- **Minimal model.** The proposed alternative named five roles (intent, criterion, requirement, task, verification record with its verifier) and two levels of verification. The maintainer chose the minimal model: Weaver owns only what it already owns.
- **No ID settings (amended on 2026-11-11, `TASK-109`).** The first accepted text let a process file set the form of the two IDs (`ids.intent`, `ids.criterion`). It was withdrawn before it was built: the IDs are used only for display and for Weaver's own numbering, so the guideline can fit the contract instead, and a setting for one guideline invites the next.
