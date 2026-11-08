import { NoticeError } from './errors';
import type { FetchFn } from './issue';

export interface NewFilePullRequest {
  /** The path to add, such as `.weaver/process.yaml`. */
  path: string;
  /** The whole text of the new file. */
  content: string;
  branch: string;
  title: string;
  body: string;
  commitMessage: string;
}

const API = 'https://api.github.com';

async function call<T>(fetchImpl: FetchFn, token: string, url: string, method: 'GET' | 'POST' | 'PUT', payload?: unknown): Promise<{ status: number; body: T }> {
  const response = await fetchImpl(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  if (response.status === 401) throw new NoticeError({ code: 'github.err.unauthorized' });
  const body = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) {
    throw new NoticeError(body.message ? { code: 'github.err.http-detail', args: { status: response.status, detail: body.message } } : { code: 'github.err.http', args: { status: response.status } });
  }
  return { status: response.status, body };
}

/**
 * Adds one new file to a repository as a pull request, through the GitHub API: a branch is cut from
 * the default branch, the file is committed to it, and the pull request is opened. It needs no
 * checkout of the repository on this computer and never writes to the default branch. It needs the
 * `repo` scope and write access; without it GitHub says so and nothing is left half done except,
 * at worst, an empty branch. Returns the address of the pull request.
 */
export async function openFilePullRequest(token: string, repository: string, file: NewFilePullRequest, fetchImpl: FetchFn = fetch): Promise<{ number: number; url: string }> {
  const repo = `${API}/repos/${repository}`;
  const info = await call<{ default_branch: string }>(fetchImpl, token, repo, 'GET');
  const base = info.body.default_branch;
  const head = await call<{ object: { sha: string } }>(fetchImpl, token, `${repo}/git/ref/heads/${encodeURIComponent(base)}`, 'GET');
  await call(fetchImpl, token, `${repo}/git/refs`, 'POST', { ref: `refs/heads/${file.branch}`, sha: head.body.object.sha });
  const encodedPath = file.path.split('/').map(encodeURIComponent).join('/');
  await call(fetchImpl, token, `${repo}/contents/${encodedPath}`, 'PUT', {
    message: file.commitMessage,
    content: Buffer.from(file.content, 'utf8').toString('base64'),
    branch: file.branch,
  });
  const pull = await call<{ number?: number; html_url?: string }>(fetchImpl, token, `${repo}/pulls`, 'POST', { title: file.title, head: file.branch, base, body: file.body });
  if (typeof pull.body.number !== 'number' || typeof pull.body.html_url !== 'string') throw new NoticeError({ code: 'github.err.no-data' });
  return { number: pull.body.number, url: pull.body.html_url };
}

/** True when a pull request from `branch` is already open, so the same change is not offered twice. A list that cannot be read counts as none open; the person still confirms the action. */
export async function filePullRequestOpen(token: string, repository: string, branch: string, fetchImpl: FetchFn = fetch): Promise<boolean> {
  try {
    const owner = repository.split('/')[0];
    const listed = await call<{ head?: { ref?: string } }[]>(fetchImpl, token, `${API}/repos/${repository}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`, 'GET');
    return Array.isArray(listed.body) && listed.body.some((pull) => pull.head?.ref === branch);
  } catch {
    return false;
  }
}

/** One file of a change: a new file, or the whole new text of a file that is there. */
export interface FileChange {
  path: string;
  content: string;
}

export interface FilesPullRequest {
  files: FileChange[];
  branch: string;
  title: string;
  body: string;
  commitMessage: string;
}

/**
 * Opens a pull request that adds some files and changes others, through the GitHub API: a branch is cut
 * from the default branch, each file is committed to it (a file that is there is written against its
 * version, so nothing else is lost), and the pull request is opened. It needs no clone and never writes
 * to the default branch. It needs the `repo` scope and write access. Returns the pull request.
 */
export async function openFilesChangePullRequest(token: string, repository: string, change: FilesPullRequest, fetchImpl: FetchFn = fetch): Promise<{ number: number; url: string }> {
  const repo = `${API}/repos/${repository}`;
  const info = await call<{ default_branch: string }>(fetchImpl, token, repo, 'GET');
  const base = info.body.default_branch;
  const head = await call<{ object: { sha: string } }>(fetchImpl, token, `${repo}/git/ref/heads/${encodeURIComponent(base)}`, 'GET');
  await call(fetchImpl, token, `${repo}/git/refs`, 'POST', { ref: `refs/heads/${change.branch}`, sha: head.body.object.sha });
  for (const file of change.files) {
    const encodedPath = file.path.split('/').map(encodeURIComponent).join('/');
    const url = `${repo}/contents/${encodedPath}`;
    // A file that is not there answers 404, which is how a new file is told from one that changes.
    let sha: string | undefined;
    try {
      const existing = await call<{ sha?: string }>(fetchImpl, token, `${url}?ref=${encodeURIComponent(change.branch)}`, 'GET');
      sha = existing.body.sha;
    } catch (error) {
      const notice = (error as { notice?: { args?: { status?: number } } }).notice;
      if (notice?.args?.status !== 404) throw error;
    }
    await call(fetchImpl, token, url, 'PUT', {
      message: change.commitMessage,
      content: Buffer.from(file.content, 'utf8').toString('base64'),
      branch: change.branch,
      ...(sha ? { sha } : {}),
    });
  }
  const pull = await call<{ number?: number; html_url?: string }>(fetchImpl, token, `${repo}/pulls`, 'POST', { title: change.title, head: change.branch, base, body: change.body });
  if (typeof pull.body.number !== 'number' || typeof pull.body.html_url !== 'string') throw new NoticeError({ code: 'github.err.no-data' });
  return { number: pull.body.number, url: pull.body.html_url };
}
