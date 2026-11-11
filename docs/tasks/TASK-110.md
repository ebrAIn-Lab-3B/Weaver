---
id: TASK-110
type: task
title: One configuration command that follows the file that applies
requirement: REQ-014
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/302
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
assignee: claude-code
---

# TASK-110 One configuration command that follows the file that applies

Tracked in [Issue #302](https://github.com/ebrAIn-Lab-3B/Weaver/issues/302). Ownership is recorded here; the Kanban column comes from the Issue.

**Weaver: Configuration** is the one entry for every setting. It replaces "Choose the repositories to show", "Open the configuration file", "Add or change contributors", "Set up", and "Set the clone folder" in the Weaver view and the Overview menu, which now hold only Open the Overview, Configuration, and Clone the missing repositories.

- It lists the configuration files nearest first (workspace `fabric.yaml`, root file, personal file, [DEC-018](../decisions/DEC-018-operating-root-configuration.md) item 4), marks the one that applies, and names the layer that overrides each other one (item 9). The commands that only opened a file are removed.
- Choosing the repositories writes the file that applies, a root file too, after showing the change (item 10); a workspace `fabric.yaml` is only opened.
- Adding or changing a contributor offers the root file's roster, the personal roster, or a roster file, and says whom each reaches.
- The editor reads the roster the way the `weaver` tool does: the root file's with the personal file's laid over it (item 6), and the first declared shared reference (item 5). Before, it read the personal file only.
