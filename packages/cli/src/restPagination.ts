import type { Fetch } from '@ebrain-lab/weaver-github';

/** Validate a Link target before allowing the caller to send GitHub credentials to it. */
export function nextRestPage(response: { headers?: { get(name: string): string | null } }, baseUrl: string, currentPage: number): URL | undefined {
  const link = response.headers?.get('link');
  if (!link) return undefined;
  let next: URL | undefined;
  for (const part of link.split(',')) {
    const match = /^\s*<([^>]+)>\s*;(.*)$/.exec(part);
    const relation = match && /(?:^|;)\s*rel\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(match[2]);
    if (!match || !relation) throw new Error('Invalid pagination link');
    if (!(relation[1] ?? relation[2]).split(/\s+/).includes('next')) continue;
    if (next) throw new Error('Ambiguous pagination link');
    next = new URL(match[1]);
  }
  if (!next) return undefined;
  const base = new URL(baseUrl);
  const resource = base.pathname.endsWith('/issues') ? 'issues' : base.pathname.endsWith('/pulls') ? 'pulls' : '';
  const numericPath = new RegExp(`^/repositories/\\d+/${resource}$`).test(next.pathname);
  const allowedKeys = new Set([...base.searchParams.keys(), 'page', 'after', 'before']);
  if (!resource || next.origin !== base.origin || next.username || next.password || next.hash || (next.pathname !== base.pathname && !numericPath) || next.searchParams.getAll('page').length !== 1 || next.searchParams.get('page') !== String(currentPage + 1) || [...next.searchParams.keys()].some((key) => !allowedKeys.has(key) || next!.searchParams.getAll(key).length !== 1) || [...base.searchParams].some(([key, value]) => key !== 'page' && next!.searchParams.get(key) !== value)) throw new Error('Unexpected pagination link');
  return next;
}

/** GitHub may use /repositories/{id}; confirm that ID belongs to the selected repository. */
export async function validatePaginationRepository(next: URL, repository: string, token: string, fetchImpl: Fetch): Promise<void> {
  const match = /^\/repositories\/(\d+)\/(?:issues|pulls)$/.exec(next.pathname);
  if (!match) return;
  const response = await fetchImpl(`https://api.github.com/repos/${repository}`, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body: undefined as unknown as string });
  if (!response.ok) throw new Error('Pagination repository unavailable');
  const repo = await response.json() as { id?: unknown; full_name?: unknown };
  if (!Number.isSafeInteger(repo?.id) || String(repo.id) !== match[1] || typeof repo.full_name !== 'string' || repo.full_name.toLowerCase() !== repository.toLowerCase()) throw new Error('Pagination repository mismatch');
}

/** Full pages without a Link can be probed by number only before a cursor is in use. */
export function fallbackRestPage(currentUrl: string, baseUrl: string, nextPage: number): string {
  const current = new URL(currentUrl);
  if (current.searchParams.has('after') || current.searchParams.has('before')) throw new Error('Pagination cursor incomplete');
  const fallback = new URL(baseUrl);
  fallback.searchParams.set('page', String(nextPage));
  return fallback.href;
}
