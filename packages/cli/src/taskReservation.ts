import { createHash } from 'crypto';
import type { Fetch } from '@ebrain-lab/weaver-github';

/** Persistent, repository-visible reservations. Never remove or take over automatically. */
export function taskReservationRefs(repository: string, requirement: string, requirementRepository: string | undefined, requirementServer: string | undefined, title: string, task: string): { operation: string; task: string } {
  const identity = JSON.stringify([repository.toLowerCase(), requirement.toUpperCase(), requirementRepository?.toLowerCase() ?? '', requirementServer?.toLowerCase() ?? '', title.trim().toLowerCase()]);
  const digest = createHash('sha256').update(identity).digest('hex');
  return { operation: `refs/heads/weaver/reservations/op-${digest}`, task: `refs/heads/weaver/reservations/${task.toLowerCase()}` };
}

/** A recoverable association hint, not evidence that a prior creator has stopped. */
export function registrationMarker(operationRef: string, task: string): string {
  return `<!-- weaver-registration:v1 operation=${operationRef} task=${task} -->`;
}

/** A visible operation reservation blocks a new plan; 404 is not an atomic absence guarantee. */
export async function operationReservationVisible(token: string, repository: string, operationRef: string, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<boolean> {
  if (!/^refs\/heads\/weaver\/reservations\/op-[a-f0-9]{64}$/.test(operationRef)) throw new Error('Invalid operation reservation');
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/git/ref/${operationRef.slice('refs/'.length)}`, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body: undefined as unknown as string });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error('Operation reservation unavailable');
  const body = await response.json() as { ref?: unknown };
  if (body.ref !== operationRef) throw new Error('Operation reservation identity uncertain');
  return true;
}

/** Atomic ref creation prevents two cooperating creators from owning the same name. A failed or
 * unknown response leaves the ref untouched for investigation and must never trigger a retry here. */
export async function reserveTask(token: string, repository: string, refs: { operation: string; task: string }, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<void> {
  const api = `https://api.github.com/repos/${repository}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const read = async (url: string): Promise<unknown> => {
    const response = await fetchImpl(url, { method: 'GET', headers, body: undefined as unknown as string });
    if (!response.ok) throw new Error('Reservation source unavailable');
    return response.json();
  };
  const repo = await read(api) as { default_branch?: unknown };
  if (typeof repo?.default_branch !== 'string' || !repo.default_branch) throw new Error('Default branch unavailable');
  const commit = await read(`${api}/commits/${encodeURIComponent(repo.default_branch)}`) as { sha?: unknown };
  if (typeof commit?.sha !== 'string' || !/^[a-f0-9]{40}$/i.test(commit.sha)) throw new Error('Default branch revision unavailable');
  for (const ref of [refs.operation, refs.task]) {
    const response = await fetchImpl(`${api}/git/refs`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref, sha: commit.sha }) });
    if (!response.ok) throw new Error('Reservation refused or unavailable');
    const result = await response.json() as { ref?: unknown; object?: { sha?: unknown } };
    if (result?.ref !== ref || result.object?.sha !== commit.sha) throw new Error('Reservation outcome uncertain');
  }
}

/** One persistent recovery reservation tied to a previously verified commit. */
export async function reserveRecovery(token: string, repository: string, ref: string, sha: string, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<void> {
  if (!/^refs\/heads\/weaver\/reservations\/recover-pr-task-\d{3,}$/.test(ref) || !/^[a-f0-9]{40}$/i.test(sha)) throw new Error('Invalid recovery reservation');
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/git/refs`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ ref, sha }) });
  if (!response.ok) throw new Error('Recovery reservation unavailable');
  const body = await response.json() as { ref?: unknown; object?: { sha?: unknown } };
  if (body.ref !== ref || body.object?.sha !== sha) throw new Error('Recovery reservation uncertain');
}
