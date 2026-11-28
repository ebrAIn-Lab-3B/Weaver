import { NoticeError, errorNotice } from './errors';
import { evidenceNext } from './evidencePagination';
import { mapLimit } from './processes';
import {
  BoardItem,
  CheckRunLike,
  IssueSnapshot,
  MovePlan,
  Notice,
  parseIssueUrl,
  PullEvidence,
  summarizeChecks,
  TaskEvidence,
} from '@ebrain-lab/weaver-markdown';

/** The global `fetch`, or a replacement for a test. */
export type FetchFn = typeof fetch;
/** Bound concurrent PR observations; each observation can issue several source reads. */
export const EVIDENCE_READ_LIMIT = 4;

interface Ctx {
  token: string;
  fetchFn: FetchFn;
}

export type IssueResult = { ok: true; issue: IssueSnapshot } | { ok: false; error: Notice };

const raw = (detail: string): Notice => ({ code: 'github.err.raw', args: { detail } });

export async function fetchIssue(token: string, issueUrl: string, fetchFn: FetchFn = fetch): Promise<IssueResult> {
  const ref = parseIssueUrl(issueUrl);
  if (!ref) return { ok: false, error: { code: 'github.err.not-issue-url' } };

  try {
    const response = await fetchFn(`https://api.github.com/repos/${ref.owner}/${ref.repo}/issues/${ref.number}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) {
      return {
        ok: false,
        error: response.status === 404 ? { code: 'github.err.not-found' } : { code: 'github.err.http', args: { status: response.status } },
      };
    }
    const data = (await response.json()) as {
      number: number;
      title: string;
      html_url: string;
      state: string;
      labels: ({ name?: string } | string)[];
      assignees?: { login: string }[];
    };
    if (!data || !Number.isSafeInteger(data.number) || data.number < 1 || typeof data.title !== 'string' || typeof data.html_url !== 'string' || (data.state !== 'open' && data.state !== 'closed') || !Array.isArray(data.labels) || data.labels.some((label) => typeof label === 'string' ? !label : !label || typeof label.name !== 'string' || !label.name) || (data.assignees !== undefined && (!Array.isArray(data.assignees) || data.assignees.some((assignee) => !assignee || typeof assignee.login !== 'string' || !assignee.login)))) {
      return { ok: false, error: { code: 'github.err.issue-incomplete' } };
    }
    return {
      ok: true,
      issue: {
        number: data.number,
        title: data.title,
        url: data.html_url,
        state: data.state,
        labels: data.labels.map((label) => (typeof label === 'string' ? label : label.name ?? '')).filter(Boolean),
        assignees: (data.assignees ?? []).map((a) => a.login),
      },
    };
  } catch (error) {
    return { ok: false, error: { code: 'github.err.network', args: { detail: (error as Error).message } } };
  }
}

export interface MoveStep {
  name: Notice;
  ok: boolean;
  detail?: Notice;
  /** The step had nothing to do, for example an Issue that is not on a board. */
  skipped?: boolean;
}

const API = 'https://api.github.com';

async function rest({ token, fetchFn }: Ctx, method: string, path: string, body?: unknown): Promise<Response> {
  return fetchFn(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function graphql<T>({ token, fetchFn }: Ctx, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetchFn(`${API}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (!response.ok || json.errors?.length) {
    throw new NoticeError(json.errors?.length ? { code: 'github.err.raw', args: { detail: json.errors.map((e) => e.message).join('; ') } } : { code: 'github.err.http', args: { status: response.status } });
  }
  return json.data as T;
}

const PROJECT_ITEMS = `query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){issue(number:$n){projectItems(first:10){nodes{id project{id title field(name:"Status"){... on ProjectV2SingleSelectField{id options{id name}}}}}}}}}`;
const SET_STATUS = `mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){projectV2Item{id}}}`;

/**
 * Applies a move plan to GitHub: labels, Issue state, then the board Status.
 * Stops at the first failure and reports the steps that ran. Callers must have
 * confirmed the plan with the user first.
 */
export async function applyMove(token: string, issueUrl: string, plan: MovePlan, fetchFn: FetchFn = fetch): Promise<MoveStep[]> {
  const ctx: Ctx = { token, fetchFn };
  const ref = parseIssueUrl(issueUrl);
  const steps: MoveStep[] = [];
  if (!ref) return [{ name: { code: 'step.parse-url' }, ok: false, detail: { code: 'github.err.not-issue-url' } }];
  const base = `/repos/${ref.owner}/${ref.repo}/issues/${ref.number}`;

  const run = async (name: Notice, action: () => Promise<Notice | undefined>): Promise<boolean> => {
    try {
      const detail = await action();
      steps.push({ name, ok: true, ...(detail ? { detail, skipped: detail.code === 'step.skipped-no-board' } : {}) });
      return true;
    } catch (error) {
      steps.push({ name, ok: false, detail: errorNotice(error) });
      return false;
    }
  };
  const expectOk = async (response: Response): Promise<void> => {
    if (!response.ok) throw new NoticeError({ code: 'github.err.http', args: { status: response.status } });
  };

  for (const label of plan.removeLabels) {
    const ok = await run({ code: 'step.remove-label', args: { label } }, async () => {
      const response = await rest(ctx, 'DELETE', `${base}/labels/${encodeURIComponent(label)}`);
      if (response.status !== 404) await expectOk(response);
      return undefined;
    });
    if (!ok) return steps;
  }
  const addLabel = plan.addLabel;
  if (addLabel) {
    const labeled = await run({ code: 'step.add-label', args: { label: addLabel } }, async () => {
      await expectOk(await rest(ctx, 'POST', `${base}/labels`, { labels: [addLabel] }));
      return undefined;
    });
    if (!labeled) return steps;
  }
  if (
    !(await run({ code: plan.state === 'closed' ? 'step.close-issue' : 'step.reopen-issue' }, async () => {
      const body = plan.state === 'closed' ? { state: 'closed', state_reason: 'completed' } : { state: 'open' };
      await expectOk(await rest(ctx, 'PATCH', base, body));
      return undefined;
    }))
  ) {
    return steps;
  }

  const status = plan.projectStatus;
  if (status) await run({ code: 'step.set-board-status', args: { status } }, () => setBoardStatus(token, issueUrl, status, fetchFn));
  return steps;
}

/**
 * Sets the `Status` of the Issue on every Project board it is on. An Issue that is on no board has
 * nothing to set (`step.skipped-no-board`). A board with no such option throws a notice error.
 * Callers must have confirmed the change with the user first.
 */
export async function setBoardStatus(token: string, issueUrl: string, status: string, fetchFn: FetchFn = fetch): Promise<Notice | undefined> {
  const ref = parseIssueUrl(issueUrl);
  if (!ref) throw new NoticeError({ code: 'github.err.not-issue-url' });
  const ctx: Ctx = { token, fetchFn };
  type Items = {
    repository: {
      issue: {
        projectItems: {
          nodes: { id: string; project: { id: string; title: string; field: { id: string; options: { id: string; name: string }[] } | null } }[];
        };
      };
    };
  };
  const data = await graphql<Items>(ctx, PROJECT_ITEMS, { o: ref.owner, r: ref.repo, n: ref.number });
  const items = data.repository.issue.projectItems.nodes;
  if (items.length === 0) return { code: 'step.skipped-no-board' };
  const updated: string[] = [];
  for (const item of items) {
    const field = item.project.field;
    const option = field?.options.find((o) => o.name === status);
    if (!field || !option) throw new NoticeError({ code: 'step.no-status-option', args: { board: item.project.title, status } });
    await graphql(ctx, SET_STATUS, { p: item.project.id, i: item.id, f: field.id, o: option.id });
    updated.push(item.project.title);
  }
  return { code: 'step.updated-boards', args: { boards: updated } };
}

/** True when an Issue already has a comment that contains `marker`, so a note is not written twice. */
export async function hasIssueComment(token: string, repository: string, number: number, marker: string, fetchFn: FetchFn = fetch): Promise<boolean> {
  const response = await rest({ token, fetchFn }, 'GET', `/repos/${repository}/issues/${number}/comments?per_page=100`);
  if (!response.ok) throw new NoticeError({ code: 'github.err.http', args: { status: response.status } });
  const comments = (await response.json()) as { body?: string }[];
  return comments.some((comment) => (comment.body ?? '').includes(marker));
}

const BOARD_ITEMS = `query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){issue(number:$n){projectItems(first:10){nodes{project{title} fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}`;

/**
 * The Issue's Status on each project board. Best effort: reading a board needs
 * the project scope, so a failure means "unknown" and no mismatch is reported.
 */
export async function fetchBoardItems(token: string, issueUrl: string, fetchFn: FetchFn = fetch): Promise<BoardItem[] | undefined> {
  const ctx: Ctx = { token, fetchFn };
  const ref = parseIssueUrl(issueUrl);
  if (!ref) return undefined;
  try {
    type Nodes = {
      repository: { issue: { projectItems: { nodes: { project: { title: string }; fieldValueByName: { name?: string } | null }[] } } };
    };
    const data = await graphql<Nodes>(ctx, BOARD_ITEMS, { o: ref.owner, r: ref.repo, n: ref.number });
    return data.repository.issue.projectItems.nodes.flatMap((node) =>
      node.fieldValueByName?.name ? [{ project: node.project.title, status: node.fieldValueByName.name }] : [],
    );
  } catch {
    return undefined;
  }
}

export type EvidenceResult = { ok: true; evidence: TaskEvidence } | { ok: false; error: Notice };

async function getJson<T>({ token, fetchFn }: Ctx, url: string): Promise<T> {
  const response = await fetchFn(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new NoticeError({ code: 'github.err.http', args: { status: response.status } });
  return (await response.json()) as T;
}

interface TimelineEvent {
  event: string;
  source?: {
    issue?: {
      number: number;
      title: string;
      html_url: string;
      repository_url: string;
      pull_request?: object;
    };
  };
}

const CLOSING_REFERENCES = `query($o:String!,$r:String!,$n:Int!,$after:String){repository(owner:$o,name:$r){pullRequest(number:$n){closingIssuesReferences(first:100,after:$after){nodes{number repository{nameWithOwner}} pageInfo{hasNextPage endCursor}}}}}`;
type ClosingReferences = { nodes?: { number: number; repository: { nameWithOwner: string } }[]; pageInfo?: { hasNextPage: boolean; endCursor: string | null } };
type ClosingReply = { repository?: { pullRequest?: { closingIssuesReferences?: ClosingReferences } } };

/** A textual hint is qualified to the PR repository, but still never proves an association. */
function claimsClosing(text: string, pullRepositoryUrl: string, issue: { owner: string; repo: string; number: number }): boolean {
  const pullRepository = /^https:\/\/api\.github\.com\/repos\/([\w.-]+\/[\w.-]+)$/.exec(pullRepositoryUrl);
  if (!pullRepository) return false;
  const wanted = `${issue.owner}/${issue.repo}`.toLowerCase();
  const pattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:([\w.-]+\/[\w.-]+))?#(\d+)\b/gi;
  return [...text.matchAll(pattern)].some((match) => Number(match[2]) === issue.number && (match[1] ?? pullRepository[1]).toLowerCase() === wanted);
}

/** Read the repository-qualified relationship GitHub records, without inferring it from PR text. */
async function closingAssociation(ctx: Ctx, repositoryUrl: string, pull: number, issue: { owner: string; repo: string; number: number }): Promise<PullEvidence['link']> {
  const repo = /^https:\/\/api\.github\.com\/repos\/([\w.-]+)\/([\w.-]+)$/.exec(repositoryUrl);
  if (!repo) return 'unknown';
  try {
    let after: string | null = null;
    const seen = new Set<string>();
    for (let page = 0; page < 50; page += 1) {
      const data: ClosingReply = await graphql<ClosingReply>(ctx, CLOSING_REFERENCES, { o: repo[1], r: repo[2], n: pull, after });
      const refs: ClosingReferences | undefined = data?.repository?.pullRequest?.closingIssuesReferences;
      if (!refs || !Array.isArray(refs.nodes) || !refs.pageInfo || typeof refs.pageInfo.hasNextPage !== 'boolean' || refs.nodes.some((node) => !node || !Number.isSafeInteger(node.number) || typeof node.repository?.nameWithOwner !== 'string')) return 'unknown';
      if (refs.nodes.some((node) => node.number === issue.number && node.repository.nameWithOwner.toLowerCase() === `${issue.owner}/${issue.repo}`.toLowerCase())) return 'closes';
      if (!refs.pageInfo.hasNextPage) return 'mentions';
      const cursor: string | null = refs.pageInfo.endCursor;
      if (!cursor || seen.has(cursor)) return 'unknown';
      seen.add(cursor);
      after = cursor;
    }
  } catch {
    // A failed or inaccessible relationship is unknown, not a missing relationship.
  }
  return 'unknown';
}

async function readPullEvidence(ctx: Ctx, source: { number: number; title: string; html_url: string; repository_url: string }, ref: { owner: string; repo: string; number: number }): Promise<PullEvidence> {
  const pr = await getJson<{ state: string; merged_at: string | null; body: string | null; head: { sha: string } }>(ctx, `${source.repository_url}/pulls/${source.number}`);
  if (!pr || !['open', 'closed'].includes(pr.state) || (pr.merged_at !== null && typeof pr.merged_at !== 'string') || typeof pr.head?.sha !== 'string' || !pr.head.sha) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
  let checks: PullEvidence['checks'] = 'unknown';
  let checksError: Notice | undefined;
  try {
    const runs = await getJson<{ total_count?: number; check_runs: CheckRunLike[] }>(ctx, `${source.repository_url}/commits/${pr.head.sha}/check-runs?per_page=100`);
    if (!runs || !Number.isSafeInteger(runs.total_count) || !Array.isArray(runs.check_runs) || runs.total_count !== runs.check_runs.length || runs.check_runs.some((run) => !run || typeof run.status !== 'string' || (run.conclusion !== null && typeof run.conclusion !== 'string'))) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
    checks = summarizeChecks(runs.check_runs);
  } catch (error) { checksError = errorNotice(error); }
  const statusUrl = `${source.repository_url}/commits/${pr.head.sha}/status?per_page=100`;
  let statusContexts: NonNullable<PullEvidence['statusContexts']> = { state: 'unknown', apiUrl: statusUrl };
  try {
    const status = await getJson<{ state?: unknown; total_count?: unknown; statuses?: unknown }>(ctx, statusUrl);
    if (Number.isSafeInteger(status?.total_count) && Number(status.total_count) >= 0 && Array.isArray(status.statuses) && status.statuses.length === status.total_count && ['success', 'failure', 'error', 'pending'].includes(String(status.state))) {
      statusContexts = { state: status.total_count === 0 ? 'none' : status.state as 'success' | 'failure' | 'error' | 'pending', count: status.total_count as number, apiUrl: statusUrl };
    }
  } catch { /* An unavailable status API is not an absent or successful status. */ }
  return {
    number: source.number, title: source.title, url: source.html_url,
    state: pr.merged_at ? 'merged' : pr.state === 'open' ? 'open' : 'closed',
    checks,
    ...(checksError ? { checksError } : {}),
    link: await closingAssociation(ctx, source.repository_url, source.number, ref),
    textClaimsClosing: claimsClosing(`${source.title}\n${pr.body ?? ''}`, source.repository_url, ref),
    revision: pr.head.sha,
    statusContexts,
  };
}

/** Inspect a candidate PR without claiming the Issue timeline references it. */
export async function fetchCandidatePullEvidence(token: string, issueUrl: string, candidate: { url: string; title: string }, fetchFn: FetchFn = fetch): Promise<{ ok: true; pull: PullEvidence } | { ok: false; error: Notice }> {
  const issue = parseIssueUrl(issueUrl);
  const pull = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/([1-9]\d*)\/?$/i.exec(candidate.url);
  if (!issue || !pull || !Number.isSafeInteger(Number(pull[3]))) return { ok: false, error: { code: 'github.err.evidence-incomplete' } };
  try {
    return { ok: true, pull: await readPullEvidence({ token, fetchFn }, { number: Number(pull[3]), title: candidate.title, html_url: candidate.url, repository_url: `${API}/repos/${pull[1]}/${pull[2]}` }, issue) };
  } catch (error) { return { ok: false, error: errorNotice(error) }; }
}

/**
 * Finds pull requests that reference the Issue (timeline cross-references),
 * then reads each one's merge state and check runs. A reference is a link,
 * not proof the PR implements the task; the view says so.
 */
export async function fetchEvidence(token: string, issueUrl: string, fetchFn: FetchFn = fetch): Promise<EvidenceResult> {
  const ctx: Ctx = { token, fetchFn };
  const ref = parseIssueUrl(issueUrl);
  if (!ref) return { ok: false, error: { code: 'github.err.not-issue-url' } };

  try {
    const events: TimelineEvent[] = [];
    for (let page = 1; page <= 3; page += 1) {
      const timelineUrl = `${API}/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/timeline`;
      const response = await fetchFn(`${timelineUrl}?per_page=100&page=${page}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' } });
      if (!response.ok) throw new NoticeError({ code: 'github.err.http', args: { status: response.status } });
      const batch: unknown = await response.json();
      if (!Array.isArray(batch) || batch.length > 100 || batch.some((event) => !event || typeof event !== 'object' || typeof event.event !== 'string')) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
      const next = await evidenceNext(response.headers?.get('link'), timelineUrl, page, token, fetchFn);
      events.push(...batch);
      if (batch.length < 100 && !next) break;
      if (page === 3) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
    }

    const sources = new Map<string, NonNullable<NonNullable<TimelineEvent['source']>['issue']>>();
    for (const event of events) {
      const source = event.source?.issue;
      if (event.event !== 'cross-referenced') continue;
      if (!source || !Number.isSafeInteger(source.number) || source.number < 1 || typeof source.title !== 'string' || typeof source.html_url !== 'string' || typeof source.repository_url !== 'string') throw new NoticeError({ code: 'github.err.evidence-incomplete' });
      if (!source.pull_request) continue;
      const repository = /^https:\/\/api\.github\.com\/repos\/([\w.-]+)\/([\w.-]+)$/.exec(source.repository_url);
      const pull = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)\/?$/i.exec(source.html_url);
      if (!repository || !pull || repository[1].toLowerCase() !== pull[1].toLowerCase() || repository[2].toLowerCase() !== pull[2].toLowerCase() || Number(pull[3]) !== source.number) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
      sources.set(source.html_url, source);
    }

    const pulls = await mapLimit([...sources.values()], EVIDENCE_READ_LIMIT, (source) => readPullEvidence(ctx, source, ref));
    return { ok: true, evidence: { pulls: pulls.sort((a, b) => a.number - b.number) } };
  } catch (error) {
    return { ok: false, error: errorNotice(error) };
  }
}

/** A pull request as the steward needs it: whether it was merged, and how to name it. */
export interface PullInfo {
  number: number;
  title: string;
  url: string;
  merged: boolean;
}

/** Reads one pull request. A failure throws an Error that says what GitHub answered. */
export async function fetchPull(token: string, repository: string, number: number, fetchFn: FetchFn = fetch): Promise<PullInfo> {
  const response = await fetchFn(`${API}/repos/${repository}/pulls/${number}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (response.status === 404) throw new NoticeError({ code: 'github.err.pull-not-found', args: { number, repository } });
  if (!response.ok) throw new NoticeError({ code: 'github.err.http', args: { status: response.status } });
  const data = (await response.json()) as { number: number; title: string; html_url: string; merged_at: string | null };
  return { number: data.number, title: data.title, url: data.html_url, merged: Boolean(data.merged_at) };
}

/** Adds a comment to an Issue. A failure throws an Error that says what GitHub answered. */
export async function addIssueComment(token: string, repository: string, number: number, body: string, fetchFn: FetchFn = fetch): Promise<void> {
  const response = await rest({ token, fetchFn }, 'POST', `/repos/${repository}/issues/${number}/comments`, { body });
  if (!response.ok) throw new NoticeError({ code: 'github.err.http', args: { status: response.status } });
}

/**
 * Sets the assignees of an Issue to exactly `assignees`. GitHub quietly drops a login that cannot be
 * assigned (not a collaborator, for one), so the answer is checked and a missing login is an error.
 */
export async function setIssueAssignees(token: string, repository: string, number: number, assignees: readonly string[], fetchFn: FetchFn = fetch): Promise<void> {
  const response = await rest({ token, fetchFn }, 'PATCH', `/repos/${repository}/issues/${number}`, { assignees });
  if (!response.ok) throw new NoticeError({ code: 'github.err.http', args: { status: response.status } });
  const data = (await response.json()) as { assignees?: { login: string }[] };
  const now = new Set((data.assignees ?? []).map((a) => a.login.toLowerCase()));
  const missing = assignees.find((login) => !now.has(login.toLowerCase()));
  if (missing) throw new NoticeError({ code: 'github.err.cannot-assign', args: { login: missing } });
}

/** The text of an Issue's body, or undefined when it cannot be read. */
export async function fetchIssueBody(token: string, repository: string, number: number, fetchFn: FetchFn = fetch): Promise<string | undefined> {
  const response = await rest({ token, fetchFn }, 'GET', `/repos/${repository}/issues/${number}`);
  if (!response.ok) return undefined;
  const data = (await response.json()) as { body?: string | null };
  return data.body ?? '';
}
