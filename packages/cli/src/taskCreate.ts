import * as path from 'path';
import { createHash } from 'crypto';
import { Artifact, Locale, RequirementArtifact, TaskFieldPlan, formatNotice, parseIssueUrl } from '@ebrain-lab/weaver-markdown';
import { addIssueToProject, createIssue, errorNotice, fetchIssue, fetchIssueBody, NoticeError, readProject, setProjectField, type Fetch, type FetchFn } from '@ebrain-lab/weaver-github';
import { attribution, PlannedAction } from './actions';
import type { System } from './contract';
import { openFilesPullRequest } from './filesPullRequest';
import { hasTaskTitleCandidate, taskIssueInventory, taskPullInventory } from './taskIssueInventory';
import { registrationIntentDigest, registrationMarker, reserveRecoveryFromDefault, reserveTask, taskReservationRefs } from './taskReservation';

export { addTaskToRequirement, nextTaskNumber, renderTaskFile, slugOf, taskIdOf, taskListLine, type TaskFileInput } from '@ebrain-lab/weaver-markdown';
import { slugOf, taskIdOf, taskListLine, renderTaskFile, addTaskToRequirement } from '@ebrain-lab/weaver-markdown';

export interface TaskCreateInput {
  token: string;
  login: string | undefined;
  locale: Locale;
  project: { owner: string; number: number };
  requirement: RequirementArtifact;
  /** Source text used in the plan, checked against the default branch before editing. */
  requirementText?: string;
  repository: string;
  title: string;
  criteria: string[];
  assigneeType: 'human' | 'agent';
  assignee?: string;
  /** What the task contract of the repository gives for this task (DEC-016); absent without a `task` section. */
  contract?: TaskFieldPlan;
  area?: string;
  initialLabel?: string;
  initialBoardStatus?: string;
  initialBoardProjection?: string;
  /** The number the new task takes. */
  number: number;
  /** Where task files live, relative to the folder that holds `fabric.yaml`. */
  taskDirectory: string;
  /** The folder that holds `fabric.yaml`. */
  root: string;
  system: System;
  fetch?: Fetch;
  /** Read-only visibility wait; no mutation is retried by this delay. */
  wait?: (milliseconds: number) => Promise<void>;
  /** Re-read the approved process before each mutation; a changed or failed read refuses the write. */
  revalidateProcess?: () => Promise<boolean>;
  revalidateCheckout?: () => Promise<boolean>;
  /** Effective process bound to approvals, even when its fields are not shown in an action summary. */
  approvalProcess?: unknown;
  /** Explicitly identified existing Issue, after the caller validates its association. */
  resume?: { number: number; url: string; item?: string; needsInitialStatus?: boolean; pendingProjectFields?: string[]; onStatusRestored?: () => void; onFieldRestored?: (field: string) => void; revalidate: () => Promise<boolean> };
}

/**
 * Three actions that belong together: create the Issue, put it on the Project, and offer the task
 * file and the requirement's task line as a pull request. The pull request is made in a separate
 * worktree on a new branch, so the user's own checkout and the default branch stay untouched.
 */
export function planTaskCreate(input: TaskCreateInput): PlannedAction[] {
  const id = taskIdOf(input.number);
  const labels = [...new Set(['task', ...(input.initialLabel ? [input.initialLabel] : []), ...(input.area ? [`area:${input.area}`] : []), ...(input.contract?.labels ?? [])])];
  const taskPath = `${input.taskDirectory}/${id}.md`.replace(/^\.\//, '');
  const created: { number?: number; url?: string; item?: string } = input.resume ? { number: input.resume.number, url: input.resume.url, item: input.resume.item } : {};
  const reason = input.resume ? { code: 'cli.task-create.resume-reason' as const } : { code: 'cli.task-create.reason' as const };
  const reservations = taskReservationRefs(input.repository, input.requirement.id, input.requirement.repository, input.requirement.repositoryServer, input.title, id);
  const intent = JSON.stringify({ repository: input.repository.toLowerCase(), project: input.project, requirement: { id: input.requirement.id, title: input.requirement.title, path: input.requirement.path, repository: input.requirement.repository, repositoryServer: input.requirement.repositoryServer, textHash: input.requirementText === undefined ? null : createHash('sha256').update(input.requirementText.replace(/\r\n/g, '\n')).digest('hex') }, id, title: input.title, criteria: input.criteria, assigneeType: input.assigneeType, assignee: input.assignee, area: input.area, contract: input.contract, initialLabel: input.initialLabel, initialBoardStatus: input.initialBoardStatus, process: input.approvalProcess, taskPath, resumeIssue: input.resume?.url, resumeItem: input.resume?.item });
  // GitHub's detail stays in English in the audit log; the surrounding recovery guidance is localized.
  const detailOf = (error: unknown) => error instanceof NoticeError ? formatNotice(errorNotice(error), 'en') : error instanceof Error ? error.message : String(error);
  const checkProcess = async () => {
    if (input.revalidateCheckout && !(await input.revalidateCheckout())) throw new NoticeError({ code: 'cli.task-create.checkout-unsafe', args: { repository: input.repository } });
    if (input.revalidateProcess && !(await input.revalidateProcess())) throw new NoticeError({ code: 'cli.task-create.process-unsafe', args: { repository: input.repository } });
    if (input.resume && !(await input.resume.revalidate())) throw new NoticeError({ code: 'cli.task-create.resume-unsafe', args: { repository: input.repository } });
  };

  const issue: PlannedAction = {
    kind: 'issue.create',
    target: input.repository,
    identifiers: { task: id, repository: input.repository, requirement: input.requirement.id, operationReservation: reservations.operation, taskReservation: reservations.task },
    fingerprint: `issue.create\n${intent}`,
    summary: { code: 'cli.task-create.issue-reserved', args: { title: `[${id}] ${input.title}`, repository: input.repository, labels: labels.join(', '), operation: reservations.operation, task: reservations.task } },
    reason,
    run: async () => {
      await checkProcess();
      let titles: string[];
      try { titles = await taskIssueInventory(input.token, input.repository, input.fetch); }
      catch { throw new NoticeError({ code: 'cli.task-create.inventory-unavailable', args: { repository: input.repository } }); }
      if (hasTaskTitleCandidate(titles, input.title) || titles.some((title) => new RegExp(`^\\[${id}\\]`, 'i').test(title))) throw new NoticeError({ code: 'cli.task-create.identity-ambiguous', args: { repository: input.repository } });
      try { await reserveTask(input.token, input.repository, reservations, input.fetch); }
      catch { throw new NoticeError({ code: 'cli.task-create.reservation-unsafe', args: { repository: input.repository, operation: reservations.operation, task: reservations.task } }); }
      await checkProcess();
      try { titles = await taskIssueInventory(input.token, input.repository, input.fetch); }
      catch { throw new NoticeError({ code: 'cli.task-create.inventory-unavailable', args: { repository: input.repository } }); }
      if (hasTaskTitleCandidate(titles, input.title) || titles.some((title) => new RegExp(`^\\[${id}\\]`, 'i').test(title))) throw new NoticeError({ code: 'cli.task-create.identity-ambiguous', args: { repository: input.repository } });
      const digest = registrationIntentDigest({ repository: input.repository, project: input.project, requirement: input.requirement, title: input.title, criteria: input.criteria, assigneeType: input.assigneeType, assignee: input.assignee, area: input.area, contract: input.contract, taskDirectory: input.taskDirectory, process: input.approvalProcess });
      const body = `${attribution(input.locale, input.login)}\n\nA task of ${input.requirement.id} (${input.requirement.title}). The definition is ${taskPath}.\n\n${registrationMarker(reservations.operation, id, digest)}`;
      let made: { number: number; url: string };
      try { made = await createIssue(input.token, input.repository, { title: `[${id}] ${input.title}`, body, labels }, input.fetch); }
      catch (error) { throw new NoticeError({ code: 'cli.task-create.issue-write-uncertain', args: { repository: input.repository, operation: reservations.operation, detail: detailOf(error) } }); }
      created.number = made.number;
      created.url = made.url;
      issue.identifiers = { ...issue.identifiers, issue: made.url };
      const ref = parseIssueUrl(made.url);
      if (!ref || !Number.isSafeInteger(made.number) || made.number < 1 || ref.number !== made.number || `${ref.owner}/${ref.repo}`.toLowerCase() !== input.repository.toLowerCase()) {
        throw new NoticeError({ code: 'cli.task-create.issue-unverified', args: { issue: made.url } });
      }
      const observed = await fetchIssue(input.token, made.url, input.fetch as unknown as FetchFn | undefined);
      const observedBody = await fetchIssueBody(input.token, input.repository, made.number, input.fetch as unknown as FetchFn | undefined).catch(() => undefined);
      if (!observed.ok || observed.issue.number !== made.number || observed.issue.url.toLowerCase() !== made.url.toLowerCase() || observed.issue.title !== `[${id}] ${input.title}` || observed.issue.state !== 'open' || labels.some((label) => !observed.issue.labels.some((actual) => actual.toLowerCase() === label.toLowerCase())) || observedBody !== body) {
        throw new NoticeError({ code: 'cli.task-create.issue-unverified', args: { issue: made.url } });
      }
      return { identifiers: { task: id, issue: made.url } };
    },
  };

  const card: PlannedAction = {
    kind: 'project.add',
    target: input.resume ? `${input.repository} ${id} ${input.resume.url}` : `${input.repository} ${id}`,
    identifiers: { task: id, project: `${input.project.owner}/${input.project.number}`, ...(input.resume ? { issue: input.resume.url } : {}) },
    fingerprint: `project.add\n${intent}`,
    summary: input.resume ? { code: 'cli.task-create.existing-card', args: { issue: input.resume.url, owner: input.project.owner, number: input.project.number } } : { code: 'cli.task-create.card', args: { owner: input.project.owner, number: input.project.number } },
    reason,
    dependsOn: input.resume ? [] : [issue],
    run: async () => {
      card.identifiers = { ...card.identifiers, ...(created.url ? { issue: created.url } : {}), ...(created.item ? { projectItem: created.item } : {}) };
      await checkProcess();
      if (!created.url) throw new NoticeError({ code: 'cli.err.issue-not-created' });
      try { created.item = await addIssueToProject(input.token, input.project, created.url, input.fetch); }
      catch (error) { throw new NoticeError({ code: 'cli.task-create.project-write-uncertain', args: { issue: created.url, detail: detailOf(error) } }); }
      card.identifiers = { ...card.identifiers, issue: created.url, projectItem: created.item };
      const delays = [2000, 4000, 8000];
      const wait = input.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
      for (let attempt = 0; attempt <= delays.length; attempt += 1) {
        const observed = await readProject(input.token, input.project, [input.repository], input.fetch);
        if (!observed.ok || observed.read.membershipComplete === false) throw new NoticeError({ code: 'cli.task-create.project-unverified', args: { issue: created.url } });
        const matches = observed.read.cards.filter((entry) => entry.url.toLowerCase() === created.url?.toLowerCase());
        if (matches.length > 1 || (matches.length === 1 && matches[0].projectItemId !== created.item)) throw new NoticeError({ code: 'cli.task-create.project-unverified', args: { issue: created.url } });
        if (matches.length === 1) {
          if (input.initialBoardProjection && (observed.read.statusOptions?.filter((option) => option === input.initialBoardProjection).length !== 1 || !matches[0].boardStatusRead || matches[0].boardStatus !== input.initialBoardProjection)) throw new NoticeError({ code: 'cli.task-create.projection-unverified', args: { repository: input.repository } });
          return { identifiers: { task: id, issue: created.url, projectItem: created.item } };
        }
        if (attempt < delays.length) await wait(delays[attempt]);
      }
      throw new NoticeError({ code: 'cli.task-create.project-unverified', args: { issue: created.url } });
    },
  };

  // A field that lives on the board is set after the card exists, one action each, so the plan shows it.
  const fields = [...(input.initialBoardStatus && (!input.resume?.item || input.resume.needsInitialStatus) ? [{ field: 'Status', value: input.initialBoardStatus }] : []), ...(input.contract?.projectFields ?? []).filter((field) => !input.resume?.item || input.resume.pendingProjectFields?.includes(field.field))];
  const fieldActions: PlannedAction[] = fields.map((f): PlannedAction => {
    const action: PlannedAction = {
    kind: 'project.field',
    target: `${input.repository} ${id}`,
    identifiers: { task: id, project: `${input.project.owner}/${input.project.number}`, field: f.field, value: f.value, ...(input.resume ? { issue: input.resume.url, ...(input.resume.item ? { projectItem: input.resume.item } : {}) } : {}) },
    fingerprint: `project.field\n${JSON.stringify(f)}\n${intent}`,
    summary: input.resume?.item ? (input.resume.needsInitialStatus && f.field === 'Status' ? { code: 'cli.task-create.resume-status' as const, args: { issue: input.resume.url, value: f.value } } : { code: 'cli.task-create.resume-field' as const, args: { issue: input.resume.url, field: f.field, value: f.value } }) : { code: 'cli.task-create.project-field' as const, args: { field: f.field, value: f.value } },
    reason,
    dependsOn: input.resume?.item ? [] : [card],
    run: async () => {
      action.identifiers = { ...action.identifiers, ...(created.url ? { issue: created.url } : {}), ...(created.item ? { projectItem: created.item } : {}) };
      await checkProcess();
      if (!created.item) throw new NoticeError({ code: 'github.err.no-data' });
      if (f.field === 'Status' && input.initialBoardStatus) {
        const observe = async () => {
          const result = await readProject(input.token, input.project, [input.repository], input.fetch);
          if (!result.ok || result.read.membershipComplete === false || result.read.statusOptions?.filter((option) => option === f.value).length !== 1) throw new NoticeError({ code: 'cli.task-create.status-unverified' });
          const matches = result.read.cards.filter((card) => card.projectItemId === created.item && card.url.toLowerCase() === created.url?.toLowerCase());
          if (matches.length !== 1 || !matches[0].boardStatusRead) throw new NoticeError({ code: 'cli.task-create.status-unverified' });
          return matches[0].boardStatus;
        };
        const before = await observe();
        if (before === f.value) { input.resume?.onStatusRestored?.(); return; }
        if (before !== undefined) throw new NoticeError({ code: 'cli.task-create.status-unverified' });
        try { await setProjectField(input.token, input.project, created.item, f.field, f.value, input.fetch); }
        catch (error) { throw new NoticeError({ code: 'cli.task-create.field-write-uncertain', args: { field: f.field, detail: detailOf(error) } }); }
        if (await observe() !== f.value) throw new NoticeError({ code: 'cli.task-create.status-unverified' });
        input.resume?.onStatusRestored?.();
        return;
      }
      const observe = async () => {
        const result = await readProject(input.token, input.project, [input.repository], input.fetch, [f.field]);
        if (!result.ok || result.read.membershipComplete === false) throw new NoticeError({ code: 'cli.task-create.field-unverified', args: { field: f.field } });
        const matches = result.read.cards.filter((entry) => entry.projectItemId === created.item && entry.url.toLowerCase() === created.url?.toLowerCase());
        if (matches.length !== 1 || matches[0].fieldsRead?.[f.field] !== true) throw new NoticeError({ code: 'cli.task-create.field-unverified', args: { field: f.field } });
        return matches[0].fields?.[f.field];
      };
      const before = await observe();
      if (before === f.value) { input.resume?.onFieldRestored?.(f.field); return; }
      if (before !== undefined) throw new NoticeError({ code: 'cli.task-create.field-unverified', args: { field: f.field } });
      try { await setProjectField(input.token, input.project, created.item, f.field, f.value, input.fetch); }
      catch (error) { throw new NoticeError({ code: 'cli.task-create.field-write-uncertain', args: { field: f.field, detail: detailOf(error) } }); }
      if (await observe() !== f.value) throw new NoticeError({ code: 'cli.task-create.field-unverified', args: { field: f.field } });
      input.resume?.onFieldRestored?.(f.field);
    },
    };
    return action;
  });

  const branch = `docs/${id.toLowerCase()}-${slugOf(input.title)}`;
  const recoveryReservation = `refs/heads/weaver/reservations/recover-pr-${id.toLowerCase()}`;
  const files: PlannedAction = {
    kind: 'files.pull-request',
    target: `${input.repository} ${branch}${input.resume ? ` ${input.resume.url}` : ''}`,
    identifiers: { task: id, branch, path: taskPath, requirement: input.requirement.id, recoveryReservation, ...(input.resume ? { issue: input.resume.url, ...(input.resume.item ? { projectItem: input.resume.item } : {}) } : {}) },
    fingerprint: `files.pull-request\n${intent}`,
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
              criteria: input.criteria.join(', ') || '-',
              assigneeType: input.assigneeType,
              assignee: input.assignee ?? '-',
              reservation: recoveryReservation,
            },
          }
        : { code: 'cli.task-create.files', args: { repository: input.repository, path: taskPath, task: id, requirement: input.requirement.id, criteria: input.criteria.join(', ') || '-', assigneeType: input.assigneeType, assignee: input.assignee ?? '-', reservation: recoveryReservation } },
    reason,
    dependsOn: input.resume ? (input.resume.item ? fieldActions : [card, ...fieldActions]) : [issue, card, ...fieldActions],
    run: async () => {
      files.identifiers = { ...files.identifiers, ...(created.url ? { issue: created.url } : {}), ...(created.item ? { projectItem: created.item } : {}) };
      await checkProcess();
      if (!created.url || created.number === undefined) throw new NoticeError({ code: 'cli.err.issue-not-created' });
      const { system } = input;
      const checkMissing = async () => {
        let pulls: string[];
        try { pulls = await taskPullInventory(input.token, input.repository, input.fetch); }
        catch { throw new NoticeError({ code: 'cli.task-create.resume-unsafe', args: { repository: input.repository } }); }
        if (pulls.some((value) => value.toLowerCase().includes(id.toLowerCase()))) throw new NoticeError({ code: 'cli.task-create.resume-unsafe', args: { repository: input.repository } });
        const remote = await system.run('git', ['ls-remote', '--heads', `https://github.com/${input.repository}.git`, `refs/heads/${branch}`]);
        if (remote.trim()) throw new NoticeError({ code: 'cli.task-create.resume-unsafe', args: { repository: input.repository } });
      };
      await checkMissing();
      try { await reserveRecoveryFromDefault(input.token, input.repository, recoveryReservation, input.fetch); }
      catch { throw new NoticeError({ code: 'cli.task-create.recovery-reservation-unsafe', args: { reservation: recoveryReservation } }); }
      await checkProcess();
      await checkMissing();
      const pull = await openFilesPullRequest({
        system,
        root: input.root,
        repository: input.repository,
        branch,
        title: `docs: add ${id} ${input.title}`,
        commitMessage: `docs: add ${id} ${input.title}

${attribution(input.locale, input.login)}`,
        body: `${attribution(input.locale, input.login)}

Adds ${taskPath} and lists ${id} under ${input.requirement.id}. Issue: ${created.url}`,
        beforePush: checkProcess,
        onWriteFailure: (_phase, error) => { throw new NoticeError({ code: 'cli.task-create.files-write-uncertain', args: { branch, detail: detailOf(error) } }); },
        edit: async ({ work, top, base }) => {
          await checkProcess();
          const relative = path.relative(top, path.resolve(input.root, input.requirement.path)).split(path.sep).join('/');
          const taskRelative = path.relative(top, path.resolve(input.root, taskPath)).split(path.sep).join('/');
          if ([relative, taskRelative].some((value) => value === '..' || value.startsWith('../') || path.posix.isAbsolute(value) || path.win32.isAbsolute(value))) throw new NoticeError({ code: 'cli.task-create.files-conflict', args: { path: taskPath } });
          const requirementText = await system.readText(path.join(work, relative));
          const existingTask = await system.readText(path.join(work, taskRelative));
          if (input.requirementText !== undefined && (requirementText === undefined || requirementText.replace(/\r\n/g, '\n') !== input.requirementText.replace(/\r\n/g, '\n'))) throw new NoticeError({ code: 'cli.task-create.requirement-changed', args: { path: relative } });
          if (existingTask !== undefined || (requirementText !== undefined && (new RegExp(`\\b${id}\\b`, 'i').test(requirementText) || requirementText.toLowerCase().includes((created.url as string).toLowerCase())))) throw new NoticeError({ code: 'cli.task-create.files-conflict', args: { path: taskPath } });
          const updated = requirementText === undefined ? undefined : addTaskToRequirement(requirementText, taskListLine(id, input.title, created.number as number, created.url as string));
          if (updated === undefined) throw new NoticeError({ code: 'cli.err.no-tasks-section', args: { path: relative, base } });
          await system.writeFile(path.join(work, relative), updated);
          await system.writeFile(
            path.join(work, taskRelative),
            renderTaskFile({
              id,
              title: input.title,
              requirement: input.requirement.id,
              ...(input.requirement.repository && (input.requirement.repository.toLowerCase() !== input.repository.toLowerCase() || input.requirement.repositoryServer) ? { requirementRepository: input.requirement.repository } : {}),
              ...(input.requirement.repository && input.requirement.repositoryServer ? { requirementServer: input.requirement.repositoryServer } : {}),
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
      files.identifiers = { ...files.identifiers, issue: created.url, pullRequest: pull };
      try {
        const observed = JSON.parse(await system.run('gh', ['pr', 'view', pull, '--repo', input.repository, '--json', 'url,state,headRefName'])) as { url?: unknown; state?: unknown; headRefName?: unknown };
        if (typeof observed.url !== 'string' || observed.url !== pull || observed.state !== 'OPEN' || observed.headRefName !== branch || !new RegExp(`^https://github\\.com/${input.repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/pull/\\d+$`, 'i').test(pull)) throw new Error('PR identity mismatch');
      } catch {
        throw new NoticeError({ code: 'cli.task-create.pr-unverified', args: { pull } });
      }
      return { identifiers: { task: id, issue: created.url, branch, pullRequest: pull } };
    },
  };

  return [...(input.resume ? [] : [issue]), ...(input.resume?.item ? [] : [card]), ...fieldActions, files];
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
