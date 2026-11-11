# DEC-026: From a conversation to a requirement; work before a requirement is an ordinary card

- Status: proposed on 2026-11-11; it becomes accepted when the maintainer merges the pull request that adds it
- Date: 2026-11-11
- Related: `REQ-016`, `TASK-112`, `US-054`, `US-057`, keeps [DEC-025](./DEC-025-minimal-model-of-a-development-policy.md), [DEC-015](./DEC-015-process-configuration.md), [DEC-022](./DEC-022-a-card-carries-its-pull-requests.md), [DEC-024](./DEC-024-a-card-without-a-task-file-gets-one.md)

## Context

A product often starts as conversations with an agent: what to build, for whom, how it should feel. Mockups, research, and draft documents follow. Requirements come later, once the team has settled what the conversations explored. Until then, nothing of this work is a requirement or a task, but the team still wants to see it on the board and find its history later.

The question was what Weaver must add to carry this. It was tried on 2026-11-11 with a card for an exploration round, whose Issue named no task:

- the card took its column from its status label, as every card does;
- a pull request that referred to the Issue was attached to the card ([DEC-022](./DEC-022-a-card-carries-its-pull-requests.md));
- the idle days of the process file applied to it;
- no gap was reported, and no task file was offered, because the offer of [DEC-024](./DEC-024-a-card-without-a-task-file-gets-one.md) applies only to a card whose title names a task.

Weaver already carries it. What was missing is the description of the loop, so that a guideline can fit its own steps into it.

## Decision

1. **The loop, as Weaver knows it.**

   ```text
   conversations ──→ kept as files in the project's repository
        │
        └──→ a card before a requirement (an Issue)  ← on the board; links the conversation files
                 │   more exploration: another card · converging: the guideline's own review
                 ▼
             intent, refined by the guideline (outside Weaver)
                 ▼
             requirement (REQ) ──→ tasks (TASK) ──→ pull requests ──→ verified
   ```

2. **Work before a requirement is an ordinary card.** It is an Issue whose title names no task. It gets no new card type, label, setting, or check. Its column, evidence rules, and idle days come from the repository's process file like any card's ([DEC-015](./DEC-015-process-configuration.md)).
3. **Conversations are kept in the project's repository** as readable files, and a card or a requirement links them as text. A shared link alone is not enough: it may render only for a signed-in person, so neither an agent nor another reader can read it. Where the files live and in what form is the guideline's decision ([DEC-025](./DEC-025-minimal-model-of-a-development-policy.md) item 4).
4. **Refining conversations into intent is the guideline's work.** Weaver shows the pull requests of that work on the card; it does not read or check the intent.
5. **The guideline decides the rest**: how work before a requirement is split into cards (one per round, per topic, per decision), when such a card is closed, how what was settled is approved, and how a card leads to a requirement. These join the questions of [Work under an operating guideline](../onboarding/operating-guidelines.md).
6. **Weaver's documents show this loop with an abstract example only.** No project or guideline repository is named as its example, so Weaver does not depend on how one project ran it.

### Example

A team talks with an agent about a new product in two sessions: one on the problem and the first user, one on the interface. Both transcripts are saved as Markdown in the product's repository. The team opens one Issue, "Exploration round 1", links the two files from it, and puts it on the board in In progress. Mockups and drafts made during the round are pull requests that refer to the Issue, and they appear on its card. When the team settles what the round found, the pull request that records it closes the Issue. Later the first release is written as `REQ-001` with its tasks, and the requirement links the conversations it came from.

## Reasons

- The behavior that was needed already exists; a new card type would be a second way to say the same thing.
- Keeping conversations in the repository makes the reasons behind a requirement readable months later, by people and agents alike (`REQ-013`).
- How a team explores varies more than how it delivers. Leaving it to the guideline keeps Weaver's model minimal ([DEC-025](./DEC-025-minimal-model-of-a-development-policy.md)).

## Consequences

- No code changes for the loop itself. Finishing such a card from the editor was added afterwards ([DEC-023](./DEC-023-mark-a-card-verified-and-say-why-it-has-no-task-file.md) item 1, amended by `TASK-113`): a card before a requirement is finished either by the pull request that records its outcome and closes it, or from the card with **Mark verified**, which closes the Issue after a yes.
- `operating-guidelines.md` gains the questions of item 5.
- `REQ-016` records that a card before a requirement is an ordinary card; `US-054` and `US-057` point here.
- Capturing a conversation from inside Weaver (`REQ-013`) stays a separate requirement; this decision only says where the result goes.

## Not decided yet

- Whether the Requirement view lists the conversation files a requirement links.
