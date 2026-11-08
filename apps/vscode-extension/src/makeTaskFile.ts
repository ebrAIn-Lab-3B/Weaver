import * as vscode from 'vscode';
import {
  type Artifact,
  draftTaskFile,
  formatNotice,
  requirementDirectoryOf,
  requirementIdsIn,
  t,
  taskDirectoryOf,
} from '@ebrain-lab/weaver-markdown';
import {
  errorNotice,
  fetchIssueBody,
  fetchRepositoryFile,
  filePullRequestOpen,
  listRepositoryFolder,
  openFilesChangePullRequest,
} from '@ebrain-lab/weaver-github';
import { getGitHubToken } from './github';
import { currentLocale, message } from './locale';
import { openPage } from './openPage';

/** A card whose title names a task, as the Overview knows it. */
export interface TaskFileCard {
  taskId: string;
  title: string;
  number: number;
  url: string;
  repository: string;
  assignees: readonly string[];
}

/**
 * Makes the task file of a card that has none, on GitHub, as a pull request (DEC-024 item 4). It finds
 * the requirement from the Issue (a `REQ-number` in its title or text), or asks; reads that requirement
 * from GitHub; drafts the task file and the line under `## Tasks` with the same functions as
 * `weaver task create`; shows the whole file in a dialog; and opens the pull request only after a yes
 * (DEC-008). The default branch is never written to. Returns true when the pull request was opened.
 */
export async function makeTaskFile(card: TaskFileCard, known: readonly Artifact[]): Promise<boolean> {
  const locale = currentLocale();
  const token = await getGitHubToken(true, ['repo', 'project']);
  if (!token) return false;
  const { repository, taskId } = card;
  const info = (text: string): false => {
    void vscode.window.showInformationMessage(text);
    return false;
  };

  // The folders of this repository's files, from what the open folder already knows of it; the usual ones otherwise.
  const own = (a: Artifact) => (a.kind === 'task' || a.kind === 'requirement') && a.repository?.toLowerCase() === repository.toLowerCase();
  const taskDirectory = taskDirectoryOf(known.filter((a) => own(a) && a.kind === 'task').map((a) => a.path));
  const requirementDirectory = requirementDirectoryOf(known.filter((a) => own(a) && a.kind === 'requirement').map((a) => a.path));

  const listing = await listRepositoryFolder(token, repository, requirementDirectory);
  if (listing.status === 'failed') return info(message('ui.make-task-file.failed', { detail: formatNotice(listing.error, locale) }));
  const files = listing.status === 'read' ? listing.names.filter((name) => /^REQ-\d+.*\.md$/i.test(name)) : [];
  const fileOf = (id: string) => files.find((name) => name.toUpperCase().startsWith(`${id}-`) || name.toUpperCase() === `${id}.MD`);

  // The requirement: the one the Issue names, when it is on GitHub; else the person picks one.
  const body = await fetchIssueBody(token, repository, card.number);
  const named = requirementIdsIn(`${card.title}\n${body ?? ''}`).filter((id) => fileOf(id));
  let requirementId = named.length === 1 ? named[0] : undefined;
  if (!requirementId) {
    const choices = (named.length ? named : files.map((name) => /^(REQ-\d+)/i.exec(name)?.[1].toUpperCase() ?? '').filter(Boolean)).map((id) => ({ label: id, description: fileOf(id) }));
    if (choices.length === 0) return info(message('ui.make-task-file.no-requirement', { task: taskId }));
    const picked = await vscode.window.showQuickPick(choices, { placeHolder: message('ui.make-task-file.pick-requirement', { task: taskId }) });
    if (!picked) return false;
    requirementId = picked.label;
  }
  const requirementName = fileOf(requirementId);
  if (!requirementName) return info(message('ui.make-task-file.no-requirement', { task: taskId }));
  const requirementPath = `${requirementDirectory}/${requirementName}`;
  const read = await fetchRepositoryFile(token, repository, requirementPath);
  if (read.status !== 'read') {
    return info(message('ui.make-task-file.failed', { detail: read.status === 'failed' ? formatNotice(read.error, locale) : requirementPath }));
  }

  const draft = draftTaskFile({ card, requirement: { id: requirementId, path: requirementPath, text: read.text }, taskDirectory });
  if (!draft.ok) {
    return info(draft.reason === 'bad-title' ? message('ui.make-task-file.bad-title', { task: taskId }) : message('ui.make-task-file.no-tasks-section', { requirement: requirementId, task: taskId }));
  }

  const branch = `docs/${taskId.toLowerCase()}-task-file-from-the-card`;
  if (await filePullRequestOpen(token, repository, branch)) return info(message('ui.make-task-file.already-open', { task: taskId }));

  const detail = message('ui.make-task-file.detail', { repository, taskPath: draft.taskPath, taskText: draft.taskText, requirementPath: draft.requirementPath, line: draft.line });
  const open = message('ui.make-task-file.button');
  const choice = await vscode.window.showInformationMessage(message('ui.make-task-file.title', { task: taskId }), { modal: true, detail }, open);
  if (choice !== open) return false;

  const session = await vscode.authentication.getSession('github', ['repo', 'project'], { silent: true });
  const login = session?.account.label;
  const attribution = login ? t('steward.attribution', locale, { login }) : t('steward.attribution-anonymous', locale);
  try {
    const pull = await openFilesChangePullRequest(token, repository, {
      files: [
        { path: draft.taskPath, content: draft.taskText },
        { path: draft.requirementPath, content: draft.requirementText },
      ],
      branch,
      title: `docs: add ${taskId} ${draft.title}`,
      commitMessage: `docs: add ${taskId} ${draft.title}\n\n${attribution}`,
      body: `${attribution}\n\nAdds ${draft.taskPath} and lists ${taskId} under ${requirementId}. Issue: ${card.url}`,
    });
    const view = message('ui.make-task-file.view');
    const next = await vscode.window.showInformationMessage(message('ui.make-task-file.done', { number: pull.number, task: taskId }), view);
    if (next === view) await openPage(pull.url);
    return true;
  } catch (error) {
    void vscode.window.showErrorMessage(message('ui.make-task-file.failed', { detail: formatNotice(errorNotice(error), locale) }));
    return false;
  }
}
