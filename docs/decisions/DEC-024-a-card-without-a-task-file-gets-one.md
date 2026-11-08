# DEC-024: A card without a task file says where the file is, and offers to bring it or to make it

- Status: proposed on 2026-11-08; it becomes accepted when the maintainer merges the pull request that adds it
- Date: 2026-11-08
- Related: `REQ-020`, builds on [DEC-023](./DEC-023-mark-a-card-verified-and-say-why-it-has-no-task-file.md), keeps [DEC-008](./DEC-008-agent-identity-and-write-confirmation.md)

## Context

[DEC-023](./DEC-023-mark-a-card-verified-and-say-why-it-has-no-task-file.md) made a card say that its task file is not in the folder that is open, and what to try: update the folder. It left two things open: asking GitHub whether the file exists, and updating the folder.

The maintainer found that these are two different cases, and each needs its own answer:
- The file **is on GitHub** and the folder is behind. The person needs the folder brought up to date.
- The file is **not on GitHub at all**, for example for an Issue that was made by hand. The person needs the file made.

In both cases the card opens its Issue, and the person cannot do what they wanted from the card. The maintainer asked for this to be added before the first official release.

## Decision

1. **Weaver asks GitHub whether the file exists**, for each card whose title names a task and whose file is not in the folder, once for each card in a window, and again when the Overview is refreshed. It asks for the file `<TASK-number>.md` in the task folder of the repository on its default branch. The task folder is the one the repository's other task files are in, and `docs/tasks` when it has none. A card that was asked and could not be answered keeps the line of DEC-023 as it is.
2. **The line says which of the two it is, and offers one button.**
   - File on GitHub: "It is on GitHub. This folder is behind." with **Update the folder**.
   - File not on GitHub: "There is no task file for TASK-number." with **Make the task file**.
3. **Update the folder** uses the Git of VS Code. It runs only when all of these hold: the folder is a Git repository that VS Code knows and whose remote is the repository of the card; its working tree has no change; its branch follows a branch of the remote and has no commit of its own. Weaver fetches, tells the person how many commits the folder is behind, asks, and then brings the branch up to date by a fast-forward only. It never changes the branch, never merges, and never touches a change of the person. When one of the conditions does not hold, it says which, and does nothing.
4. **Make the task file** drafts the file from the Issue and opens a pull request that adds it and adds its line to the requirement's list of tasks. The requirement is the one that the title or the body of the Issue names (`REQ-number`); when it names none, the person picks one of the requirements of that repository, which Weaver reads from its default branch. A repository with no requirement file cannot have a task file made this way, and Weaver says so. The draft is made by the same functions as `weaver task create` and `weaver reconcile`: its owner and criteria are for the reviewer to check. The whole file, and the line that is added, are shown first, and the pull request is opened only after a yes. It is made through the GitHub API on its own branch, so no clone is needed and the default branch is not written to.
5. **A move of a card that has no task file** can offer the same pull request as a step of its plan, as `weaver reconcile` does for a card. That is not part of this decision and is left for later.

6. **Amendment, found when it was tried (2026-11-08).** The task file is on the default branch, so item 3 also requires the folder to be on the default branch. A folder on a feature branch that is up to date with its own remote told the person there was nothing to update, while the file was on `main`. When the branch is not the default branch, Weaver says which branch the folder is on and where the file is, and does nothing; it still never changes the branch. Item 4 also looks for an open pull request that already adds the file of that task (by its branch or title), and says so instead of opening a second one.

## Reasons

- The card is where the person is looking when the problem shows, so the way out belongs there.
- Telling the two cases apart makes the line say something true, instead of "it may be on GitHub".
- Both ways follow the rules every write already has: it is shown, and it waits for a yes.

## Consequences

- Tasks of `REQ-020` follow: ask GitHub and say which case it is; update the folder; make the task file. The functions that write a task file and a task line move from the `weaver` tool to the shared package, so that the extension and the tool use the same ones.
- The pull request of the GitHub API can now change an existing file (the requirement) as well as add one, so it reads the file first and writes against its version.
- DEC-023 said that Weaver does not update the folder itself. This decision allows it in the narrow case above, after a confirmation, because without it the person has to leave for a terminal.

## Decision points for the maintainer

- **Item 3, the update of the folder by Weaver.** The alternative is to say only "run git pull". It keeps Weaver away from the working tree and leaves the person to do it. The conditions and the confirmation are what make it safe.
- **Item 4, the requirement when the Issue names none.** The alternative is to refuse to make the file. A person picking is slower and surer than a guess, and the pull request is reviewed anyway.

## Not decided yet

- The offer inside the plan of a move (item 5).
- Making a requirement file for a repository that has none.
