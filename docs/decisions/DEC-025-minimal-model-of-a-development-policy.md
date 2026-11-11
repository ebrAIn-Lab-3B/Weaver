# DEC-025: Weaver keeps a minimal model of a development policy; a guideline decides the rest

- Status: accepted on 2026-11-11 by the maintainer
- Date: 2026-11-11
- Related: `REQ-015`, `TASK-108`, amends [DEC-019](./DEC-019-operating-guidelines-by-reference.md) item 9, keeps [DEC-005](./DEC-005-task-files.md), [DEC-015](./DEC-015-process-configuration.md), [DEC-023](./DEC-023-mark-a-card-verified-and-say-why-it-has-no-task-file.md)

## Context

[DEC-019](./DEC-019-operating-guidelines-by-reference.md) item 9 kept the levels of a guideline outside Weaver until a second guideline needed more. Two development policies are now in use, and they differ in more than names:

| | Guideline A (`agentic-base`) | Guideline B (`palab-platform`) |
| --- | --- | --- |
| Unit of intent | Promise (Experience → Moment → Promise) | User Story on a story map |
| Acceptance criteria | Acceptance Checks of a Promise | ACs of a User Story |
| What a requirement is | A release slice that names Promises | The source of truth, above the stories |
| Verification record | One Evidence Ledger per Promise | One Evidence Ledger table per project |
| Verifier | Story Chain validator | `verify-ac` skill |

Both keep `REQ-###` and `TASK-###` files that Weaver reads. Weaver accepts only `US-###` in a requirement's `story_ids` and only `AC-###` in a task's `criteria`. So a requirement of guideline A cannot name the Promises it delivers, and its tasks cannot name the Acceptance Checks they cover.

Weaver could model intents, directions, and verification for both. Each new policy would then need Weaver to change, which is what the independence principle in `AGENTS.md` rules out.

## Decision

1. **What Weaver owns stays as it is.** A requirement (`REQ-###`), a task (`TASK-###`) under a requirement, and the evidence of a task (Issue, pull request, checks), with the existing rules for columns and Verified ([DEC-015](./DEC-015-process-configuration.md), [DEC-023](./DEC-023-mark-a-card-verified-and-say-why-it-has-no-task-file.md)).
2. **Weaver treats two references as opaque IDs.** A requirement's `story_ids` name the intents it serves. A task's `criteria` name the acceptance criteria it covers. Weaver checks only the form of each ID, links it when it can find it, and attaches no other meaning to it.
3. **A process file may set the form of those two IDs.**

   ```yaml
   ids:
     intent: '^promise:[a-z0-9-]+$'                # story_ids; default '^US-\d{3,}$'
     criterion: '^acceptance-check:[a-z0-9-]+$'    # criteria; default '^AC-\d{3,}$'
   ```

   A pattern that is not a valid regular expression is reported and the default is used. An ID in another repository is written `owner/repository#ID`; the part after `#` is checked against the pattern.
4. **Everything else is the guideline's decision.** Weaver does not model or check any of the following. Each guideline decides and documents its own answer:
   - what an intent is, and whether a requirement sits above or below it;
   - where acceptance criteria live, and whether a requirement may restate them;
   - what makes a requirement verified, which record holds the evidence, and which tool reports on it;
   - which work is tracked before a requirement exists, and where;
   - what happens when an intent changes after work has started.
5. **Weaver publishes the questions, not the answers.** The guide [Work under an operating guideline](../onboarding/operating-guidelines.md) lists these questions with the two guidelines above as worked examples. A guideline answers them in its own repository.
6. **Still no guideline in the code** ([DEC-019](./DEC-019-operating-guidelines-by-reference.md) item 11). The defaults stay `US` and `AC`. No other policy's words reach Weaver except through a pattern in a process file.

## Reasons

- Two ID patterns are the smallest change that lets both guidelines link a requirement to its intent and a task to its criteria.
- The guidelines disagree on direction and verification. A model that fits both would carry the union of their ideas, and the next policy would need a third.
- A guideline already has its own validator and record. Weaver adds the link between them and the work, not a second judgement.

## Consequences

- `REQ-015` gains a criterion for the two patterns. A task implements `ids` in the process file reader, the requirement and task parsers, and the guide `configure-your-process.md`.
- `agentic-base` and `palab-platform` each answer the questions of item 4 in their own repositories, and set `ids` in their process files where their IDs differ from the defaults.

## Decision points (settled by the maintainer)

- **Minimal model.** The proposed alternative named five roles (intent, criterion, requirement, task, verification record with its verifier) and two levels of verification. The maintainer chose the minimal model: Weaver owns only what it already owns, plus two ID patterns.
