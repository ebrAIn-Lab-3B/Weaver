# From exploration to execution

Status: draft (2026-11-11). Worked example: `agentic-browser`, a project created from the `agentic-base` guideline.

This guide describes how a new project moves from open-ended exploration to tracked work in Weaver. Weaver tracks five roles: intent, acceptance criterion, requirement, task, and verification record ([DEC-025](../decisions/DEC-025-a-guideline-names-the-roles-of-its-levels.md)). Each operating guideline says which of its own artifacts plays each role. This guide uses the words of `agentic-base` (Story Chain) because that is the guideline of the worked example; the section [Under another guideline](#under-another-guideline) shows the same flow under `palab-platform`.

## The flow at a glance

```text
0. Create the project      (copy the guideline, connect to Weaver)
1. Explore                 (diverge freely: ideas, mockups, spikes, conversations)
2. Harvest                 (gate: the owner approves what exploration settled)
3. Map the Story Chain     (lay out Experiences, Moments, Promises; draw release lines as draft REQs)
4. Promote the contract    (canonical Promises and Acceptance Checks; the validator passes; REQ becomes ready)
5. Execute tasks           (TASK → branch → PR → CI, each PR updating its Ledger rows)
6. Verify                  (tasks in Weaver; the requirement when the validator reports full coverage)
        ↑                                                         │
        └──────── reality feedback returns to step 3 or 4 ────────┘
```

Exploration has no constraints inside it. The gates are at the exits: step 2 for exploration, step 4 for intent, step 6 for completion.

| Role in Weaver | Artifact in `agentic-base` |
| --- | --- |
| Intent | Promise (under a Moment, under an Experience) |
| Acceptance criterion | Acceptance Check of a Promise |
| Requirement | `REQ-###`: one release slice of Promises |
| Task | `TASK-###` under the requirement |
| Verification record and verifier | Evidence Ledger per Promise; `npm run mc:validate-story-chain` |

## 0. Create the project

Copy `agentic-base` into a new repository and register it with Weaver ([register-your-project.md](register-your-project.md)). Add `.weaver/process.yaml`, starting from the guideline's own file ([DEC-019](../decisions/DEC-019-operating-guidelines-by-reference.md)).

Do not confuse this step with the `project-bootstrap` phase of `agentic-base`, which chooses the technology stack after the Story Chain is settled.

## 1. Explore

Diverge as widely as useful:

- conversations with an agent about the product, its users, and its UX;
- draft product definitions and design principles;
- HTML mockups, alternative interfaces, and sample artifacts;
- competitive research and reference studies;
- technical spikes on assumptions that could overturn the product, such as whether a provider allows a subscription to be used from a third-party app.

Three rules hold while exploring:

- **Exploration lives in `docs/explore/`.** Everything outside that folder is canonical. Location says the status, so no marker is needed, and no other document cites an exploration file as a decision.
- **Conversations are kept as files.** When a conversation produced an artifact, save its text under `docs/explore/conversations/YYYY-MM-DD-topic.md`, with the link to the original if there is one. A shared link alone is not enough: it may render only for a signed-in person.
- **No queue item is needed.** A change inside `docs/explore/` does not need a `fix_plan.md` item. The one-item-per-turn loop of `agentic-base` is for convergent work.

## 2. Harvest

Exploration ends when the owner says there is enough to map. The harvest is a `fix_plan.md` item named `harvest-N`. It needs the owner's approval, so it also gets an Issue (see [Where work is tracked](#where-work-is-tracked)). It sorts what exploration produced into three buckets, as the `sample-first` skill does:

| Bucket | Meaning | Goes to |
| --- | --- | --- |
| `locked` | Settled by the owner | Product definition, design principles, Story Chain candidates |
| `R&D required` | Needs a spike or a sample before it can be settled | Back to step 1, scoped |
| `unresolved` | An open question with no plan yet | Open questions of the product definition |

The record is an entry in `docs/change-log.md` with the three buckets and the owner's words of approval. A decision that exploration made in practice but that no harvest approved is a gap, not a fact.

## 3. Map the Story Chain

The Story Chain is the story map. No separate map or `US-###` stories are kept.

| Story map | Story Chain |
| --- | --- |
| Backbone activity | Experience |
| Step under an activity | Moment |
| Story card | Promise, with its Acceptance Checks |
| Cross-cutting rule | Aspect |

Lay the candidate Experiences and Moments out in the order a user meets them, and the Promises under each Moment. The order is written in the Experience and Moment files.

Then draw **release lines**. The first line is the MVP: the smallest set of Promises that tests the product's main hypothesis end to end. Each release slice is written at once as a **draft requirement**:

- An agent opens a pull request that adds `REQ-###` with `status: draft`, naming the slice's Promises in `story_ids`.
- The owner's merge of that pull request is the approval of the release line.
- The set of requirements is the record of the release lines; there is no other map file to keep in step.

## 4. Promote the contract

Promote the Promises of the slice to canonical Story Chain nodes, with their Acceptance Checks, the Aspects that apply, `feature-specs`, and Evidence Ledger drafts. If a Promise's ID changes on promotion, the same pull request fixes the draft requirement.

When the Story Chain validator passes for the slice, the requirement moves from `draft` to `ready`. The validator is the gate; the move is made by a person or an agent in a pull request.

The Promise and its Acceptance Checks are the **single source** of intent and acceptance. The requirement links to them and does not restate them. What the requirement owns is what the Promises do not: the scope of the release, its status, its owner, and its tasks.

## Where work is tracked

The work queue is split at the requirement:

| Before a requirement is `ready` (steps 0 to 4) | Once it is `ready` (steps 5 and 6) |
| --- | --- |
| Work lives in `fix_plan.md`. | Work is tracked as Weaver tasks under the requirement. |
| A line that needs a person's approval also gets an Issue, and its number is written at the end of the line, as `(#12)`. | `fix_plan.md` keeps one line that points at the requirement, for example `- [ ] propagate-1 REQ-003 is executed as Weaver tasks`. |

No piece of work is tracked in both places.

## 5. Execute tasks

Break the requirement into `TASK-###` items, assign them to people or agents, and link each task's branch, pull request, and tests as usual. Each task file lists in `criteria` the Acceptance Check IDs it covers ([DEC-005](../decisions/DEC-005-task-files.md)), and its pull request updates those rows of the Evidence Ledger.

## 6. Verify

- **A task** is verified in Weaver: its Issue is closed, its pull request and checks are the evidence, and a person marks it Verified ([DEC-023](../decisions/DEC-023-mark-a-card-verified-and-say-why-it-has-no-task-file.md)).
- **A requirement** is verified when the Story Chain validator reports that every Acceptance Check of its Promises is covered by the Evidence Ledger. A person reads that report and moves the requirement, linking the report.

## When a Promise changes during execution

Execution can show that the intent was wrong. The change goes to the Promise, through the guideline's `docs/reality-feedback.md`, never only into the requirement. The owner says which of three cases it is in the pull request that changes the Promise:

| Case | What happens |
| --- | --- |
| Wording only; the meaning does not change | Change the Promise in place. The Ledger stays. |
| An Acceptance Check is changed or added before the requirement is verified | Change the Promise. Mark the affected Ledger rows as drift (back to `unknown`). The requirement stays open and gains tasks. |
| The requirement is already verified, or the Promise moves across a release line | Open a new requirement for the change. The old one stays verified and is linked from the new one. |

## Under another guideline

Under `palab-platform` the same roles are played by other artifacts. The requirement is written first and the user stories hang under it; acceptance criteria belong to the stories; the verification record is one `VERIFICATION.md` table per project, kept by the `verify-ac` skill. Steps 1 and 2 still apply. Step 3 maps stories under an existing requirement instead of drawing requirements from release lines. Steps 5 and 6 are the same.

## Who records what

| Place | What it records |
| --- | --- |
| Weaver | The roles it tracks and how it follows a guideline ([DEC-019](../decisions/DEC-019-operating-guidelines-by-reference.md), [DEC-025](../decisions/DEC-025-a-guideline-names-the-roles-of-its-levels.md)), and this guide as a worked example |
| The guideline repository (`agentic-base`, `palab-platform`) | Its own rules: the story map, release slices, the split queue, the change cases, exploration and harvest. Also its `.weaver/process.yaml`, which names its artifact for each role. |
| The project repository (`agentic-browser`) | Its harvests, requirements, tasks, and evidence |

## Worked example: agentic-browser

[agentic-browser](https://github.com/ebrAIn-Lab-3B/agentic-browser) went through steps 0 to 2 between 2026-11-07 and 2026-11-08, before these rules were written.

| Step | What happened | What is left |
| --- | --- | --- |
| 0 | Created from `agentic-base` | Its `.weaver/process.yaml`, after the guideline names its roles |
| 1 | A product definition interview and a UX exploration with an agent, eight rounds of HTML mockups, competitive research, and a UX concept report | Move `docs/proposals/` and `samples/` under the exploration rule; save the two conversations as files |
| 2 | Product definition and design principles approved; sample findings sorted in `docs/sample-pack.md` | Approve two decisions that were used without a harvest: the Story Chain candidate, and the monthly report as a second representative scene |
| 3 | Two Experiences, seven Moments, and seven Promises exist as candidates in `docs/proposals/agentic-browser-direction-revision.md` §6 | Draw the first release line and open the draft requirement |
