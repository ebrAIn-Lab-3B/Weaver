import { parseIssueUrl, type Notice, type PullEvidence } from '@ebrain-lab/weaver-markdown';
import { fetchEvidence, fetchIssue, type FetchFn, type IssueResult } from './issue';
import { errorNotice, NoticeError } from './errors';
import { evidenceNext } from './evidencePagination';

/** A failed or truncated collection must never be represented as an empty collection. */
export type Observation<T> = { status: 'read'; value: T } | { status: 'unavailable'; error: Notice };

export interface AttributedClaim {
  url: string;
  author: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewRecord {
  url: string;
  author: string | null;
  state: string;
  submittedAt: string | null;
  revision: string | null;
  body: string;
}

export interface CompletionEvidence {
  issueUrl: string;
  readAt: string;
  issue: IssueResult;
  pulls: Observation<PullEvidence[]>;
  comments: Observation<AttributedClaim[]>;
  /** Null when the pull inventory was unavailable, so an empty list cannot imply no reviews. */
  reviews: { pullUrl: string; revision?: string; observation: Observation<ReviewRecord[]> }[] | null;
}

type RawUser = { login?: unknown } | null;
function author(user: unknown): string | null | undefined {
  if (user === null) return null;
  if (typeof user !== 'object' || typeof (user as RawUser & { login?: unknown }).login !== 'string') return undefined;
  return (user as { login: string }).login;
}

/** Complete pages or an explicit unavailable result; an exact full last page needs another read. */
async function readPages<T>(token: string, url: string, fetchFn: FetchFn, parse: (value: unknown) => T | undefined): Promise<Observation<T[]>> {
  try {
    const values: T[] = [];
    for (let page = 1; page <= 50; page += 1) {
      const response = await fetchFn(`${url}${url.includes('?') ? '&' : '?'}per_page=100&page=${page}`, {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
      });
      if (!response.ok) throw new NoticeError({ code: 'github.err.http', args: { status: response.status } });
      const data: unknown = await response.json();
      if (!Array.isArray(data) || data.length > 100) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
      for (const entry of data) {
        const parsed = parse(entry);
        if (!parsed) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
        values.push(parsed);
      }
      // GitHub may advertise a next page even when a page is short. The next URL is
      // constructed locally, so a response header cannot redirect the token elsewhere.
      const link = response.headers?.get('link') ?? '';
      const next = await evidenceNext(link, url, page, token, fetchFn);
      if (data.length < 100 && !next) return { status: 'read', value: values };
    }
    throw new NoticeError({ code: 'github.err.evidence-incomplete' });
  } catch (error) {
    return { status: 'unavailable', error: errorNotice(error) };
  }
}

export interface PullInventoryItem {
  number: number;
  title: string;
  url: string;
  branch: string;
  body: string | null;
}

/** Complete all-state repository inventory, or an unavailable result without partial claims. */
export async function fetchPullInventory(token: string, repository: string, fetchFn: FetchFn = fetch): Promise<Observation<PullInventoryItem[]>> {
  const match = /^([\w.-]+)\/([\w.-]+)$/.exec(repository);
  if (!match) return { status: 'unavailable', error: { code: 'github.err.evidence-incomplete' } };
  return readPages(token, `https://api.github.com/repos/${match[1]}/${match[2]}/pulls?state=all`, fetchFn, (value) => {
    if (!value || typeof value !== 'object') return undefined;
    const pull = value as { number?: unknown; title?: unknown; html_url?: unknown; body?: unknown; head?: { ref?: unknown } };
    if (!Number.isSafeInteger(pull.number) || Number(pull.number) < 1 || typeof pull.title !== 'string' || typeof pull.html_url !== 'string' || (pull.body !== null && typeof pull.body !== 'string') || typeof pull.head?.ref !== 'string') return undefined;
    const url = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/([1-9]\d*)\/?$/i.exec(pull.html_url);
    if (!url || `${url[1]}/${url[2]}`.toLowerCase() !== repository.toLowerCase() || Number(url[3]) !== pull.number) return undefined;
    return { number: pull.number as number, title: pull.title, url: pull.html_url, branch: pull.head.ref, body: pull.body as string | null };
  });
}

function comment(value: unknown): AttributedClaim | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const login = author(v.user);
  if (login === undefined || typeof v.html_url !== 'string' || typeof v.body !== 'string' || typeof v.created_at !== 'string' || typeof v.updated_at !== 'string') return undefined;
  return { url: v.html_url, author: login, body: v.body, createdAt: v.created_at, updatedAt: v.updated_at };
}

function review(value: unknown): ReviewRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const login = author(v.user);
  if (login === undefined || typeof v.html_url !== 'string' || typeof v.state !== 'string' || (v.submitted_at !== null && typeof v.submitted_at !== 'string') || (v.commit_id !== null && typeof v.commit_id !== 'string') || (v.body !== null && typeof v.body !== 'string')) return undefined;
  return { url: v.html_url, author: login, state: v.state, submittedAt: v.submitted_at as string | null, revision: v.commit_id as string | null, body: (v.body as string | null) ?? '' };
}

/** Reviews are read independently of check and closing-reference availability. */
export async function fetchPullReviews(token: string, pullUrl: string, fetchFn: FetchFn = fetch): Promise<Observation<ReviewRecord[]>> {
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/([1-9]\d*)\/?$/i.exec(pullUrl);
  if (!match || !Number.isSafeInteger(Number(match[3]))) return { status: 'unavailable', error: { code: 'github.err.evidence-incomplete' } };
  return readPages(token, `https://api.github.com/repos/${match[1]}/${match[2]}/pulls/${match[3]}/reviews`, fetchFn, review);
}

/** Read independent sources separately; comments are attributed claims, not verified test results. */
export async function fetchCompletionEvidence(token: string, issueUrl: string, readAt: Date, fetchFn: FetchFn = fetch): Promise<CompletionEvidence> {
  const ref = parseIssueUrl(issueUrl);
  const invalid: Observation<never[]> = { status: 'unavailable', error: { code: 'github.err.not-issue-url' } };
  if (!ref) return { issueUrl, readAt: readAt.toISOString(), issue: { ok: false, error: { code: 'github.err.not-issue-url' } }, pulls: invalid, comments: invalid, reviews: null };
  const [issue, evidence, comments] = await Promise.all([
    fetchIssue(token, issueUrl, fetchFn),
    fetchEvidence(token, issueUrl, fetchFn),
    readPages(token, `https://api.github.com/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments`, fetchFn, comment),
  ]);
  const pulls: Observation<PullEvidence[]> = evidence.ok ? { status: 'read', value: evidence.evidence.pulls } : { status: 'unavailable', error: evidence.error };
  const reviews = evidence.ok ? await Promise.all(evidence.evidence.pulls.map(async (pull) => {
    const observation = await fetchPullReviews(token, pull.url, fetchFn);
    return { pullUrl: pull.url, ...(pull.revision ? { revision: pull.revision } : {}), observation };
  })) : null;
  return { issueUrl, readAt: readAt.toISOString(), issue, pulls, comments, reviews };
}
