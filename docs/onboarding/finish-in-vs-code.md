# Finish work on GitHub's own page inside VS Code

When Weaver opens a GitHub page (a pull request or an Issue) from a card, a menu, or a notice, it opens it in a tab inside VS Code. You do not have to leave for a browser and come back. You read, comment, and merge on the page, and Weaver notices the result and updates the Overview. This guide explains that behavior, the sign-in, and the settings for where the tab goes. The reasons are in [DEC-020](../decisions/DEC-020-github-pages-open-in-the-built-in-browser.md). The same guide in Korean is [here](finish-in-vs-code.ko.md).

## How a page opens

- In the Overview, right-click a card and choose **Issue #number on GitHub** or **Pull request**, or press an `#number` link in the requirement view: the GitHub page opens in a new tab, right next to the tab you were looking at. A card with no requirement opens its Issue page when you simply press it; a card with a requirement opens the requirement view.
- The tab is the **built-in browser** of VS Code. It is the real GitHub page, so you can read, comment, review, and merge right there.
- If this VS Code has no built-in browser (an old version), the page opens in the system browser. That is the normal behavior. Weaver still notices the result.
- To open a page in the system browser on purpose, choose **Issue #number in the system browser** in the card menu.

## Sign-in

You sign in to GitHub on the page itself, in the tab. Weaver does not put its own token in the page and does not read the page. Everything that happens on the page is what you do on GitHub.

How long the sign-in is kept is set by the VS Code setting `workbench.browser.dataStorage`.

| Value | How far the sign-in is kept |
| --- | --- |
| `default` (the default) | Acts like `global` for a local workspace and like `workspace` for a remote one. |
| `global` | All workspaces share one sign-in. Once is enough for a long time. |
| `workspace` | Shared only within the same workspace. |
| `ephemeral` | Each tab has its own, gone when the tab is closed, so you sign in every time. |
| `agent` | **Do not use.** It shares one in-memory store with the pages that agents open, so an agent can see what you sign in with. |

**One thing to know.** In a workspace you have not trusted (a folder VS Code opens in "restricted mode"), this setting is ignored and `ephemeral` is always used, so you sign in every time. For a folder you can trust, trust the workspace in VS Code.

## Where the tab goes

The VS Code setting `workbench.browser.newTabPlacement` decides where the tab goes. Weaver does not choose a column.

| Value | Where the tab opens |
| --- | --- |
| `activeGroup` (the default) | The editor group you are using, right next to the tab you were looking at. |
| `sideGroup` | A group of its own to the side. The next tab opens in the same group, and no other editor opens in it. Choose this if you want the Overview on one side and the pull request pages on the other. |
| `window` | A new window of its own. The next tab opens in that window. |

## What Weaver does after it opens a page

Weaver keeps watching the pull request or Issue page that it opened, and reads the result from GitHub. When it reads and when it stops:

- It reads once right after the page is opened. This first read only sets what later reads are compared with, and gives no notice.
- While a VS Code window is in front, it reads about every minute. When you come back from another window, it reads at once, but not more often than every ten seconds.
- It stops ten minutes after the page was opened. It also stops when the page is merged or closed.
- It does not read while the window is behind, so it does not send GitHub requests for nothing.

A change is shown for ten seconds in the status bar at the bottom:
- Merged: "Pull request #number in … was merged."
- Closed without a merge: "Pull request #number in … was closed without a merge."
- An Issue closed: "Issue #number in … was closed."
- The checks changed: "Checks of pull request #number in …: passing." (running, failing, or passing)

With the notice, the Overview reads the Project again, so the card is already in place when you come back. To read, Weaver silently uses the GitHub sign-in that VS Code already has. It never asks you to sign in, and with no sign-in it reads nothing.

## Try it

This takes five minutes. You need one open pull request, and the card of the Issue it points to must be in the Overview (the PR body points to it with `Closes #number` or `Refs #number`).

1. In the Overview, right-click that card and choose **Pull request**. If there are several PRs, pick one.
2. The pull request page opens right next to the tab you were looking at. The first time, sign in to GitHub in that tab.
3. If the PR is new and its checks are running, a notice in the status bar changes from "running" to "passing". It usually comes within a minute.
4. **Within ten minutes of opening it**, merge the PR in the tab.
5. Within a minute, the status bar says "Pull request #number in … was merged." and the card in the Overview changes. If you go to another window after merging and come back, it comes sooner.
6. If you missed the notice, check the log. In the panel at the bottom open **Output**, and choose **Weaver** in the drop-down on the right. A line like this should be there:

   ```text
   page ebrain-lab-3b/weaver|pull|251: open/passing -> merged/-
   ```

   The line reads "repository|pull request|number: earlier state/checks -> new state/checks".

## Limits

- Weaver watches **only the pages it opened**. A PR you open in a browser yourself and merge there is not noticed. Press **Refresh** in the Overview.
- If you merge more than ten minutes after opening, no notice comes. Press **Refresh**.
- When a PR closes an Issue, the label `status:verified` is not added by itself. If a closed card shows the warning "closed without status:verified (verification gap)", add the label to the Issue yourself. This is not fixed yet.
- The ten minutes and the minute are a first guess. If you find better values while using it, tell us.

## When you are stuck

| What happens | What to try |
| --- | --- |
| A page opens in the system browser, not in VS Code | This VS Code has no built-in browser. That is the normal behavior. |
| GitHub asks you to sign in every time | `workbench.browser.dataStorage` is `ephemeral`, or the workspace is not trusted. See the sign-in section above. |
| You merged, but no notice came | More than ten minutes passed, the VS Code window was behind, or Weaver did not open that page. Press **Refresh** in the Overview. |
| You chose **Pull request** on a card and it says "No pull request refers to this Issue." | Check that the PR body has `Closes #number` or `Refs #number`. |
| New tabs open in another group and that is awkward | Set `workbench.browser.newTabPlacement` back to `activeGroup` (the default). |
| The log has a line "could not be read" | The GitHub sign-in has expired, or there is a network problem. Press **Sign in to GitHub** in the Overview again. |

## Report friction

Open [the feedback form](https://github.com/ebrAIn-Lab-3B/Weaver/issues/new?template=dogfooding-feedback.yml). Say what you were trying to do, what you expected, what happened, and how much it got in the way. Short is fine.
