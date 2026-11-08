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
