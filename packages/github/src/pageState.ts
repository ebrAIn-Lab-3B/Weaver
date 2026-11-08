import type { PageChecksState, Notice, PageRef, PageState } from '@palab/weaver-markdown';
import type { FetchFn } from './issue';

const API = 'https://api.github.com';

export type PageStateResult = { ok: true; state: PageState } | { ok: false; error: Notice };

async function get(token: string, url: string, fetchFn: FetchFn): Promise<{ status: number; body: unknown }> {
  const response = await fetchFn(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

const isMapping = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The state of the checks of one commit, from its check runs: any still running is pending, any that went wrong is failing. */
export function summarizeChecks(runs: readonly { status?: string; conclusion?: string | null }[]): PageChecksState {
  if (runs.length === 0) return 'none';
  if (runs.some((run) => run.status !== 'completed')) return 'pending';
  const bad = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure']);
  return runs.some((run) => run.conclusion && bad.has(run.conclusion)) ? 'failing' : 'passing';
}

/**
 * Reads the state of a pull request (open, merged, or closed, and for an open one the state of its
 * checks) or of an Issue (open or closed). It only reads; it needs the `repo` scope for a private
 * repository. A failure comes back as a notice and never stops anything else.
 */
export async function fetchPageState(token: string, ref: PageRef, fetchFn: FetchFn = fetch): Promise<PageStateResult> {
  const base = `${API}/repos/${ref.repository}`;
  try {
    if (ref.kind === 'issue') {
      const issue = await get(token, `${base}/issues/${ref.number}`, fetchFn);
      if (issue.status === 401) return { ok: false, error: { code: 'github.err.unauthorized' } };
      if (issue.status < 200 || issue.status >= 300 || !isMapping(issue.body)) return { ok: false, error: { code: 'github.err.http', args: { status: issue.status } } };
      return { ok: true, state: { state: issue.body.state === 'closed' ? 'closed' : 'open' } };
    }
    const pull = await get(token, `${base}/pulls/${ref.number}`, fetchFn);
    if (pull.status === 401) return { ok: false, error: { code: 'github.err.unauthorized' } };
    if (pull.status < 200 || pull.status >= 300 || !isMapping(pull.body)) return { ok: false, error: { code: 'github.err.http', args: { status: pull.status } } };
    if (pull.body.merged === true || typeof pull.body.merged_at === 'string') return { ok: true, state: { state: 'merged' } };
    if (pull.body.state === 'closed') return { ok: true, state: { state: 'closed' } };
    const sha = isMapping(pull.body.head) && typeof pull.body.head.sha === 'string' ? pull.body.head.sha : undefined;
    if (!sha) return { ok: true, state: { state: 'open' } };
    const runs = await get(token, `${base}/commits/${sha}/check-runs?per_page=100`, fetchFn);
    // The checks are a detail: when they cannot be read, the state of the pull request is still true.
    if (runs.status < 200 || runs.status >= 300 || !isMapping(runs.body) || !Array.isArray(runs.body.check_runs)) return { ok: true, state: { state: 'open' } };
    return { ok: true, state: { state: 'open', checks: summarizeChecks(runs.body.check_runs as { status?: string; conclusion?: string | null }[]) } };
  } catch (error) {
    return { ok: false, error: { code: 'github.err.network', args: { detail: (error as Error).message } } };
  }
}
