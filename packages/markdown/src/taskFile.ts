import { yamlValue } from './frontmatter';

export const taskIdOf = (number: number): string => `TASK-${String(number).padStart(3, '0')}`;

/** The next free task number: one more than the largest `TASK-###` in any of the given texts. */
export function nextTaskNumber(sources: Iterable<string>): number {
  let largest = 0;
  for (const text of sources) for (const match of text.matchAll(/task-(\d{3,})/gi)) largest = Math.max(largest, Number(match[1]));
  return largest + 1;
}

export function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '') || 'task';
}

export interface TaskFileInput {
  id: string;
  title: string;
  requirement: string;
  issueUrl: string;
  issueNumber: number;
  repository: string;
  criteria: string[];
  assigneeType: 'human' | 'agent';
  assignee?: string;
  /** The fields the organization's task contract declares, written to the front matter (DEC-016). */
  fileFields?: { name: string; value: string }[];
  /** Empty headings for the task body (DEC-016 item 8). */
  sections?: string[];
}

export function renderTaskFile(input: TaskFileInput): string {
  const front = [
    '---',
    `id: ${input.id}`,
    'type: task',
    `title: ${input.title}`,
    `requirement: ${input.requirement}`,
    `issue: ${input.issueUrl}`,
    `repository: ${input.repository}`,
    `assignee_type: ${input.assigneeType}`,
    ...(input.criteria.length ? [`criteria: [${input.criteria.join(', ')}]`] : []),
    ...(input.assignee ? [`assignee: ${input.assignee}`] : []),
    ...(input.fileFields ?? []).map((f) => `${f.name}: ${yamlValue(f.value)}`),
    '---',
  ];
  return `${front.join('\n')}\n\n# ${input.id} ${input.title}\n\nTracked in [Issue #${input.issueNumber}](${input.issueUrl}). Ownership is recorded here; the Kanban column comes from the Issue.\n${(input.sections ?? []).map((heading) => `\n## ${heading}\n`).join('')}`;
}

/** The task line of a requirement: `- \`TASK-###\` Title — [GitHub Issue #n](url)`. */
export function taskListLine(id: string, title: string, issueNumber: number, issueUrl: string): string {
  return `- \`${id}\` ${title} — [GitHub Issue #${issueNumber}](${issueUrl})`;
}

/** The sentence that a requirement keeps under `## Tasks` until its first task exists. */
const PLACEHOLDER = /^Tasks are not created yet/i;

/** Appends a line to the list under `## Tasks`; undefined when the requirement has no such section. */
export function addTaskToRequirement(text: string, line: string): string | undefined {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const heading = lines.findIndex((l) => /^##\s+Tasks\s*$/.test(l));
  if (heading < 0) return undefined;
  let end = lines.findIndex((l, i) => i > heading && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  let last = -1;
  for (let i = heading + 1; i < end; i++) if (/^-\s/.test(lines[i])) last = i;
  if (last >= 0) {
    lines.splice(last + 1, 0, line);
  } else {
    // A section that only says no task exists yet is replaced by the list, not left next to it.
    const placeholder = lines.findIndex((l, i) => i > heading && i < end && PLACEHOLDER.test(l));
    if (placeholder >= 0) {
      let stop = placeholder;
      while (stop + 1 < end && lines[stop + 1].trim() !== '' && !/^-\s/.test(lines[stop + 1])) stop += 1;
      lines.splice(placeholder, stop - placeholder + 1, line);
    } else {
      lines.splice(heading + 1, 0, '', line);
    }
  }
  return lines.join(newline);
}
