# ebrAIn.lab Weaver

**Repo-native requirements and agent execution system**

Product name: **ebrAIn.lab Weaver**. Short name: **Weaver**.

ebrAIn.lab Weaver connects requirements, projects, tasks, people, AI agents, code, pull requests, and tests across the repositories that make up a company.

The core idea is simple:

```text
Requirement → Task → Human/Agent execution → Code/PR/Test evidence → Accepted product behavior
```

## Start here

Pick the line that is yours. Each list is in the order to read.

**I want to use Weaver**

1. Install the extension and open the Overview: [Getting started](docs/onboarding/getting-started.md). The extension file and the `weaver` tool are on the [latest Release](https://github.com/ebrAIn-Lab-3B/Weaver/releases).
2. Point it at your own GitHub Project: [Register your own Project](docs/onboarding/register-your-project.md).
3. Say how a repository tracks its work: [Configure how your repository tracks its work](docs/onboarding/configure-your-process.md).
4. If your organization has a way of working it follows: [Work under an operating guideline](docs/onboarding/operating-guidelines.md).
5. Follow one piece of work from its start to its end: [Finish one piece of work with Weaver](docs/onboarding/dogfooding-round-2.md) ([한국어](docs/onboarding/dogfooding-round-2.ko.md)).

**I run an agent on a Kanban**

1. Read the [agent contract](docs/onboarding/agent-contract.md): the `weaver` command-line tool, its commands, its JSON, and how a write is shown and approved before it happens.

**I want to work on Weaver**

1. Read [Development Onboarding](docs/onboarding/development-onboarding.md) and [AGENTS.md](AGENTS.md).
2. Read the [User Story Map](docs/product/user-story-map.md) and the [Product Requirements v0.1](docs/product/requirements-v0.1.md).
3. Read [REQ-001, Weaver self-hosting](docs/requirements/REQ-001-weaver-self-hosting.md), then the [Verification v0.1](docs/product/verification-v0.1.md).
4. Read the architecture: [Monorepo Structure](docs/architecture/monorepo-structure.md), [GitHub Issues Integration](docs/architecture/github-issues-integration.md), and [Repository Connection and Kanban v0.1](docs/architecture/repository-connection-and-kanban-v0.1.md).
5. Check the open Issues and the Project before creating new work.
6. For one organization's procedure, as an example and not as a starting point: the [PALab Development Bootstrap](docs/onboarding/palab-development-bootstrap.md).

## Where to read the documents

All of them are in this repository. Open the folder on GitHub, or open the repository in VS Code and use the Explorer.

| What | Where |
| --- | --- |
| Guides for people who use Weaver | [`docs/onboarding/`](docs/onboarding/) |
| Requirements (`REQ-number`) | [`docs/requirements/`](docs/requirements/) |
| Decisions (`DEC-number`) | [`docs/decisions/`](docs/decisions/) |
| Tasks (`TASK-number`) | [`docs/tasks/`](docs/tasks/) |
| User stories (`US-number`) and the product documents | [`docs/product/`](docs/product/) |
| Architecture | [`docs/architecture/`](docs/architecture/) |
| Samples and examples to copy | [`examples/`](examples/) |

A document that is not merged yet is not on the default branch. It is on the branch of its pull request: read it in the **Files changed** tab of that pull request.

## Current status

Weaver is developed with Weaver, and it is in use: the extension and the `weaver` command-line tool are released on the [Releases](https://github.com/ebrAIn-Lab-3B/Weaver/releases) page. What works today:

- **The Overview**: the cards of a GitHub Project of your own, in a lane for each repository, in six columns, with the reason for any gap (no evidence, no status label, idle for long).
- **The requirement view**: a requirement, its tasks, who owns them, and the evidence of each.
- **Your configuration**: a setup file on your computer, a setup file for a folder of projects, and a roster of the people and agents you work with.
- **How a repository tracks its work**: a process file in the repository (columns, evidence, idle days, the fields of a task), and an operating guideline that a repository without a process file can start one from.
- **The `weaver` tool**: list, show, create a task, move a card, attach evidence, reconcile, and start a process file. A write is shown first and happens only after it is approved.
- **Finishing in VS Code**: a GitHub page opens in a tab of the editor, and the Overview follows what happens there.

Not done yet: user stories on the board ([REQ-016](docs/requirements/REQ-016-user-stories-on-the-board.md)), moving a card by dragging it ([REQ-017](docs/requirements/REQ-017-drag-and-drop-cards.md)), discussions kept with requirements and tasks ([REQ-013](docs/requirements/REQ-013-keep-discussions-with-requirements-and-tasks.md)), and publishing to a registry (`TASK-022`). The `status` of each requirement file says how far it is.

## Problem

Requirements often live in Notion or documents, tasks live in a project tracker, and implementation evidence lives in repositories and pull requests. The gap between those surfaces makes it difficult to answer:

- Which tasks were created from this requirement?
- Who or which agent owns each task?
- Where is the implementation?
- What evidence proves the task was completed?
- What still needs human judgment?

## Product direction

Weaver treats **Requirement and Task artifacts as the source of truth**. Code remains authoritative in its repository; pull requests and CI results are execution evidence. External document, project-management, and chat tools are projections, collaboration surfaces, or integrations.

The product language is intentionally fabric-oriented:

- **Thread:** a requirement, project, task, decision, or evidence item
- **Fabric:** the connected development context across repositories
- **Weave:** creating and maintaining relationships between threads
- **Weaver:** the system where humans and agents coordinate that work

## Design principles

- Requirement and Task artifacts remain inspectable in Git.
- The same domain model must work in a VS Code extension, a Desktop app, and a Server-backed workspace.
- Local-first development is the starting point; collaboration and server synchronization are later surfaces.
- Human and AI contributors are visible participants in the same execution flow.
- The product is a development fabric, not a generic issue tracker.
- Weaver carries out an organization's policy and never assumes one: the policy arrives as configuration.

## We develop Weaver with Weaver

The development loop is self-hosted:

```text
Weaver requirement docs
  → editing in VS Code
  → Weaver tasks
  → agent or human implementation
  → repository evidence
  → Weaver verification
```

Other projects can be connected and adopted step by step with the same requirement, task, repository, and evidence model. To try it on a real project, follow [the second dogfooding guide](docs/onboarding/dogfooding-round-2.md).

## License

Weaver is released under the [MIT License](LICENSE).
