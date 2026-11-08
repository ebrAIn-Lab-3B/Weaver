import { addTaskToRequirement, renderTaskFile, taskListLine } from './taskFile';

/** The `REQ-number` ids that a text names, in order and without repeats. */
export function requirementIdsIn(text: string): string[] {
  return [...new Set(text.match(/\bREQ-\d{3,}\b/g) ?? [])];
}

/** The folder of the task files of a repository: the folder of its other task files, and `docs/tasks` when it has none (DEC-024 item 1). */
export function taskDirectoryOf(taskPaths: readonly string[]): string {
  const first = taskPaths.find((p) => /\/TASK-\d+\.md$/i.test(p));
  return first ? first.slice(0, first.lastIndexOf('/')) : 'docs/tasks';
}

/** The folder of the requirement files of a repository, found the same way. */
export function requirementDirectoryOf(requirementPaths: readonly string[]): string {
  const first = requirementPaths.find((p) => /\/REQ-\d+[^/]*\.md$/i.test(p));
  return first ? first.slice(0, first.lastIndexOf('/')) : 'docs/requirements';
}

/** A card that has a task in its title but no task file. */
export interface DraftCard {
  taskId: string;
  title: string;
  number: number;
  url: string;
  repository: string;
  assignees: readonly string[];
}

export type TaskDraft =
  | {
      ok: true;
      taskPath: string;
      taskText: string;
      requirementPath: string;
      requirementText: string;
      /** The line added under `## Tasks` of the requirement. */
      line: string;
      /** The title of the task as the file says it, without `[TASK-number]`. */
      title: string;
    }
  | { ok: false; reason: 'bad-title' | 'no-tasks-section' };

/**
 * Drafts the task file of a card, and the requirement with the line that lists it (DEC-024 item 4). It
 * is made by the same functions as `weaver task create` and `weaver reconcile`, and follows the same
 * rules: a title with a colon or a line break cannot go into a task file, a card with an assignee is
 * given to a human and one without to an agent, and the criteria are left for the reviewer.
 * It changes nothing: it only says what the two files would be.
 */
export function draftTaskFile(input: {
  card: DraftCard;
  requirement: { id: string; path: string; text: string };
  taskDirectory: string;
}): TaskDraft {
  const { card, requirement } = input;
  const title = card.title.replace(/^\[TASK-\d{3,}\]\s*/i, '').trim();
  if (!title || /[:\n]/.test(title)) return { ok: false, reason: 'bad-title' };
  const line = taskListLine(card.taskId, title, card.number, card.url);
  const requirementText = addTaskToRequirement(requirement.text, line);
  if (requirementText === undefined) return { ok: false, reason: 'no-tasks-section' };
  const taskText = renderTaskFile({
    id: card.taskId,
    title,
    requirement: requirement.id,
    issueUrl: card.url,
    issueNumber: card.number,
    repository: card.repository,
    criteria: [],
    assigneeType: card.assignees.length ? 'human' : 'agent',
    ...(card.assignees[0] ? { assignee: card.assignees[0] } : {}),
  });
  return { ok: true, taskPath: `${input.taskDirectory}/${card.taskId}.md`, taskText, requirementPath: requirement.path, requirementText, line, title };
}
