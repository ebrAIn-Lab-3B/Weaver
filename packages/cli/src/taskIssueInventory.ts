import type { Fetch } from '@ebrain-lab/weaver-github';
import { parseIssueUrl } from '@ebrain-lab/weaver-markdown';
import { registrationMarker } from './taskReservation';

/** Complete repository Issue inventory for allocation and duplicate-candidate detection.
 * GitHub pagination is not an atomic snapshot; callers must not treat this as a lock. */
export async function taskIssueInventory(token: string, repository: string, fetchImpl: Fetch = fetch as unknown as Fetch, requiredIssue?: { url: string; title: string }): Promise<string[]> {
  const titles: string[] = [];
  let foundRequired = false;
  for (let page = 1; page <= 50; page += 1) {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/issues?state=all&per_page=100&page=${page}`, {
      method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body: undefined as unknown as string,
    });
    if (!response.ok) throw new Error('Issue inventory unavailable');
    const items: unknown = await response.json();
    if (!Array.isArray(items) || items.length > 100) throw new Error('Issue inventory incomplete');
    for (const item of items) {
      if (!item || typeof item !== 'object' || typeof item.title !== 'string') throw new Error('Issue inventory incomplete');
      if (!('pull_request' in item)) {
        if (requiredIssue && typeof item.html_url !== 'string') throw new Error('Issue identity incomplete');
        if (requiredIssue && item.html_url.toLowerCase().replace(/\/$/, '') === requiredIssue.url.toLowerCase().replace(/\/$/, '') && item.title === requiredIssue.title) foundRequired = true;
        titles.push(item.title);
      }
    }
    if (items.length < 100) {
      if (requiredIssue && !foundRequired) throw new Error('Issue identity not observed');
      return titles;
    }
  }
  throw new Error('Issue inventory incomplete');
}

/** An exact title is only a candidate, never enough to associate or reuse an Issue. */
export function hasTaskTitleCandidate(titles: readonly string[], title: string): boolean {
  return titles.some((value) => /^\[TASK-\d{3,}\]\s*(.*)$/i.exec(value)?.[1].trim().toLowerCase() === title.trim().toLowerCase());
}

export interface TaskIssueCandidate { task: string; url: string; markerMatches: boolean; }

/** Complete candidate read: title and marker are hints for human review, never automatic adoption. */
export async function taskIssueCandidates(token: string, repository: string, title: string, operationRef: string, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<TaskIssueCandidate[]> {
  const candidates: TaskIssueCandidate[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/issues?state=all&per_page=100&page=${page}`, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body: undefined as unknown as string });
    if (!response.ok) throw new Error('Issue candidates unavailable');
    const items: unknown = await response.json();
    if (!Array.isArray(items) || items.length > 100) throw new Error('Issue candidates incomplete');
    for (const item of items) {
      if (!item || typeof item !== 'object' || typeof item.title !== 'string') throw new Error('Issue candidates incomplete');
      if ('pull_request' in item) continue;
      const match = /^\[(TASK-\d{3,})\]\s*(.*)$/i.exec(item.title);
      if (!match || match[2].trim().toLowerCase() !== title.trim().toLowerCase()) continue;
      const ref = typeof item.html_url === 'string' ? parseIssueUrl(item.html_url) : undefined;
      if (!ref || `${ref.owner}/${ref.repo}`.toLowerCase() !== repository.toLowerCase() || (typeof item.body !== 'string' && item.body !== null)) throw new Error('Issue candidate identity incomplete');
      const task = match[1].toUpperCase();
      const v2Prefix = `<!-- weaver-registration:v2 operation=${operationRef} task=${task} intent=`;
      const markerMatches = typeof item.body === 'string' && (item.body.includes(registrationMarker(operationRef, task)) || (item.body.includes(v2Prefix) && new RegExp(`${v2Prefix}[a-f0-9]{64} -->`).test(item.body)));
      candidates.push({ task, url: item.html_url as string, markerMatches });
      if (candidates.length > 100) throw new Error('Too many Issue candidates');
    }
    if (items.length < 100) return candidates;
  }
  throw new Error('Issue candidates incomplete');
}

/** Read PR titles and head branches across all states, rejecting any incomplete page. */
export async function taskPullInventory(token: string, repository: string, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<string[]> {
  const texts: string[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/pulls?state=all&per_page=100&page=${page}`, {
      method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body: undefined as unknown as string,
    });
    if (!response.ok) throw new Error('PR inventory unavailable');
    const items: unknown = await response.json();
    if (!Array.isArray(items) || items.length > 100) throw new Error('PR inventory incomplete');
    for (const item of items) {
      if (!item || typeof item !== 'object' || typeof item.title !== 'string' || !item.head || typeof item.head.ref !== 'string') throw new Error('PR inventory incomplete');
      texts.push(item.title, item.head.ref);
    }
    if (items.length < 100) return texts;
  }
  throw new Error('PR inventory incomplete');
}
