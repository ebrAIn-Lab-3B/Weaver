import { NoticeError } from './errors';

/** Validate advertised next pages before constructing a same-scope request. */
export function evidenceHasNext(header: string | null | undefined, currentUrl: string, page: number): boolean {
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
  if (target.origin !== current.origin || target.pathname !== current.pathname || target.searchParams.get('per_page') !== '100' || target.searchParams.get('page') !== String(page + 1) || [...target.searchParams.keys()].some((key) => key !== 'per_page' && key !== 'page') || target.searchParams.getAll('page').length !== 1 || target.searchParams.getAll('per_page').length !== 1 || target.hash || target.username || target.password) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
  return true;
}
