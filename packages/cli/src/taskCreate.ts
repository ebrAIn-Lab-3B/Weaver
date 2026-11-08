import * as path from 'path';
import { Artifact, Locale, RequirementArtifact, TaskFieldPlan } from '@ebrain-lab/weaver-markdown';
import { addIssueToProject, createIssue, NoticeError, setProjectField, type Fetch } from '@ebrain-lab/weaver-github';
import { attribution, PlannedAction } from './actions';
import type { System } from './contract';
import { openFilesPullRequest } from './filesPullRequest';

export { addTaskToRequirement, nextTaskNumber, renderTaskFile, slugOf, taskIdOf, taskListLine, type TaskFileInput } from '@ebrain-lab/weaver-markdown';
import { slugOf, taskIdOf, taskListLine, renderTaskFile, addTaskToRequirement } from '@ebrain-lab/weaver-markdown';

export interface TaskCreateInput {
  token: string;
  login: string | undefined;
  locale: Locale;
  project: { owner: string; number: number };
  requirement: RequirementArtifact;
  repository: string;
  title: string;
  criteria: string[];
  assigneeType: 'human' | 'agent';
  assignee?: string;
  /** What the task contract of the repository gives for this task (DEC-016); absent without a `task` section. */
  contract?: TaskFieldPlan;
  area?: string;
  /** The number the new task takes. */
  number: number;
  /** Where task files live, relative to the folder that holds `fabric.yaml`. */
  taskDirectory: string;
  /** The folder that holds `fabric.yaml`. */
  root: string;
  system: System;
  fetch?: Fetch;
}

/**
 * Three actions that belong together: create the Issue, put it on the Project, and offer the task
 * file and the requirement's task line as a pull request. The pull request is made in a separate
 * worktree on a new branch, so the user's own checkout and the default branch stay untouched.
 */
export function planTaskCreate(input: TaskCreateInput): PlannedAction[] {
  const id = taskIdOf(input.number);
  const labels = [...new Set(['task', 'status:backlog', ...(input.area ? [`area:${input.area}`] : []), ...(input.contract?.labels ?? [])])];
  const taskPath = `${input.taskDirectory}/${id}.md`.replace(/^\.\//, '');
  const created: { number?: number; url?: string; item?: string } = {};
  const reason = { code: 'cli.task-create.reason' as const };

  const issue: PlannedAction = {
    kind: 'issue.create',
    target: input.repository,
    summary: { code: 'cli.task-create.issue', args: { title: `[${id}] ${input.title}`, repository: input.repository, labels: labels.join(', ') } },
    reason,
    run: async () => {
      const body = `${attribution(input.locale, input.login)}\n\nA task of ${input.requirement.id} (${input.requirement.title}). The definition is ${taskPath}.`;
      const made = await createIssue(input.token, input.repository, { title: `[${id}] ${input.title}`, body, labels }, input.fetch);
      created.number = made.number;
      created.url = made.url;
    },
  };

  const card: PlannedAction = {
    kind: 'project.add',
    target: `${input.repository} ${id}`,
    summary: { code: 'cli.task-create.card', args: { owner: input.project.owner, number: input.project.number } },
    reason,
    dependsOn: [issue],
    run: async () => {
      if (!created.url) throw new NoticeError({ code: 'cli.err.issue-not-created' });
      created.item = await addIssueToProject(input.token, input.project, created.url, input.fetch);
    },
  };

  // A field that lives on the board is set after the card exists, one action each, so the plan shows it.
  const fieldActions: PlannedAction[] = (input.contract?.projectFields ?? []).map((f) => ({
    kind: 'project.field',
    target: `${input.repository} ${id}`,
    summary: { code: 'cli.task-create.project-field' as const, args: { field: f.field, value: f.value } },
    reason,
    dependsOn: [card],
    run: async () => {
      if (!created.item) throw new NoticeError({ code: 'github.err.no-data' });
      await setProjectField(input.token, input.project, created.item, f.field, f.value, input.fetch);
    },
  }));

  const branch = `docs/${id.toLowerCase()}-${slugOf(input.title)}`;
  const files: PlannedAction = {
    kind: 'files.pull-request',
    target: `${input.repository} ${branch}`,
    summary:
      input.contract && (input.contract.fileFields.length > 0 || input.contract.sections.length > 0)
        ? {
            code: 'cli.task-create.files-fields',
            args: {
              repository: input.repository,
              path: taskPath,
              task: id,
              requirement: input.requirement.id,
              fields: input.contract.fileFields.map((f) => `${f.name}=${f.value}`).join(', ') || '-',
              sections: input.contract.sections.join(', ') || '-',
            },
          }
        : { code: 'cli.task-create.files', args: { repository: input.repository, path: taskPath, task: id, requirement: input.requirement.id } },
    reason,
    dependsOn: [issue],
    run: async () => {
      if (!created.url || created.number === undefined) throw new NoticeError({ code: 'cli.err.issue-not-created' });
      const { system } = input;
      await openFilesPullRequest({
        system,
        root: input.root,
        repository: input.repository,
        branch,
        title: `docs: add ${id} ${input.title}`,
        commitMessage: `docs: add ${id} ${input.title}

${attribution(input.locale, input.login)}`,
        body: `${attribution(input.locale, input.login)}

Adds ${taskPath} and lists ${id} under ${input.requirement.id}. Issue: ${created.url}`,
        edit: async ({ work, top, base }) => {
          const relative = path.relative(top, path.resolve(input.root, input.requirement.path)).split(path.sep).join('/');
          const requirementText = await system.readText(path.join(work, relative));
          const updated = requirementText === undefined ? undefined : addTaskToRequirement(requirementText, taskListLine(id, input.title, created.number as number, created.url as string));
          if (updated === undefined) throw new NoticeError({ code: 'cli.err.no-tasks-section', args: { path: relative, base } });
          await system.writeFile(path.join(work, relative), updated);
          const taskRelative = path.relative(top, path.resolve(input.root, taskPath)).split(path.sep).join('/');
          await system.writeFile(
            path.join(work, taskRelative),
            renderTaskFile({
              id,
              title: input.title,
              requirement: input.requirement.id,
              issueUrl: created.url as string,
              issueNumber: created.number as number,
              repository: input.repository,
              criteria: input.criteria,
              assigneeType: input.assigneeType,
              assignee: input.assignee,
              fileFields: input.contract?.fileFields,
              sections: input.contract?.sections,
            }),
          );
        },
      });
    },
  };

  return [issue, card, ...fieldActions, files];
}

/** The artifacts that could take a task number, plus open pull requests when `gh` can list them. */
export async function usedTaskTexts(artifacts: readonly Artifact[], cards: readonly { title: string }[], repository: string, system: System): Promise<string[]> {
  const texts = [...artifacts.map((a) => a.id), ...cards.map((c) => c.title)];
  try {
    texts.push(await system.run('gh', ['pr', 'list', '--repo', repository, '--state', 'open', '--limit', '100', '--json', 'title,headRefName']));
  } catch {
    // Without the list of open pull requests the number is taken from the files and the Project only.
  }
  return texts;
}
