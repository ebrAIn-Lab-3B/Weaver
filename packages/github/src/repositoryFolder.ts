import type { Notice } from '@ebrain-lab/weaver-markdown';
import type { FetchFn } from './issue';
import { fetchRepositoryFile } from './processFile';

const API = 'https://api.github.com';

export type FolderListing =
  /** The names of the files of the folder (not of its sub-folders). */
  | { status: 'read'; names: string[] }
  | { status: 'missing' }
  | { status: 'failed'; error: Notice };

/** Lists the files of a folder of a repository on its default branch. A folder that is not there is a normal answer. */
export async function listRepositoryFolder(token: string, repository: string, folder: string, fetchFn: FetchFn = fetch): Promise<FolderListing> {
  const encoded = folder.split('/').map(encodeURIComponent).join('/');
  let response;
  try {
    response = await fetchFn(`${API}/repos/${repository}/contents/${encoded}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
    });
  } catch (error) {
    return { status: 'failed', error: { code: 'github.err.network', args: { detail: (error as Error).message } } };
  }
  if (response.status === 404) return { status: 'missing' };
  if (!response.ok) return { status: 'failed', error: { code: 'github.err.http', args: { status: response.status } } };
  try {
    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) return { status: 'missing' };
    const names = body.flatMap((entry) => (typeof entry === 'object' && entry !== null && (entry as { type?: string }).type === 'file' && typeof (entry as { name?: unknown }).name === 'string' ? [(entry as { name: string }).name] : []));
    return { status: 'read', names };
  } catch (error) {
    return { status: 'failed', error: { code: 'github.err.network', args: { detail: (error as Error).message } } };
  }
}

/** Whether a task file is on the default branch of a repository (DEC-024 item 1). `unknown` when GitHub could not be asked. */
export type TaskFileState = 'on-github' | 'absent' | 'unknown';

export async function taskFileState(token: string, repository: string, taskId: string, taskDirectory: string, fetchFn?: FetchFn): Promise<TaskFileState> {
  const result = await fetchRepositoryFile(token, repository, `${taskDirectory}/${taskId}.md`, {}, fetchFn);
  if (result.status === 'read') return 'on-github';
  if (result.status === 'missing') return 'absent';
  return 'unknown';
}

/** The default branch of a repository on GitHub; nothing when GitHub could not be asked. */
export async function fetchDefaultBranch(token: string, repository: string, fetchFn: FetchFn = fetch): Promise<string | undefined> {
  try {
    const response = await fetchFn(`${API}/repos/${repository}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { default_branch?: unknown };
    return typeof body.default_branch === 'string' ? body.default_branch : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The number of an open pull request that already adds the task file of a task: its branch or its title
 * names the task (`docs/task-106-...`, `docs: add TASK-106 ...`). Nothing when there is none or GitHub could not be asked.
 */
export async function openPullForTask(token: string, repository: string, taskId: string, fetchFn: FetchFn = fetch): Promise<number | undefined> {
  try {
    const response = await fetchFn(`${API}/repos/${repository}/pulls?state=open&per_page=100`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!response.ok) return undefined;
    const pulls = (await response.json()) as { number: number; title?: string; head?: { ref?: string } }[];
    if (!Array.isArray(pulls)) return undefined;
    const id = taskId.toLowerCase();
    const found = pulls.find((p) => ((p.title ?? '').toLowerCase().includes(`add ${id} `) || (p.head?.ref ?? '').toLowerCase().startsWith(`docs/${id}-`)));
    return found?.number;
  } catch {
    return undefined;
  }
}
