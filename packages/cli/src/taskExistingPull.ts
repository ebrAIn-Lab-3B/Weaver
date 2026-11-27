import type { Fetch } from '@ebrain-lab/weaver-github';

export interface ExistingPullCheck {
  token: string;
  repository: string;
  branch: string;
  taskPath: string;
  requirementPath: string;
  expectedTask: string;
  expectedRequirementLine: string;
  taskId: string;
  fetch?: Fetch;
}

/** Verify the intended files at an immutable commit, shared by PR and branch recovery. */
export async function verifyTaskFiles(input: ExistingPullCheck, sha: string): Promise<void> {
  const fetchImpl = input.fetch ?? fetch as unknown as Fetch;
  const api = `https://api.github.com/repos/${input.repository}`;
  const headers = { Authorization: `Bearer ${input.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const readFile = async (file: string): Promise<string> => {
    const encodedPath = file.split('/').map(encodeURIComponent).join('/');
    const response = await fetchImpl(`${api}/contents/${encodedPath}?ref=${encodeURIComponent(sha)}`, { method: 'GET', headers, body: undefined as unknown as string });
    if (!response.ok) throw new Error('Task file read unavailable');
    const result = await response.json() as { type?: unknown; encoding?: unknown; content?: unknown };
    if (result?.type !== 'file' || result.encoding !== 'base64' || typeof result.content !== 'string') throw new Error('Task file unavailable');
    return Buffer.from(result.content.replace(/\s/g, ''), 'base64').toString('utf8').replace(/\r\n/g, '\n');
  };
  const [task, requirement] = await Promise.all([readFile(input.taskPath), readFile(input.requirementPath)]);
  const taskLines = requirement.split('\n').filter((line) => line.includes(`\`${input.taskId}\``));
  if (task !== input.expectedTask.replace(/\r\n/g, '\n') || taskLines.length !== 1 || taskLines[0] !== input.expectedRequirementLine) throw new Error('Task contents differ');
}

/** Inspect one open PR and both files at its immutable head. No write or merge is performed. */
export async function observeExistingTaskPull(input: ExistingPullCheck): Promise<{ url: string; head: string }> {
  const fetchImpl = input.fetch ?? fetch as unknown as Fetch;
  const api = `https://api.github.com/repos/${input.repository}`;
  const headers = { Authorization: `Bearer ${input.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const get = async (url: string): Promise<unknown> => {
    const response = await fetchImpl(url, { method: 'GET', headers, body: undefined as unknown as string });
    if (!response.ok) throw new Error('Pull request read unavailable');
    return response.json();
  };
  const owner = input.repository.split('/')[0];
  const repo = await get(api) as { default_branch?: unknown };
  if (typeof repo?.default_branch !== 'string' || !repo.default_branch) throw new Error('Default branch unavailable');
  const candidates = await get(`${api}/pulls?state=all&head=${encodeURIComponent(`${owner}:${input.branch}`)}&per_page=100`) as unknown;
  if (!Array.isArray(candidates) || candidates.length !== 1) throw new Error('Pull request identity ambiguous');
  type Pull = { number?: unknown; html_url?: unknown; state?: unknown; head?: { ref?: unknown; sha?: unknown; repo?: { full_name?: unknown } }; base?: { ref?: unknown; repo?: { full_name?: unknown } } };
  const pull = candidates[0] as Pull;
  const valid = (value: Pull): boolean => typeof value?.number === 'number' && typeof value.html_url === 'string' && value.html_url.toLowerCase() === `https://github.com/${input.repository}/pull/${value.number}`.toLowerCase() && value.state === 'open' && value.head?.ref === input.branch && typeof value.head?.sha === 'string' && /^[a-f0-9]{40}$/i.test(value.head.sha) && typeof value.head.repo?.full_name === 'string' && value.head.repo.full_name.toLowerCase() === input.repository.toLowerCase() && value.base?.ref === repo.default_branch && typeof value.base?.repo?.full_name === 'string' && value.base?.repo?.full_name.toLowerCase() === input.repository.toLowerCase();
  if (!valid(pull)) throw new Error('Pull request identity ambiguous');
  const sha = pull.head!.sha as string;
  await verifyTaskFiles(input, sha);
  const again = await get(`${api}/pulls/${pull.number}`) as Pull;
  if (!valid(again) || again.number !== pull.number || again.html_url !== pull.html_url || again.head?.sha !== sha) throw new Error('Pull request changed during read');
  return { url: pull.html_url as string, head: sha };
}

/** Verify the file pair on an unchanged default-branch revision and a merged PR in its history. */
export async function observeMergedTaskPull(input: ExistingPullCheck): Promise<{ url: string; revision: string; mergeCommit: string }> {
  const fetchImpl = input.fetch ?? fetch as unknown as Fetch;
  const api = `https://api.github.com/repos/${input.repository}`;
  const headers = { Authorization: `Bearer ${input.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const get = async (url: string): Promise<unknown> => {
    const response = await fetchImpl(url, { method: 'GET', headers, body: undefined as unknown as string });
    if (!response.ok) throw new Error('Merged registration read unavailable');
    return response.json();
  };
  const repo = await get(api) as { default_branch?: unknown };
  if (typeof repo?.default_branch !== 'string' || !repo.default_branch) throw new Error('Default branch unavailable');
  const branch = repo.default_branch;
  const getRevision = async () => {
    const commit = await get(`${api}/commits/${encodeURIComponent(branch)}`) as { sha?: unknown };
    if (typeof commit?.sha !== 'string' || !/^[a-f0-9]{40}$/i.test(commit.sha)) throw new Error('Default revision unavailable');
    return commit.sha;
  };
  const revision = await getRevision();
  const owner = input.repository.split('/')[0];
  const candidates = await get(`${api}/pulls?state=all&head=${encodeURIComponent(`${owner}:${input.branch}`)}&per_page=100`);
  if (!Array.isArray(candidates) || candidates.length !== 1) throw new Error('Merged PR ambiguous');
  type Pull = { number?: unknown; html_url?: unknown; state?: unknown; merged_at?: unknown; merge_commit_sha?: unknown; head?: { ref?: unknown; sha?: unknown; repo?: { full_name?: unknown } }; base?: { ref?: unknown; repo?: { full_name?: unknown } } };
  const pull = candidates[0] as Pull;
  const valid = (value: Pull): boolean => typeof value?.number === 'number' && typeof value.html_url === 'string' && value.html_url.toLowerCase() === `https://github.com/${input.repository}/pull/${value.number}`.toLowerCase() && value.state === 'closed' && typeof value.merged_at === 'string' && typeof value.merge_commit_sha === 'string' && /^[a-f0-9]{40}$/i.test(value.merge_commit_sha) && value.head?.ref === input.branch && typeof value.head?.sha === 'string' && /^[a-f0-9]{40}$/i.test(value.head.sha) && typeof value.head.repo?.full_name === 'string' && value.head.repo.full_name.toLowerCase() === input.repository.toLowerCase() && value.base?.ref === branch && typeof value.base?.repo?.full_name === 'string' && value.base.repo.full_name.toLowerCase() === input.repository.toLowerCase();
  if (!valid(pull)) throw new Error('Merged PR not established');
  const comparison = await get(`${api}/compare/${pull.merge_commit_sha}...${revision}`) as { status?: unknown };
  if (comparison?.status !== 'ahead' && comparison?.status !== 'identical') throw new Error('Merge is not in default history');
  await verifyTaskFiles(input, revision);
  const again = await get(`${api}/pulls/${pull.number}`) as Pull;
  if (!valid(again) || again.number !== pull.number || again.html_url !== pull.html_url || again.head?.sha !== pull.head?.sha || again.merge_commit_sha !== pull.merge_commit_sha || await getRevision() !== revision) throw new Error('Merged registration changed during read');
  return { url: pull.html_url as string, revision, mergeCommit: pull.merge_commit_sha as string };
}
