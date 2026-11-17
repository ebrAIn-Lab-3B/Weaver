/** The draft stays ordinary Markdown and can be reviewed before it is written. */
export function requirementDraft(id: string, title: string, outcome: string, criterion: string): string {
  return `---\nid: ${id}\ntype: requirement\ntitle: ${JSON.stringify(title.trim())}\nstatus: draft\n---\n\n# ${title.trim()}\n\n## Problem\n\n\n## Outcome\n\n${outcome.trim()}\n\n## Acceptance criteria\n\n- ${criterion.trim()}\n\n## Tasks\n`;
}

export function ideationDraft(title: string): string {
  return `# ${title.trim()}\n\n`;
}
import { parseArtifact } from './parse';

/** Route normal Markdown independently of organization-specific naming conventions. */
export function markdownEditorTarget(path: string, text: string): 'requirement' | 'task' | 'markdown' {
  const kind = parseArtifact(path, text).artifact?.kind;
  const name = path.split(/[\\/]/).pop() ?? '';
  if (kind === 'task' || /^TASK-.*\.md$/i.test(name)) return 'task';
  if (kind === 'requirement' || /^REQ-.*\.md$/i.test(name)) return 'requirement';
  return 'markdown';
}
