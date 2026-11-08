# Finish one piece of work with Weaver (round 2, edition 2.1)

This guide sets up the agentic-browser project, which follows the way of working of agentic-base, in Weaver, and then follows one piece of work from its start to its end. Using a tool we built ourselves, for real work, is called dogfooding. Installing and the first setup were covered by the [first round](dogfooding-round-1.md). The same guide in Korean is [here](dogfooding-round-2.ko.md).

If a step does not work or gets in your way, stop there and report it as [described at the end](#report-friction). The place where you got stuck is exactly the place we need to fix.

## What to know first

- **agentic-base** is a base that is copied whole when a new project is made. **agentic-browser** is a project made that way. When it was copied, the Weaver file (`.weaver/process.yaml`) did not exist yet, so agentic-browser has none. This guide fills that gap.
- A **process file** (`.weaver/process.yaml`) is where a repository says how it manages its work: which column a card goes in, and what counts as evidence that the work is done.
- Check whether agentic-base has put that file on `main`. Today it is in [pull request #2 of agentic-base](https://github.com/ebrAIn-Lab-3B/agentic-base/pull/2), waiting for the team's review. Until it is merged, step 2 needs the `ref` line.
- A pull request (PR) is a request to merge a change. An Issue is a work item on GitHub.

## What you need

- VS Code 1.90 or later
- A GitHub account that can read and write agentic-browser and the Project (number 1 of the `ebrAIn-Lab-3B` organization)
- Node.js, and the GitHub command-line tool (`gh`) signed in

## 1. Install

1. From the [latest Release](https://github.com/ebrAIn-Lab-3B/Weaver/releases), download `weaver-<version>.vsix` and `weaver.js`.
2. In VS Code, open the Extensions view, press `…`, choose **Install from VSIX…**, and pick the file.
3. If you installed the extension `palab.weaver` earlier, remove it first. The name changed, so both can show. The new one is `ebrain-lab.weaver`.
4. Reload VS Code (command palette, *Developer: Reload Window*). A **Weaver** icon should be in the bar on the left.

The terminal tool is not installed. Run the `weaver.js` you downloaded as `node weaver.js <command>`. The examples below assume you run them in the folder that has `weaver.js`.

## 2. Put a setup file in the folder of your projects

In the folder that holds agentic-browser (for example `ebr_prj`), create the file `.weaver/config.yaml`. Every repository under that folder follows it. The file stays on your computer and is never put in a repository.

```yaml
project:
  owner: ebrAIn-Lab-3B
  number: 1
repositories:
  - ebrAIn-Lab-3B/agentic-browser
guideline:
  repository: ebrAIn-Lab-3B/agentic-base
  ref: weaver-process-file
```

What the lines mean:
- `project` is the GitHub Project whose cards are shown.
- `repositories` is the list of repositories to show. agentic-browser has no Issue yet, so it must be listed here to get a lane in the Overview. If you already have a `repositories` list, do not delete it; add the one agentic-browser line. A repository that is not listed disappears from the Overview.
- `guideline` points to the repository and file of the guideline to follow. Without a `path`, it reads `.weaver/process.yaml`.
- `ref: weaver-process-file` is needed only until PR #2 of agentic-base is merged. After that, delete this line, and the file is read from `main`.

If you made your setup with **Weaver: Set Up**, that file is `~/.weaver/config.yaml`. You may put the same `guideline` line there. The file in the folder is used before your personal file.

## 3. Find agentic-browser in the Overview

1. Press the Weaver icon and choose **Open the Overview**. If it is already open, press **Refresh**.
2. Find the lane of agentic-browser. It should show:
   - under the lane title: `Guideline: ebrAIn-Lab-3B/agentic-base .weaver/process.yaml@weaver-process-file (from the root file)`
   - under that: `No process file yet. One can be started from this guideline.`
   - a **Start a process file** button
   - `no cards`, since it has no card yet
3. A terminal shows the same:

   ```bash
   node weaver.js process --text
   ```

   The line of agentic-browser looks like this. The `can-start` at the end means a starting file can be offered.

   ```text
   ebrAIn-Lab-3B/agentic-browser	missing	columns=default ...	guideline=ebrAIn-Lab-3B/agentic-base@weaver-process-file(root) can-start
   ```

If there is no lane, check the location of the file in step 2 and the `repositories` line.

## 4. Start the process file

1. Press **Start a process file** in the lane of agentic-browser.
2. A dialog shows the whole file that would be made. Its first line is:

   ```text
   # Started from the guideline ebrAIn-Lab-3B/agentic-base .weaver/process.yaml@weaver-process-file.
   ```

   The rest is the file of agentic-base as it is. Read it. It sets the columns by six status labels (such as `status:backlog`) and asks for a merged PR as evidence that work is done.
3. If it is right, press **Open the pull request**. If you cancel, nothing is put anywhere.
4. When the notice appears, press **View it**. The PR page of agentic-browser opens in a new tab right next to the one you were looking at. The branch is `docs/weaver-process-file`.
5. In that tab, read the PR and merge it. Nothing is written to the default branch before this PR is merged.

After you merge it and refresh the Overview, the **Start a process file** button is gone. In a terminal, the agentic-browser line of `weaver process --text` now says `read`.

To do the same in a terminal, first show the plan only, then run it again with the number from the plan to open the PR:

```bash
node weaver.js process start --repository ebrAIn-Lab-3B/agentic-browser
node weaver.js process start --repository ebrAIn-Lab-3B/agentic-browser --approve <number from the plan>
```

## 5. Create the six status labels

The process file you just made decides a card's column by the labels of its Issue. agentic-browser has none of these labels yet, so create them once. Without them you cannot add the label to an Issue in the next step.

PowerShell:

```powershell
foreach ($label in 'backlog','ready','in-progress','blocked','review','verified') {
  gh label create "status:$label" --repo ebrAIn-Lab-3B/agentic-browser
}
```

Git Bash:

```bash
for label in backlog ready in-progress blocked review verified; do
  gh label create "status:$label" --repo ebrAIn-Lab-3B/agentic-browser
done
```

If a label already exists, you see "already exists". That is fine.

## 6. Put one piece of work on the board

The next work of agentic-browser is in `fix_plan.md`. Pick one that needs a person to decide and make an Issue of it. The example is `contract-final-2` (settling the Experience of the Story Chain).

The proposal in agentic-base (under review) is this: keep the work in `fix_plan.md`, make an Issue only for work that needs a person's approval or that others should see, and write the Issue number at the end of that line of `fix_plan.md`.

1. Make the Issue.

   ```bash
   gh issue create --repo ebrAIn-Lab-3B/agentic-browser --label status:backlog --title "Settle the Experience (contract-final-2)" --body "contract-final-2 of fix_plan.md. Settle one or more files in docs/contracts/story-chain/experiences/."
   ```

   It prints the address of the new Issue. If it is the first Issue, the number is 1.
2. Put that Issue on the Project.

   ```bash
   node weaver.js project add https://github.com/ebrAIn-Lab-3B/agentic-browser/issues/1
   ```

   A plan appears. If it is right, run the command again with the number it printed in `--approve <number>`.
3. Refresh the Overview. A new card is in **Backlog** in the lane of agentic-browser.
4. At the end of the `contract-final-2` line in `fix_plan.md`, write `(#1)`. A line with a number is work that is on the board.

There is a reason not to use `weaver task create` here. That command is for a repository that has `REQ-number` requirement files. agentic-browser has none yet, so the Issue is made by hand.

## 7. Start the work and finish it

1. When you start, move the card to In progress. It first shows what it will change, and changes it only when you approve.

   ```bash
   node weaver.js card move ebrAIn-Lab-3B/agentic-browser#1 --to in-progress
   ```

2. Write `Closes #1` in the body of the PR that finishes the work. When the PR is merged, the Issue closes by itself. If no merged PR closes it, the card carries the mark "no merged pull request that closes the Issue".
3. In the Overview, right-click the card and choose **Pull request**. The PR page opens in a new tab. If it asks you to sign in, do it in that tab.
4. In that tab, read the PR, comment, and merge it.
5. When you come back from another window, or after about a minute, the status bar at the bottom says that the pull request was merged. The card changes by itself.

To open a page in the system browser instead, choose **Issue #number in the system browser** in the card menu.

## 8. A last check

```bash
node weaver.js reconcile
```

If it says there is nothing to do, the board and the files agree. If it says something needs fixing, read the plan and, if it is right, approve it with `--approve`.

**There is one known inconvenience.** When a PR closes an Issue, the label `status:verified` is not added by itself. If a closed card shows the warning "closed without status:verified (verification gap)", add that label to the Issue yourself:

```bash
gh issue edit 1 --repo ebrAIn-Lab-3B/agentic-browser --add-label status:verified --remove-label status:in-progress
```

This is not fixed yet. Tell us if you meet it.

## Report friction

Open [the feedback form](https://github.com/ebrAIn-Lab-3B/Weaver/issues/new?template=dogfooding-feedback.yml). It asks four things: what you were trying to do, what you expected, what happened, and how much it got in the way. A screenshot helps. Short is fine.

## When you are stuck

| What happens | What to try |
| --- | --- |
| There is no lane for agentic-browser | Check the location of the file and the `repositories` line of step 2, then press **Refresh**. |
| The lane is there but the guideline line is not | Check the `guideline` line of step 2. `repository` must look like `owner/name`. |
| It says the guideline file was not found and offers the defaults instead | agentic-base has no file on `main` yet. Check that you put the `ref: weaver-process-file` line of step 2. |
| Starting is refused with "already has a process file" | agentic-browser already has one. A guideline never changes an existing file. To change it, change that file by a PR. |
| The starting-file PR is refused as "already open" | Merge or close the open PR (`docs/weaver-process-file`) and try again. |
| It says the "project" scope is missing | Press **Sign in to GitHub** again and allow the `project` scope. |
| Two extensions show (`palab.weaver` and `ebrain-lab.weaver`) | Remove the old one (`palab.weaver`) and reload VS Code. |
| `gh issue create` fails because of the label | Check that you created the labels in step 5. |
| A PR opens in the system browser instead of VS Code | This VS Code has no built-in browser. Opening in the system browser is the normal behavior then. |
| You chose **Pull request** on a card and it says "No pull request refers to this Issue." | Check that the PR body has `Closes #number` or `Refs #number`. |

## What Weaver does not do

Weaver does not change a card, a label, or a file before it shows what it will change and you approve. While it only reads, nothing changes. In this guide, the things a person does by hand are creating the labels, creating the Issue, and editing `fix_plan.md`.
