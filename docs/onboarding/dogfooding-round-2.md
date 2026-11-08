# Finish one piece of work with Weaver (round 2)

Using a tool we built ourselves, for real work, is called dogfooding. The [first round](dogfooding-round-1.md) went as far as installing, setting up, and opening the Overview. This second round follows one piece of work from the start to the end. The same guide in Korean is [here](dogfooding-round-2.ko.md).

If a step does not work or gets in your way, stop there and report it as [described at the end](#report-friction). You do not have to finish the list. The place where you got stuck is exactly the place we need to fix.

## What you need

- VS Code 1.90 or later
- A GitHub account that can read and write the Project and its repositories
- For the terminal tool: Node.js, and the GitHub command-line tool (`gh`) signed in

## 1. Install

1. From the [latest Release](https://github.com/ebrAIn-Lab-3B/Weaver/releases), download `weaver-<version>.vsix` and `weaver.js`.
2. In VS Code, open the Extensions view, press `…`, choose **Install from VSIX…**, and pick the file.
3. If you installed the extension `palab.weaver` earlier, remove it first. The name changed, so both can show. The new one is `ebrain-lab.weaver`.
4. Reload VS Code (command palette, *Developer: Reload Window*). A **Weaver** icon should be in the bar on the left.

The terminal tool is not installed. Run the `weaver.js` you downloaded as `node weaver.js <command>`. The examples below write just `weaver`.

## 2. Set up

This is step 2 of the first round. Run **Weaver: Set Up** from the command palette, sign in to GitHub, and pick the Project to show. At the end it shows the file; read it and press **Write**. The file exists only on your computer and is never put in a repository.

If you keep your projects in folders and want each folder to have its own setup, create `.weaver/config.yaml` in that folder. An example and the explanation are in [Register your own Project](register-your-project.md).

If your organization has a way of working it follows (an operating guideline), add one `guideline` line to the same file. Then a repository with no process file is offered a starting file from that guideline. The details are in [Work under an operating guideline](operating-guidelines.md).

## 3. Look at the repositories in the Overview

1. Press the Weaver icon and choose **Open the Overview**.
2. Each repository has one lane, and its cards sit in the columns Backlog, Ready, In progress, Blocked, Review, and Verified.
3. A line `Guideline: …` under a repository's name is the guideline that applies to it. With no guideline the line is not there.
4. A repository with a **Start a process file** button has no process file yet. A process file is `.weaver/process.yaml`, where the repository says how it manages its work.

## 4. Start a process file for a repository that has none

1. Press **Start a process file** in the lane.
2. A dialog shows the whole file that would be made, and where it comes from (the guideline, or the defaults when there is none). Read it.
3. If it is right, press **Open the pull request**. A pull request (PR) is a request to merge a change. If you cancel, nothing is put anywhere.
4. When the notice says the PR is open, press **View it**. The PR page opens in a new tab inside VS Code.

This is what should happen:
- Nothing is written to the default branch; only a PR appears.
- The file applies only after the team reviews and merges the PR.

In a terminal, `weaver process start --repository owner/name` does the same. It shows only the plan first. Run it again with the number from the plan in `--approve <number>`, and the PR is opened.

## 5. Create one task

A piece of work is a task that belongs to a requirement. In a terminal:

```bash
weaver task create --title "A short title" --requirement REQ-number --criteria AC-number
```

- The title cannot contain a colon (`:`) or a line break.
- The command shows the plan first. It has three parts: create an Issue on GitHub, put a card on the Project, and open a PR with the task file.
- Read the plan and, if it is right, run the command again with the numbers it printed in `--approve number,number,number`.

After a moment, refresh the Overview and the new card is in Backlog.

## 6. Do the work and leave evidence

1. Write `Closes #issue-number` in the body of the PR that finishes the work. When the PR is merged, the Issue closes by itself.
2. A card treats a closed Issue as Verified. But if none of the merged PRs closes that Issue, the card carries the mark "no merged pull request that closes the Issue".
3. To move a card to another column, use `weaver card move <card> --to <column>`. It also shows what it will change first, and changes it only when you approve.

## 7. Finish inside VS Code

1. In the Overview, right-click the card and choose **Pull request**. If there are several PRs, pick one.
2. The PR page opens in a new tab right next to the one you were looking at. If GitHub asks you to sign in, do it in that tab. Once is enough for a while.
3. In that tab, read the PR, comment, and merge it.
4. When you come back from another window, or after about a minute, the status bar at the bottom says that the pull request was merged. The card in the Overview changes by itself.

To open a page in the system browser instead, choose **Issue #number in the system browser** in the card menu.

## 8. A last check

```bash
weaver reconcile
```

If it says there is nothing to do, the board and the files agree. If it says something needs fixing, read the plan and, if it is right, approve it with `--approve`.

**There is one known inconvenience.** When a PR closes an Issue, the label `status:verified` is not added by itself. If a closed card shows the warning "closed without status:verified (verification gap)", add that label to the Issue yourself. This is not fixed yet. Tell us if you meet it.

## Report friction

Open [the feedback form](https://github.com/ebrAIn-Lab-3B/Weaver/issues/new?template=dogfooding-feedback.yml). It asks four things: what you were trying to do, what you expected, what happened, and how much it got in the way. A screenshot helps. Short is fine.

## When you are stuck

| What happens | What to try |
| --- | --- |
| The Overview is empty and says there is no setup | Do the setup of step 2 again. |
| It says the "project" scope is missing | Press **Sign in to GitHub** again and allow the `project` scope. |
| Two extensions show (`palab.weaver` and `ebrain-lab.weaver`) | Remove the old one (`palab.weaver`) and reload VS Code. |
| A PR should open in VS Code, but the system browser opens | This VS Code has no built-in browser. Opening in the system browser is the normal behavior then. |
| You chose **Pull request** on a card and it says "No pull request refers to this Issue." | Check that the PR body has `Closes #issue-number` or `Refs #issue-number`. |
| `weaver task create` stops because of the title | Take the colon (`:`) out of the title. |
| The starting-file PR is refused as "already open" | Merge or close the open PR (`docs/weaver-process-file`) and try again. |

## What Weaver does not do

Weaver does not change a card, a label, or a file before it shows what it will change and you approve. While it only reads, nothing changes.
