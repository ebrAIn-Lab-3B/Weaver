import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { normalizeIssueUrl, parseArtifact, parseIssueUrl, sameRepository, sameServer } from '@ebrain-lab/weaver-markdown';

export interface FreshTaskIdentity {
  /** The local task path selected by an already established Issue-to-task link. */
  path: string;
  taskId: string;
  issueUrl: string;
  /** Optional requirement file that directly links this task to the Issue. */
  requirement?: { path: string; id: string };
}

/**
 * Read the task file again before a proposal write. The host must also reject a dirty editor buffer;
 * an absent, ambiguous or unlinked file must never be treated as a known empty owner.
 */
export async function readFreshTaskHolder(
  identity: FreshTaskIdentity,
  readText: (path: string) => Promise<string> = (path) => fs.readFile(path, 'utf8'),
): Promise<{ holder?: string; reviewer?: string; version: string } | undefined> {
  const target = parseIssueUrl(identity.issueUrl);
  if (!target || !identity.path || !identity.taskId) return undefined;
  try {
    const text = await readText(identity.path);
    const result = parseArtifact(identity.path, text);
    const task = result.artifact;
    if (!task || task.kind !== 'task' || task.id !== identity.taskId || result.issues.some((issue) => issue.severity === 'error')) return undefined;
    if (task.repositoryServer && !sameServer(task.repositoryServer, 'github.com')) return undefined;
    if (task.repository && task.repository.toLowerCase() !== `${target.owner}/${target.repo}`.toLowerCase()) return undefined;
    let requirementText: string | undefined;
    if (task.issue) {
      if (normalizeIssueUrl(task.issue) !== normalizeIssueUrl(identity.issueUrl)) return undefined;
    } else {
      const expected = identity.requirement;
      if (!expected?.path || !expected.id) return undefined;
      requirementText = await readText(expected.path);
      const parsed = parseArtifact(expected.path, requirementText);
      const requirement = parsed.artifact;
      if (!requirement || requirement.kind !== 'requirement' || requirement.id !== expected.id || task.requirement !== requirement.id || parsed.issues.some((issue) => issue.severity === 'error')) return undefined;
      // Repository identity must be explicit when the Issue link comes from another file.
      if (!task.repository || !requirement.repository) return undefined;
      if (task.requirementServer) {
        if (!sameServer(task.requirementServer, requirement.repositoryServer)) return undefined;
      } else if (requirement.repositoryServer && !sameServer(requirement.repositoryServer, 'github.com')) return undefined;
      const requiredRepo = task.requirementRepository ?? task.repository;
      if (!sameRepository(requiredRepo, requirement.repository)) return undefined;
      const references = requirement.tasks.filter((item) => item.issueUrl && normalizeIssueUrl(item.issueUrl) === normalizeIssueUrl(identity.issueUrl));
      if (references.length !== 1 || references[0].id !== task.id || requirement.tasks.filter((item) => item.id === task.id).length !== 1) return undefined;
    }
    const version = createHash('sha256').update(JSON.stringify([identity.path, identity.taskId, identity.issueUrl, text, identity.requirement ?? null, requirementText ?? null])).digest('hex');
    return { ...(task.assignee ? { holder: task.assignee } : {}), ...(task.reviewer ? { reviewer: task.reviewer } : {}), version };
  } catch { return undefined; }
}
