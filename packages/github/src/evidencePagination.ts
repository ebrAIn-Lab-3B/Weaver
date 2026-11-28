import { NoticeError } from './errors';
import type { FetchFn } from './issue';

/** Validate advertised next pages before constructing a same-scope request. */
export function evidenceHasNext(header: string | null | undefined, currentUrl: string, page: number, repositoryId?: number): boolean {
  if (!header) return false;
  const entries = header.split(',');
  let next: string | undefined;
  for (const entry of entries) {
    const match = /^\s*<([^>]+)>\s*;\s*rel="([^"]+)"\s*$/.exec(entry);
    if (!match) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
    if (match[2].split(/\s+/).includes('next')) {
      if (next) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
      next = match[1];
    }
  }
  if (!next) return false;
  let target: URL;
  try { target = new URL(next); } catch { throw new NoticeError({ code: 'github.err.evidence-incomplete' }); }
  const current = new URL(currentUrl);
  const expected = new URLSearchParams(current.search);
  expected.set('per_page', '100');
  expected.set('page', String(page + 1));
  const keys = new Set([...expected.keys(), ...target.searchParams.keys()]);
  const repoPath = /^\/repos\/[^/]+\/[^/]+(\/.*)$/.exec(current.pathname);
  const expectedNumericPath = repoPath && repositoryId ? `/repositories/${repositoryId}${repoPath[1]}` : undefined;
  if (target.origin !== current.origin || (target.pathname !== current.pathname && target.pathname !== expectedNumericPath) || [...keys].some((key) => JSON.stringify(expected.getAll(key).sort()) !== JSON.stringify(target.searchParams.getAll(key).sort())) || target.hash || target.username || target.password) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
  return true;
}

/** GitHub may rewrite the path to a numeric repository ID; verify that identity before accepting it. */
export async function evidenceNext(header: string | null | undefined, currentUrl: string, page: number, token: string, fetchFn: FetchFn): Promise<boolean> {
  if (!header || !/\/repositories\/\d+\//.test(header)) return evidenceHasNext(header, currentUrl, page);
  const current = new URL(currentUrl);
  const repo = /^\/repos\/([\w.-]+)\/([\w.-]+)\//.exec(current.pathname);
  if (!repo || current.origin !== 'https://api.github.com') throw new NoticeError({ code: 'github.err.evidence-incomplete' });
  const response = await fetchFn(`https://api.github.com/repos/${repo[1]}/${repo[2]}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' } });
  if (!response.ok) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
  const data = await response.json() as { id?: unknown; full_name?: unknown };
  if (!Number.isSafeInteger(data?.id) || typeof data.full_name !== 'string' || data.full_name.toLowerCase() !== `${repo[1]}/${repo[2]}`.toLowerCase()) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
  return evidenceHasNext(header, currentUrl, page, data.id as number);
}
