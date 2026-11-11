# Work under an operating guideline

An organization usually has a way of working: how it names the steps from an idea to code, how it runs agents, what it checks. This page is for the person who sets that up for an organization, and for the teammates who work under it. It follows [DEC-019](../decisions/DEC-019-operating-guidelines-by-reference.md).

Weaver does not know any guideline by name. You point it at yours, and it does two things with it: it shows which guideline applies to each repository, and it offers a starting process file to a repository that has none.

## What a guideline is, and what it is not

- A guideline is **a repository (or a folder in one) that your organization owns**. Weaver reads it and never writes to it. A change to a guideline is a pull request in the repository that owns it.
- What Weaver takes from it is **one file**: a process file in the format of [Configure how your repository tracks its work](configure-your-process.md). It is where a new repository's columns, evidence rules, and idle limit start from.
- A guideline **never overrides a repository.** A repository that has its own `.weaver/process.yaml` is read from that file alone ([DEC-015](../decisions/DEC-015-process-configuration.md)). The guideline is used only to start a file for a repository that has none, and the file belongs to the repository from then on.
- The levels a guideline defines (for example Experience, Moment, Promise) **stay in the guideline's own tools.** Weaver does not read them. The only thing about them a process file can set is the form of two IDs; see [What your guideline decides](#what-your-guideline-decides).

## What your guideline decides

Weaver keeps a minimal model of a development policy ([DEC-025](../decisions/DEC-025-minimal-model-of-a-development-policy.md)). It owns requirements (`REQ-###`), tasks (`TASK-###`) under them, and the evidence of a task. Everything else is yours to decide and to write down in your guideline's own repository.

**The two IDs Weaver links.** A requirement's `story_ids` name the intents it serves, and a task's `criteria` name the acceptance criteria it covers. If your IDs are not `US-###` and `AC-###`, set their form in the process file:

```yaml
ids:
  intent: '^promise:[a-z0-9-]+$'               # story_ids; default '^US-\d{3,}$'
  criterion: '^acceptance-check:[a-z0-9-]+$'   # criteria; default '^AC-\d{3,}$'
```

An ID in another repository is written `owner/repository#ID`.

**The questions Weaver leaves to you.** Answer each in your guideline so that people and agents in every project read the same answer.

| Question | Guideline A (`agentic-base`) | Guideline B (`palab-platform`) |
| --- | --- | --- |
| What is the unit of intent, and where does it live? | A Promise in the Story Chain | A User Story on the story map |
| Does a requirement sit above or below its intents? | Below: one requirement per release slice of Promises | Above: the requirement is the source and stories hang under it |
| Where do acceptance criteria live, and may a requirement restate them? | In the Promise; the requirement links to them | Under each story |
| What makes a requirement verified, and which record and tool say so? | Every Acceptance Check covered in its Evidence Ledger, reported by the Story Chain validator | Every AC covered in the Evidence Ledger table, reported by `verify-ac` |
| Which work is tracked before a requirement exists, and where? | Exploration, contract, and bootstrap work in `fix_plan.md` | Little: the requirement is written first |
| What happens when an intent changes after work has started? | Its own rule (to be written in `agentic-base`) | Drift and exception in the Evidence Ledger |

The answers above are examples of two guidelines, not defaults. Weaver checks none of them.

## How a project gets its process file

There are two ways, and they cover different projects.

| Your project | What happens |
| --- | --- |
| **A new project made from a template** (a template repository that is copied to start a project) | If the template holds `.weaver/process.yaml`, the new project has it from the first commit. Weaver has nothing to do. This is the simplest way: put the file in the template. |
| **A project that already exists** and has no process file | Weaver offers one. You see the exact file, say yes, and it opens a pull request that adds it. The rest of this page is about this case. |

## 1. Name your guideline

Add `guideline` to the configuration that applies to your projects. Only `repository` is needed.

```yaml
guideline:
  repository: your-org/your-guideline   # required: owner/name
  path: .weaver/process.yaml            # default; the process file inside it
  ref: main                             # default: the default branch; a branch, tag, or commit
```

Where you put it decides how far it reaches:

| Where | Reaches |
| --- | --- |
| The **root file** of a folder, `<folder>/.weaver/config.yaml` ([REQ-014](../requirements/REQ-014-operating-root-configuration.md), [the sample](../../examples/operating-root/.weaver/config.yaml)) | Every repository under that folder. This is the usual place. |
| Your **personal file**, `~/.weaver/config.yaml` | Everything you open, when no root file names one. |
| A repository's own **`.weaver/process.yaml`** (`guideline:` with the same three fields) | That repository only. It records which guideline the repository follows. |

When more than one names a guideline, **the nearest wins**: the repository's own file, then the root file, then your personal file. A reference that is not valid (no `owner/name`, or a path that is absolute or climbs out with `..`) is reported and ignored; Weaver keeps working.

## 2. See which guideline applies

- **In the Overview**, each lane shows one line under its title: `Guideline: your-org/your-guideline .weaver/process.yaml (from the root file)`. It says where the reference was declared. A lane with no guideline shows nothing.
- **In the terminal**, `weaver list` has a `repositories` entry for each repository with `process` (`read`, `missing`, or `failed`), `guideline` (`null`, or `source`, `repository`, `path`, `ref`), and `startable`. `weaver process` prints the same for each repository.

Showing a guideline changes nothing about how a card is judged. Two repositories under different guidelines sit on one Overview, and each is judged by its own process file.

## 3. Start a process file for a repository that has none

A repository with no process file shows **Start a process file** in its lane, and `startable` is `true` for it in the terminal.

**In the editor:** press the button. A dialog shows where the text comes from and the exact file. Choose **Open the pull request** to go on, or cancel and nothing happens.

**In the terminal:**

```bash
weaver process start --repository your-org/your-repo
```

This shows the plan, which holds the exact text, and writes nothing. Run it again with the id it printed in `--approve <id>` to open the pull request. The id is made from the text, so if the guideline changes between the plan and the approval, the id no longer matches and nothing is written.

What the file is:

- **With a guideline:** the guideline's process file, as it is, under a first comment that names the repository, path, and ref it came from.
- **Without one, or when it cannot be read:** the defaults that match how the repository's cards are tracked. If its Issues carry `status:*` labels, you get [the labels file](../../examples/process-start/labels.yaml); if they do not, [the board-status file](../../examples/process-start/board-status.yaml). With no cards to look at, you get the labels file, which is what Weaver does without a file. A note says why the guideline was not used.

How it is written:

- It is a **pull request** from the branch `docs/weaver-process-file`, made through the GitHub API. No clone is needed, and the default branch is never written to. Your team reviews the file before it counts.
- It needs a sign-in with the `repo` scope and write access to that repository. If GitHub refuses, its reason is shown.
- **It is a copy, not a link.** After the pull request is merged, the file belongs to the repository. A later change to the guideline does not change it.
- It is refused for a repository that already has a process file, for one with an open pull request from that branch, and for one whose file could not be read (so it is not known whether it has one).

### The kept copy

The guideline file is asked from GitHub each time, with the ETag of the copy kept on your computer, so an unchanged file costs almost nothing and what is offered is current. The copy is `guidelines.json` next to your personal configuration (under `WEAVER_HOME` if you set it), never in a repository. With no network, the copy is used and the dialog or the tool says the day GitHub last confirmed it. With no copy either, the defaults are offered and the note says why. Delete the file to forget the copies.

## 4. Put a starting file in your guideline repository

This is what makes a guideline useful, and it is done by a pull request in the guideline's own repository, by its owners.

1. Add `.weaver/process.yaml` there. Start from [the labels file](../../examples/process-start/labels.yaml) and change only what your organization means to differ.
2. **Write the file for the copies.** Its comments travel with it into every repository that starts from it. Keep them short and about the repository that will own the file; leave out review notes meant for your own team and anything that describes the guideline instead of the repository. If a question is still open, settle it before merging, because the copies will carry it.
3. Check it before you merge it. List the guideline's repository in `repositories` of your root file for a moment and run `weaver process --repository your-org/your-guideline`: a mistake is reported, and Weaver ignores a section that has an error. (A mistake that slips through shows up later as *the guideline is not a valid process file* for whoever starts from it, and they are offered the defaults instead.)

A worked example: the maintainers of this repository keep the Story Chain guideline `agentic-base`, which projects copy when they start. Its starting file spells out Weaver's defaults, says in a comment that the Story Chain links and their checks stay in that repository's own tools, and leaves out `task` and `roster` because those are the organization's decisions. Weaver never learns the name `agentic-base`; it only reads the reference you wrote.

## When something is wrong

| What you see | What it means and what to do |
| --- | --- |
| No guideline line in a lane | No file names a guideline for that repository. Add `guideline:` to the root file (section 1). |
| *The guideline reference is ignored* in a warning | The reference is not valid: it needs `repository` as `owner/name`, and `path` must stay inside the repository. |
| *The guideline could not be read, so the defaults … are offered* | GitHub could not be asked and no copy is kept, or this sign-in cannot see the guideline repository. Check the sign-in and the `repository`, `path`, and `ref`. |
| *The guideline file was not found there* | The path or ref names nothing. Check `path` and `ref`, and that the file is on that branch. |
| *The guideline is not a valid process file* | The file has an error. Fix it in the guideline repository; the defaults are offered meanwhile. |
| *The copy kept on this computer is used* | GitHub could not be asked just now. The text is the last one confirmed, on the day the note gives. |
| *Already has a process file* | A guideline never changes a repository that has one. Edit that file through a pull request. |
| *A pull request … is already open* | Merge or close it first. |
| The button does not appear | The repository has a process file, or its process file has not been read yet. Refresh the Overview. |
