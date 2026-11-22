import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { normalizeIssueUrl, parseArtifact, parseIssueUrl } from '@ebrain-lab/weaver-markdown';

export interface FreshTaskIdentity {
  /** The local task path selected by an already established Issue-to-task link. */
  path: string;
  taskId: string;
  issueUrl: string;
}

/**
 * Read the task file again before a proposal write. The host must also reject a dirty editor buffer;
 * an absent, ambiguous or unlinked file must never be treated as a known empty owner.
 */
export async function readFreshTaskHolder(
  identity: FreshTaskIdentity,
  readText: (path: string) => Promise<string> = (path) => fs.readFile(path, 'utf8'),
): Promise<{ holder?: string; version: string } | undefined> {
  const target = parseIssueUrl(identity.issueUrl);
  if (!target || !identity.path || !identity.taskId) return undefined;
  try {
    const text = await readText(identity.path);
    const result = parseArtifact(identity.path, text);
    const task = result.artifact;
    if (!task || task.kind !== 'task' || task.id !== identity.taskId || result.issues.some((issue) => issue.severity === 'error')) return undefined;
    // A task without a direct Issue link needs its requirement link to be checked by the host; this
    // reader fails closed rather than assuming that another file's old association is still valid.
    if (!task.issue || normalizeIssueUrl(task.issue) !== normalizeIssueUrl(identity.issueUrl)) return undefined;
    if (task.repository && task.repository.toLowerCase() !== `${target.owner}/${target.repo}`.toLowerCase()) return undefined;
    const version = createHash('sha256').update(JSON.stringify([identity.path, identity.taskId, identity.issueUrl, text])).digest('hex');
    return { ...(task.assignee ? { holder: task.assignee } : {}), version };
  } catch { return undefined; }
}
