# Finish one piece of work with Weaver (round 2, edition 2.1)

This guide sets up the agentic-browser project, which follows the way of working of agentic-base, in Weaver, and then follows one piece of work from its start to its end. Using a tool we built ourselves, for real work, is called dogfooding. Installing and the first setup were covered by the [first round](dogfooding-round-1.md). The same guide in Korean is [here](dogfooding-round-2.ko.md).

If a step does not work or gets in your way, stop there and report it as [described at the end](#report-friction). The place where you got stuck is exactly the place we need to fix.

This guide has two marks.

- **(agentic-base specific)**: something that is needed because the project follows agentic-base. A project that does not follow agentic-base can skip it. Creating the labels and `fix_plan.md` are of this kind.
- **One person does this**: a step that one person on the team does and the others skip. If three people follow the guide together, only one of them does this step. For each such step, the guide says how to see whether someone has already done it, and which step to jump to if so.

## What to know first

- **(agentic-base specific)** **agentic-base** is a base that is copied whole when a new project is made. **agentic-browser** is a project made that way. When it was copied, the Weaver file (`.weaver/process.yaml`) did not exist yet, so agentic-browser has none. This guide fills that gap.
- A **process file** (`.weaver/process.yaml`) is where a repository says how it manages its work: which column a card goes in, and what counts as evidence that the work is done.
- **(agentic-base specific)** That file of agentic-base is on `main` (pull request #3, 2026-11-11), so Weaver reads it from there. An earlier version of this guide read it from the branch of pull request #2 (`ref: weaver-process-file`); that pull request is closed and its branch is gone, so remove that `ref` line if your setup file still has it.
- A pull request (PR) is a request to merge a change. An Issue is a work item on GitHub.

## What you need

- VS Code 1.90 or later
- A GitHub account that can read and write agentic-browser and the Project (number 1 of the `ebrAIn-Lab-3B` organization)
- Node.js, and the GitHub command-line tool (`gh`) signed in

## Who does which step

| Step | Who | If it is already done |
| --- | --- | --- |
| 1. Install | Everyone | |
| 2. The setup file | Everyone (on your own computer) | |
| 3. Find it in the Overview | Everyone | |
| 4. Start the process file | **One person** | Go to step 5 |
| 5. Create the status labels (agentic-base specific) | **One person** | Go to step 6 |
| 6. Put a piece of work on the board | **One person for each piece of work** | Go to step 7 |
| 7. Start the work and finish it | The person who takes that work | |
| 8. A last check | Everyone | |

## 1. Install

1. From the [latest Release](https://github.com/ebrAIn-Lab-3B/Weaver/releases), download `weaver-<version>.vsix` and `weaver.js`.
2. In VS Code, open the Extensions view, press `…`, choose **Install from VSIX…**, and pick the file.
3. Reload VS Code (command palette, *Developer: Reload Window*). A **Weaver** icon should be in the bar on the left.

### Get the terminal tool ready

The terminal tool is not installed. You run one file (`weaver.js`) directly with Node.js.

1. Put the `weaver.js` you downloaded in the folder that holds your projects (for example `ebr_prj`). The tool looks for the setup file (`.weaver/config.yaml`) in the folder where you run it.
2. Open a terminal at the bottom of VS Code (menu *Terminal*, *New Terminal*) and go to that folder. For example:

   ```powershell
   cd C:\Users\yourname\ebr_prj
   ```

3. Run the line below. If a list of commands appears, you are ready.

   ```bash
   node weaver.js --help
   ```

Every terminal command in this guide is run in this terminal as `node weaver.js <command>`. If you put `weaver.js` somewhere else, add the project folder at the end of the command, as in `--root C:\Users\yourname\ebr_prj`.

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
```

What the lines mean:
- `project` is the GitHub Project whose cards are shown.
- `repositories` is the list of repositories to show. agentic-browser has no Issue yet, so it must be listed here to get a lane in the Overview. If you already have a `repositories` list, do not delete it; add the one agentic-browser line. A repository that is not listed disappears from the Overview.
- **(agentic-base specific)** `guideline` points to the repository and file of the guideline to follow. Without a `path`, it reads `.weaver/process.yaml`.
- **(agentic-base specific)** Without a `ref`, the guideline is read from the default branch (`main`) of agentic-base.

If you made your setup with **Weaver: Set Up**, that file is `~/.weaver/config.yaml`. You may put the same `guideline` line there. The file in the folder is used before your personal file.

## 3. Find agentic-browser in the Overview

1. Press the Weaver icon and choose **Open the Overview**. If it is already open, press **Refresh**.
2. Find the lane of agentic-browser. It should show:
   - under the lane title: `Guideline: ebrAIn-Lab-3B/agentic-base .weaver/process.yaml (from the root file)`
   - under that: `No process file yet. One can be started from this guideline.`
   - a **Start a process file** button
   - `no cards`, since it has no card yet
3. A terminal shows the same:

   ```bash
   node weaver.js process --text
   ```

   The line of agentic-browser looks like this. The `can-start` at the end means a starting file can be offered.

   ```text
   ebrAIn-Lab-3B/agentic-browser	missing	columns=default ...	guideline=ebrAIn-Lab-3B/agentic-base@default(root) can-start
   ```

If there is no lane, check the location of the file in step 2 and the `repositories` line.

## 4. Start the process file (one person)

**One person does this.** First check whether someone has already done it.

- If the lane of agentic-browser in the Overview has no **Start a process file** button, or the agentic-browser line of `node weaver.js process --text` says `read`, someone has already made it and merged it. **Skip to step 5.**
- If the button is there but pressing it is refused as "already open", someone has opened the PR and has not merged it yet. Open that PR (the branch name is `docs/weaver-process-file`) and merge it, or wait for it to be merged. When it is merged, **go to step 5.**
- If neither, do the following.

1. Press **Start a process file** in the lane of agentic-browser.
2. A dialog shows the whole file that would be made. Its first line is:

   ```text
   # Started from the guideline ebrAIn-Lab-3B/agentic-base .weaver/process.yaml.
   ```

   The rest is the file of agentic-base as it is. Read it. **(agentic-base specific)** This file sets the columns by six status labels (such as `status:backlog`) and asks for a merged PR as evidence that work is done.
3. If it is right, press **Open the pull request**. If you cancel, nothing is put anywhere.
4. When the notice appears, press **View it**. The PR page of agentic-browser opens in a new tab right next to the one you were looking at. The branch is `docs/weaver-process-file`.
5. In that tab, read the PR and merge it. Nothing is written to the default branch before this PR is merged.

After you merge it and refresh the Overview, the **Start a process file** button is gone. In a terminal, the agentic-browser line of `weaver process --text` now says `read`.

To do the same in a terminal, first show the plan only, then run it again with the number from the plan to open the PR:

```bash
node weaver.js process start --repository ebrAIn-Lab-3B/agentic-browser
node weaver.js process start --repository ebrAIn-Lab-3B/agentic-browser --approve <number from the plan>
```

## 5. Create the six status labels (agentic-base specific, one person)

The process file of agentic-base decides a card's column by the labels of its Issue. A project that follows another guideline may not need this step.

**One person does this.** First check whether the labels already exist:

```bash
gh label list --repo ebrAIn-Lab-3B/agentic-browser --search status:
```

If all six, from `status:backlog` to `status:verified`, are listed, someone has already created them. **Skip to step 6.** If even one is missing, do the following.

The commands below create the six. Without the labels you cannot add the label to an Issue in the next step.

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

## 6. Put one piece of work on the board (one person for each piece of work)

**One person does this.** So that two people do not make an Issue of the same work, first check whether it is already on the board. If the Backlog of the Overview has a card for that work, or **(agentic-base specific)** the line in `fix_plan.md` already ends with `(#number)`, someone has put it there. **Skip to step 7** and use that Issue number.

**(agentic-base specific)** The next work of agentic-browser is in `fix_plan.md`. Pick one that needs a person to decide and make an Issue of it. The example is `contract-final-2` (settling the Experience of the Story Chain).

**(agentic-base specific)** This follows [the development flow of agentic-base](https://github.com/ebrAIn-Lab-3B/agentic-base/blob/main/docs/development-flow.md): until a requirement is ready, the work is in `fix_plan.md`, an Issue is made only for work that needs a person's approval or that others should see, and the Issue number is written at the end of that line of `fix_plan.md`.

1. Make the Issue.

   ```bash
   gh issue create --repo ebrAIn-Lab-3B/agentic-browser --label status:backlog --title "Settle the Experience (contract-final-2)" --body "contract-final-2. Settle one or more files in docs/contracts/story-chain/experiences/."
   ```

   It prints the address of the new Issue. If it is the first Issue, the number is 1.
2. Put that Issue on the Project.

   ```bash
   node weaver.js project add https://github.com/ebrAIn-Lab-3B/agentic-browser/issues/1
   ```

   A plan appears. If it is right, run the command again with the number it printed in `--approve <number>`.
3. Refresh the Overview. A new card is in **Backlog** in the lane of agentic-browser.
4. **(agentic-base specific)** At the end of the `contract-final-2` line in `fix_plan.md`, write `(#1)`. A line with a number is work that is on the board.

There is a reason not to use `weaver task create` here. That command is for a repository that has `REQ-number` requirement files. agentic-browser has a product definition (`docs/PRODUCT.md`), a Story Chain draft, and samples, but no requirement files yet, so the Issue is made by hand. **(agentic-base specific)** In the development flow of agentic-base, a requirement is opened for each release slice of Promises. Once it is ready, its work is made with `weaver task create`, and the card links to the requirement, which links to its Promises.

## 7. Start the work and finish it

1. When you start, move the card to In progress. It first shows what it will change, and changes it only when you approve.

   ```bash
   node weaver.js card move ebrAIn-Lab-3B/agentic-browser#1 --to in-progress
   ```

2. Write `Closes #1` in the body of the PR that finishes the work. When the PR is merged, the Issue closes by itself. If no merged PR closes it, the card carries the mark "no merged pull request that closes the Issue".
3. In the Overview, right-click the card and choose **Pull request**. The PR page opens in a new tab. If it asks you to sign in, do it in that tab.
4. In that tab, read the PR, comment, and merge it.
5. When you come back from another window, or after about a minute, the status bar at the bottom says that the pull request was merged. The card changes by itself.

How long the sign-in is kept, which group the tab opens in, and when the notice comes are explained in [Finish work on GitHub's own page inside VS Code](finish-in-vs-code.md).

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

## Where to read the documents

The table below says where the documents this guide points to are. All of them are in the `docs` folder of the Weaver repository. There are two ways to read them: follow the folders on the GitHub repository page, or open the repository in VS Code and open the file from the Explorer on the left.

| What you want to read | Where |
| --- | --- |
| This guide (Korean, English) | `docs/onboarding/dogfooding-round-2.ko.md`, `dogfooding-round-2.md` |
| The other guides (install, setup, process file, operating guideline, agent contract, finishing work inside VS Code) | `docs/onboarding/` |
| Requirements (`REQ-number`) | `docs/requirements/`. In the Overview, pressing a card opens the requirement view. |
| Decisions (`DEC-number`) | `docs/decisions/` |
| Tasks (`TASK-number`) | `docs/tasks/` |
| User stories (`US-number`) | `docs/product/user-story-map.md` |
| (agentic-base specific) The product definition, the Story Chain draft, and the work list of agentic-browser | In the agentic-browser repository: `docs/PRODUCT.md`, `docs/proposals/payletter-story-chain.md`, `fix_plan.md` |
| (agentic-base specific) The development flow of agentic-base: exploration, Story Chain, requirements, and tasks | [`docs/development-flow.md`](https://github.com/ebrAIn-Lab-3B/agentic-base/blob/main/docs/development-flow.md) in the agentic-base repository |

**A document that is not merged yet is not on `main`.** It is on the branch of its pull request. Read it in the **Files changed** tab of the pull request, or fetch that branch and open it. Once the PR is merged, it is on `main`.

## Report friction

Open [the feedback form](https://github.com/ebrAIn-Lab-3B/Weaver/issues/new?template=dogfooding-feedback.yml). It asks four things: what you were trying to do, what you expected, what happened, and how much it got in the way. A screenshot helps. Short is fine.

## When you are stuck

| What happens | What to try |
| --- | --- |
| There is no lane for agentic-browser | Check the location of the file and the `repositories` line of step 2, then press **Refresh**. |
| The lane is there but the guideline line is not | Check the `guideline` line of step 2. `repository` must look like `owner/name`. |
| It says the guideline file was not found and offers the defaults instead | Check the `guideline` lines of step 2. If a `ref: weaver-process-file` line is left from an earlier version of this guide, remove it: that branch is gone. |
| Starting is refused with "already has a process file" | agentic-browser already has one. A guideline never changes an existing file. To change it, change that file by a PR. |
| The starting-file PR is refused as "already open" | Merge or close the open PR (`docs/weaver-process-file`) and try again. |
| It says the "project" scope is missing | Press **Sign in to GitHub** again and allow the `project` scope. |
| `gh issue create` fails because of the label | Check that you created the labels in step 5. |
| A PR opens in the system browser instead of VS Code | This VS Code has no built-in browser. Opening in the system browser is the normal behavior then. |
| You chose **Pull request** on a card and it says "No pull request refers to this Issue." | Check that the PR body has `Closes #number` or `Refs #number`. |

## What Weaver does not do

Weaver does not change a card, a label, or a file before it shows what it will change and you approve. While it only reads, nothing changes. In this guide, the things a person does by hand are creating the labels (agentic-base specific), creating the Issue, and editing `fix_plan.md` (agentic-base specific).
