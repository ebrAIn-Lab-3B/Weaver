import * as vscode from 'vscode';
import { checkFolderUpdate, type MessageKey, repositoryOfRemote } from '@ebrain-lab/weaver-markdown';
import { log } from './log';
import { message } from './locale';

/** The parts of the Git extension of VS Code that this uses. */
interface GitRepository {
  rootUri: vscode.Uri;
  state: {
    HEAD?: { name?: string; upstream?: { name: string; remote: string }; ahead?: number; behind?: number };
    remotes: { name: string; fetchUrl?: string }[];
    workingTreeChanges: unknown[];
    indexChanges: unknown[];
    mergeChanges: unknown[];
  };
  fetch(): Promise<void>;
  pull(): Promise<void>;
}
interface GitApi {
  repositories: GitRepository[];
}

async function gitApi(): Promise<GitApi | undefined> {
  const extension = vscode.extensions.getExtension<{ getAPI(version: 1): GitApi }>('vscode.git');
  if (!extension) return undefined;
  try {
    const exports = extension.isActive ? extension.exports : await extension.activate();
    return exports.getAPI(1);
  } catch {
    return undefined;
  }
}

/**
 * Brings the open clone of a repository up to date, from the card that says the folder is behind
 * (DEC-024 item 3). It only fast-forwards: it refuses a detached HEAD, a branch that follows nothing,
 * any change that is not committed, and any commit of the branch's own, and says which. It shows what
 * it will do and asks first (DEC-008). Returns true when the folder was updated.
 */
export async function updateFolder(repository: string): Promise<boolean> {
  const api = await gitApi();
  if (!api) {
    void vscode.window.showWarningMessage(message('ui.update-folder.no-git'));
    return false;
  }
  const wanted = repository.toLowerCase();
  const repo = api.repositories.find((r) => r.state.remotes.some((remote) => repositoryOfRemote(remote.fetchUrl ?? '')?.toLowerCase() === wanted));
  if (!repo) {
    void vscode.window.showInformationMessage(message('ui.update-folder.no-folder', { repository }));
    return false;
  }

  const stateOf = () => {
    const head = repo.state.HEAD;
    return {
      ...(head?.name ? { branch: head.name } : {}),
      ...(head?.upstream ? { upstream: `${head.upstream.remote}/${head.upstream.name}` } : {}),
      ahead: head?.ahead ?? 0,
      behind: head?.behind ?? 0,
      changed: repo.state.workingTreeChanges.length + repo.state.indexChanges.length + repo.state.mergeChanges.length,
    };
  };
  const refuse = (reason: string): false => {
    void vscode.window.showInformationMessage(message(`ui.update-folder.${reason}` as MessageKey, { repository }));
    return false;
  };

  // What is behind is known only after a fetch, which changes no file of the folder.
  try {
    await repo.fetch();
  } catch (error) {
    log(`update folder: fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const check = checkFolderUpdate(stateOf());
  if (!check.ok) return refuse(check.reason);

  const update = message('ui.update-folder.button');
  const choice = await vscode.window.showInformationMessage(
    message('ui.update-folder.title', { repository }),
    { modal: true, detail: message('ui.update-folder.detail', { behind: check.behind, upstream: check.upstream, branch: check.branch }) },
    update,
  );
  if (choice !== update) return false;

  try {
    await repo.pull();
  } catch (error) {
    void vscode.window.showErrorMessage(message('ui.update-folder.failed', { detail: error instanceof Error ? error.message : String(error) }));
    return false;
  }
  void vscode.window.showInformationMessage(message('ui.update-folder.done', { repository }));
  return true;
}
