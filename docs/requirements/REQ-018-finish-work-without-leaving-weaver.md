---
id: REQ-018
type: requirement
title: Work started in Weaver is finished without leaving Weaver
status: draft
owner: ebrAIn.lab
story_ids: [US-053]
repository: ebrAIn-Lab-3B/Weaver
github_project: ebrAIn.lab Kanban
---

# Work started in Weaver is finished without leaving Weaver

## Problem

Weaver opens a pull request (for example a starting process file) and then sends the person to a browser to review, comment, and merge it. The person leaves VS Code (and, later, the Weaver application), does the work on GitHub, and comes back. The trip breaks the flow, and Weaver does not know what happened on the other side until the person refreshes.

## Outcome

A person opens the GitHub page of a pull request or an Issue inside Weaver, on GitHub's own page, and finishes there: reads, comments, reviews, merges. Weaver notices the result and updates the board without a manual refresh. The browser outside stays available as an explicit choice.

## Acceptance criteria

- A small prototype shows which ways of showing GitHub's own page inside VS Code 1.90 and later work (the built-in integrated browser, the Simple Browser, a webview), and the result is recorded in a decision. GitHub may refuse to be shown inside another page; the decision says which ways are refused and why.
- Where the page is shown, the person signs in to GitHub on the page itself. Weaver does not put its own token into the page and does not read the page's content.
- When the person finishes there, Weaver reads the state of the pull request or Issue through the API (opened, merged, closed, checks) and updates the Overview without a manual refresh.
- A merge, a review, or a comment made on the page is the person's own act on GitHub. Weaver's own writes keep their plan and confirmation ([DEC-008](../decisions/DEC-008-agent-identity-and-write-confirmation.md)).
- "Open in the browser" remains one explicit action, so the person can still leave when they want to.
- If the extension cannot do it, the decision says so and this requirement is carried to the application implementation with the same criteria, and the decision records how the application shows the page.

## Ways considered

Input for the decision that the prototype ends. Checked on 2026-11-08: GitHub answers with `X-Frame-Options: deny`, so any way that puts github.com inside another page (an iframe) shows nothing. VS Code 1.145 ships a built-in browser view next to the iframe-based Simple Browser; whether an extension can open a URL in it was not confirmed.

| Way | What the person gets | Against it | Answer to that |
| --- | --- | --- | --- |
| A. VS Code's built-in browser view | GitHub's own page, in a tab of the editor, with full interaction | An extension may not be able to open it by code; it may not exist in older VS Code versions (Weaver supports 1.90 and later) | The prototype tests it. Where it is missing, fall back to C or D |
| B. Simple Browser or a webview with an iframe | The same, if it worked | GitHub refuses to be framed, so it stays blank | None that is acceptable: a proxy that strips the header is not used. Dropped unless the prototype shows otherwise |
| C. GitHub's own extension for pull requests | Reviewing, commenting, checks, and merging in the editor, signed in once | Not GitHub's web page, and a second extension to install | Recommend it, do not require it; Weaver opens the pull request in it when it is installed |
| D. The system browser, with a way back | GitHub's own page, complete | It leaves VS Code, which is the break this requirement is about | Weaver reads the state through the API and brings the person back to the right card when the work is done |
| E. A browser view in the Weaver application | GitHub's own page inside the application | Only in the application, not in the extension | This is where the requirement goes if A does not work |

Whatever way is chosen, Weaver reads the state of the pull request through the API, so the Overview is up to date when the person returns.

## Open decisions

- Whether Weaver also offers a merge or close from its own dialog, in addition to showing GitHub's page. The maintainer prefers GitHub's own page; the dialog is a later option if the page cannot be shown.
- How often Weaver reads the state while a page is open, and whether it stops when the page closes.

## Tasks

Tasks are listed here once the open decisions are recorded.

Origin: the maintainer, 2026-11-08, while trying the starting process file in the editor: a review that has to leave VS Code feels like a break in the work.

## Evidence policy

This requirement is not complete when a task is merely reported as done. Completion requires repository changes, checks, and an explicit review of remaining gaps.
