# DEC-025: A guideline names which of its artifacts plays each role Weaver tracks

- Status: proposed on 2026-11-11; it becomes accepted when the maintainer merges the pull request that adds it
- Date: 2026-11-11
- Related: `REQ-015`, `TASK-108`, amends [DEC-019](./DEC-019-operating-guidelines-by-reference.md) item 9, keeps [DEC-005](./DEC-005-task-files.md), [DEC-015](./DEC-015-process-configuration.md), [DEC-023](./DEC-023-mark-a-card-verified-and-say-why-it-has-no-task-file.md)

## Context

[DEC-019](./DEC-019-operating-guidelines-by-reference.md) item 9 kept the levels of a guideline outside Weaver "for a second guideline that does not exist yet", and said a new decision would add them when a second guideline needs it. There are now two guidelines in use, and both need it.

| | Guideline A (`agentic-base`) | Guideline B (`palab-platform`) |
| --- | --- | --- |
| Where intent lives | Story Chain: Experience → Moment → Promise | Requirement → User Story on a story map |
| Acceptance criteria | Acceptance Checks of a Promise | ACs of a User Story |
| What a requirement is | A release slice: the Promises that ship together | The source of truth, above the stories |
| Verification record | One Evidence Ledger per Promise, a row per Acceptance Check | One Evidence Ledger table per project, a row per AC |
| Verifier | Story Chain validator | `verify-ac` skill |
| Work before a requirement exists | Kept in `fix_plan.md` | Little: the requirement is written first |

The two differ in names and in direction: in one the requirement points down at stories, in the other it points up at Promises. They agree on the shape. Each has a unit of intent, an acceptance criterion with an ID, a requirement that work is delivered against, tasks, and a verification record kept per acceptance criterion in the repository. Today Weaver checks that a requirement's `story_ids` look like `US-###`, so a requirement of guideline A cannot name the Promises it delivers, and neither guideline can say where its verification record is.

## Decision

1. **Weaver knows roles, not levels.** Weaver defines five roles and nothing more:
   - **intent**: the unit a requirement serves (a story, a Promise);
   - **acceptance criterion**: the verifiable unit under an intent, with an ID;
   - **requirement**: the `REQ-###` file that work is delivered against, with its status, owner, and tasks;
   - **task**: the `TASK-###` unit of work under a requirement ([DEC-005](./DEC-005-task-files.md));
   - **verification record**: where the evidence of each acceptance criterion is kept, and the **verifier** that reports whether every criterion of a requirement is covered.
2. **A guideline names its artifact for each role.** Its process file ([DEC-019](./DEC-019-operating-guidelines-by-reference.md) item 2) may say, per role, the ID pattern and the folder or file of the artifact that plays it, and the command of its verifier. A role it does not name keeps Weaver's default. The keys are fixed by the task that implements this decision; this decision fixes only what may be named.
3. **The direction between intent and requirement is the guideline's.** A requirement names the intents it delivers in `story_ids` whichever way the guideline draws it. Weaver checks each ID against the guideline's intent pattern, not against `US-###`. Without a guideline, the pattern stays `US-###`.
4. **A requirement does not copy acceptance criteria that live in an intent.** When the guideline keeps acceptance criteria under the intent, the requirement links to them. A task's `criteria` ([DEC-005](./DEC-005-task-files.md)) names their IDs as they are.
5. **Two levels of verification.**
   - A task is verified as today: its Issue is closed, its pull request and checks are its evidence, and a person moves it to Verified ([DEC-023](./DEC-023-mark-a-card-verified-and-say-why-it-has-no-task-file.md)). A task with `criteria` is finished only when its pull request also updates the rows of those criteria in the verification record.
   - A requirement is verified when the guideline's verifier reports that every acceptance criterion of its intents is covered. A person runs or reads that report and moves the requirement. Weaver does not read or score the verification record in this decision; it links to it and shows that it is missing when a guideline names one and the file is not there.
6. **Work before a requirement belongs to the guideline.** Exploration, contract writing, and approvals that happen before a requirement exists may be kept in the guideline's own queue. Weaver tracks a piece of work from the moment it belongs to a requirement. The same work is not tracked in both places.
7. **An intent in another repository** is named as `owner/repository#ID`. An ID without a repository means the requirement's own repository.
8. **Still no guideline in the code** ([DEC-019](./DEC-019-operating-guidelines-by-reference.md) item 11). Roles are Weaver's words. A guideline's words, IDs, and folders reach Weaver only through its process file. `agentic-base` and `palab-platform` appear only as worked examples in documents.

## Reasons

- Two guidelines with different names and opposite directions share one shape. Naming the shape lets Weaver follow both without learning either.
- A requirement that cannot name the intent it delivers breaks the walk from intent to evidence, which is Weaver's purpose.
- Keeping acceptance criteria in one place prevents a requirement and its intent from disagreeing about when work is done.
- Verification already lives in each guideline's record and verifier. Weaver adds the step between tasks and that record, not a second verdict.

## Consequences

- `REQ-015` gains acceptance criteria for naming roles and for checking `story_ids` against the guideline's pattern.
- The schema of the process file gains an optional section for roles; the artifact schema and the guide say so.
- Each guideline describes its roles by a pull request in its own repository, as [DEC-019](./DEC-019-operating-guidelines-by-reference.md) item 11 already requires.
- The guide [From exploration to execution](../onboarding/from-exploration-to-execution.md) shows guideline A end to end.

## Decision points for the maintainer

- **Item 1, five roles.** The alternative is a free list of levels with parents. It would let Weaver draw a guideline's whole tree, at the cost of a model of levels for every guideline. Five roles cover both guidelines in use.
- **Item 5, reading the record.** The alternative is to read the verification record and compute the requirement's verdict. Each guideline formats its record differently and already has a verifier; reading it would make Weaver follow a format by name.

## Not decided yet

- Showing the verifier's report on the Requirement view.
- Drawing the story map from a guideline's intents ([REQ-016](../requirements/REQ-016-user-stories-on-the-board.md)).
