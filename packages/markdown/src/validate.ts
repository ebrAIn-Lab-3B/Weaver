import type { MessageArgs } from './i18n';
import { parseArtifact } from './parse';
import { Artifact, ValidationIssue, WorkspaceResult } from './types';
import { requirementForTask, sameRepository, sameServer } from './identity';

export interface SourceFile {
  path: string;
  text: string;
  repository?: string;
  repositoryServer?: string;
  sourceScope?: string;
}

/** Cross-artifact rules: unique IDs, resolvable requirement references, single task owner. */
export function validateWorkspace(artifacts: Artifact[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (a: Artifact, code: string, args: MessageArgs, severity: 'error' | 'warning' = 'error') =>
    issues.push({ severity, code, args, path: a.path });

  const byId = new Map<string, Artifact[]>();
  for (const artifact of artifacts) {
    const matches = byId.get(artifact.id) ?? [];
    const first = matches.find((other) => {
      if (artifact.kind !== 'requirement' || other.kind !== 'requirement') return true;
      if (artifact.repository && other.repository) return sameRepository(artifact.repository, other.repository) && (!artifact.repositoryServer || !other.repositoryServer || sameServer(artifact.repositoryServer, other.repositoryServer));
      if (artifact.sourceScope && other.sourceScope) return artifact.sourceScope === other.sourceScope;
      return true;
    });
    if (first) add(artifact, 'duplicate-id', { id: artifact.id, path: first.path });
    matches.push(artifact);
    byId.set(artifact.id, matches);
  }

  const taskOwner = new Map<string, { id: string; repository?: string; sourceScope?: string }>();
  for (const artifact of artifacts) {
    if (artifact.kind === 'task') {
      const target = requirementForTask(artifact, artifacts);
      if (!target) {
        const candidates = artifacts.filter((a) => a.kind === 'requirement' && a.id === artifact.requirement && (!artifact.requirementRepository || sameRepository(a.repository, artifact.requirementRepository)) && (!artifact.requirementServer || sameServer(a.repositoryServer, artifact.requirementServer)));
        if (candidates.length > 1) add(artifact, 'ambiguous-requirement', { task: artifact.id, requirement: artifact.requirement, paths: candidates.map((candidate) => candidate.path).join(', ') });
        else add(artifact, 'unknown-requirement', { task: artifact.id, requirement: artifact.requirement });
      } else {
        if (!target.tasks.some((task) => task.id === artifact.id)) {
          add(artifact, 'task-not-listed', { task: artifact.id, requirement: target.id }, 'warning');
        }
        for (const criterion of artifact.criteria) {
          if (!target.criteria.some((c) => c.id === criterion)) {
            add(artifact, 'unknown-criterion', { task: artifact.id, criterion, requirement: target.id }, 'warning');
          }
        }
      }
    } else {
      for (const task of artifact.tasks) {
        const owner = taskOwner.get(task.id);
        if (owner && (owner.id !== artifact.id || (owner.repository && artifact.repository && !sameRepository(owner.repository, artifact.repository)) || (owner.sourceScope && artifact.sourceScope && owner.sourceScope !== artifact.sourceScope))) {
          add(artifact, 'task-listed-twice', { task: task.id, owner: owner.id });
        } else {
          taskOwner.set(task.id, { id: artifact.id, repository: artifact.repository, sourceScope: artifact.sourceScope });
        }
      }
    }
  }
  return issues;
}

export interface LoadOptions {
  /** The task fields the process of a task's repository declares (DEC-016), by the path of the task file. */
  declaredTaskFields?: (path: string) => readonly string[];
}

export function loadWorkspace(files: SourceFile[], options: LoadOptions = {}): WorkspaceResult {
  const artifacts: Artifact[] = [];
  const issues: ValidationIssue[] = [];
  for (const file of files) {
    const result = parseArtifact(file.path, file.text, options.declaredTaskFields ? { declaredTaskFields: options.declaredTaskFields(file.path) } : {});
    issues.push(...result.issues);
    if (result.artifact) artifacts.push({ ...result.artifact, ...(!result.artifact.repository && file.repository ? { repository: file.repository } : {}), ...(!result.artifact.repositoryServer && file.repositoryServer && (!result.artifact.repository || sameRepository(result.artifact.repository, file.repository)) ? { repositoryServer: file.repositoryServer } : {}), ...(file.sourceScope ? { sourceScope: file.sourceScope } : {}) });
  }
  issues.push(...validateWorkspace(artifacts));
  return { artifacts, issues };
}
