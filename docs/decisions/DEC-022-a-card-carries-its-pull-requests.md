# DEC-022: A card carries the pull requests that refer to its Issue, read with the cards

- Status: proposed on 2026-11-08; it becomes accepted when the maintainer merges the pull request that adds it
- Date: 2026-11-08
- Related: `REQ-019`, `US-055`, builds on [DEC-020](./DEC-020-github-pages-open-in-the-built-in-browser.md)

## Context

The only way from a card to its pull request is a right-click menu ([REQ-019](../requirements/REQ-019-a-pull-request-is-one-click-from-its-card.md)). The card does not say whether a pull request exists or what state it is in.

The read of the Project already asks, for every Issue, how many pull requests close it (`closedByPullRequestsReferences`) and how many pages refer to it (`timelineItems` of cross references), and adds the two counts. A pull request reaches an Issue in one of those two ways: a closing keyword (`Closes #number`) is a closing reference, and any other mention (`Refs #number`) is a cross reference. Both lists can give the pull request itself, not only the count, in the same query.

## Decision

1. **The read of the Project asks for the pull requests, not only their number.** For each Issue it asks the last three closing pull requests and the last three pull requests that refer to it, with number, address, title, and state. It is the same query, so it adds no request.
2. **A card has `pulls`.** It is the pull requests of both lists, a pull request in both counted once, with the open ones first and then the most recently referred to; at most three. A card that no pull request refers to has none.
   *Amended on 2026-11-11 (`TASK-114`):* a pull request of the closing list is marked as the one that closes the Issue, and the card says so ("closes it"). After the open ones, the closing ones come before the ones that only refer, so the pull request that ends the work is not pushed out of the three. An open card whose pull requests only refer to it says "no closing pull request yet".
3. **The Overview shows them under the title of the card**, each as `PR #number` with its state (open, merged, closed), as a link. Pressing it opens the page the way [DEC-020](./DEC-020-github-pages-open-in-the-built-in-browser.md) says, and Weaver follows it as DEC-020 item 6 says. An open one is shown plainly, a merged or closed one in a muted color.
4. **The card menu keeps its entries.** It is a shortcut, and the card does not depend on it.
5. **Cards of finished work** (Verified, or a closed Issue) are folded as today, so their pull requests are not drawn until the person shows them. **A card with an open pull request is not finished work** and is not folded (amended on 2026-11-08: the Issue of a task is often closed by one pull request while the pull request that adds its task file is still open, and folding the card hid that pull request).
6. **The requirement view** lists the same pull requests under each task without a button. This is a separate task, because that view reads the evidence of a task by itself and loading it for every task has a cost that is not measured yet.
7. **`weaver list` is not changed here.** An agent gets the list when it needs it, by a change of the JSON contract with its own version.

## Reasons

- Putting the pull request on the card answers the question a person has when they look at it: is there something to review, and where.
- The read of the Project is the one request that everything else waits for. Asking it for a few more fields costs far less than asking again for each card.

## Consequences

- Tasks of `REQ-019` follow once this is accepted: read the pull requests with the cards; show them on the card; show them in the requirement view.
- The reply of the Project read is larger by up to six small items for each card. For a Project of a few hundred cards this is small, and it is checked on the Project of the maintainer.
- A pull request that refers to an Issue only in a comment of a different repository, or that is older than the last three, is not on the card. The menu still finds it.

## Decision points for the maintainer

- **Item 2, at most three.** A card with many references would be crowded; three shows the open one and the last merged one. The alternative is to show only the open ones, which hides what was merged.
- **Item 1, read with the cards.** The alternative is to read them only when a card is pressed or hovered, which keeps the first read small and makes the card empty until then.

## Not decided yet

- Whether the requirement view loads the pull requests by itself or on a press.
- Whether `weaver list` gives an agent the same list.
