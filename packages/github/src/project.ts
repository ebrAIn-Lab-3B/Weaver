import { mergeCardPulls, parseIssueUrl, placeIssue, type CardPull, type ColumnRules, type KanbanPlacement, type Notice, type RawPull } from '@ebrain-lab/weaver-markdown';

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  headers?: { get(name: string): string | null };
}>;

/** One Issue on the central Project, reduced to what the Overview Kanban shows. */
export interface ProjectCard {
  /** `owner/name`, as GitHub spells it. */
  repository: string;
  /** Item identity within the selected Project. */
  projectItemId?: string;
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed';
  labels: string[];
  assignees: string[];
  /** The board `Status` field, when the item has one. */
  boardStatus?: string;
  boardStatusRead?: boolean;
  /** The values of the extra Project fields that were asked for (a task contract's `project-field`); a field with no value is left out. */
  fields?: Record<string, string>;
  /** Whether each requested field value was returned, including an explicitly unset value. */
  fieldsRead?: Record<string, boolean>;
  /** When the Issue last changed, as an ISO date. */
  updatedAt?: string;
  /** Pull requests that close or mention the Issue. */
  pullCount?: number;
  /** PR/timeline connections are missing or do not include every record. */
  pullsIncomplete?: boolean;
  /** The pull requests that refer to the Issue, open first, at most three (DEC-022). Left out when GitHub gave none. */
  pulls?: CardPull[];
  /** `TASK-###` when the Issue title starts with `[TASK-###]`. */
  taskId?: string;
  placement: KanbanPlacement;
}

export interface ProjectRead {
  title: string;
  /** Exact options from the selected Project, absent if not returned. */
  statusOptions?: string[];
  /** False if any Project item content was inaccessible or null. */
  membershipComplete?: boolean;
  cards: ProjectCard[];
  /** Items left out: pull requests, drafts, and Issues of repositories that were not asked for. */
  skipped: number;
}

export type ProjectResult = { ok: true; read: ProjectRead } | { ok: false; error: Notice };

const API = 'https://api.github.com/graphql';
const PAGE = 100;
const MAX_PAGES = 50;

const buildQuery = (fields: readonly string[]): string =>
  `query($o:String!,$n:Int!,$c:String){repositoryOwner(login:$o){... on ProjectV2Owner{projectV2(number:$n){title field(name:"Status"){... on ProjectV2SingleSelectField{options{name}}} items(first:${PAGE},after:$c){pageInfo{hasNextPage endCursor} nodes{id fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}} ${fields
    .map((name, i) => `f${i}:fieldValueByName(name:${JSON.stringify(name)}){... on ProjectV2ItemFieldSingleSelectValue{name} ... on ProjectV2ItemFieldTextValue{text}}`)
    .join(' ')} content{__typename ... on Issue{number title url state updatedAt closedByPullRequestsReferences(last:3,includeClosedPrs:true){totalCount nodes{number url title state}} timelineItems(last:3,itemTypes:[CROSS_REFERENCED_EVENT]){totalCount nodes{... on CrossReferencedEvent{source{... on PullRequest{number url title state}}}}} repository{nameWithOwner} labels(first:100){pageInfo{hasNextPage} nodes{name}} assignees(first:10){pageInfo{hasNextPage} nodes{login}}}}}}}}}}`;

interface ItemNode {
  id?: string;
  fieldValueByName?: { name?: string } | null;
  /** The extra fields asked for, as `f0`, `f1`, and so on, in the order they were asked. */
  [alias: `f${number}`]: { name?: string; text?: string } | null | undefined;
  content: null | {
    __typename: string;
    number?: number;
    title?: string;
    url?: string;
    state?: string;
    updatedAt?: string;
    closedByPullRequestsReferences?: { totalCount: number; nodes?: (RawPull | null)[] };
    timelineItems?: { totalCount: number; nodes?: ({ source?: RawPull | null } | null)[] };
    repository?: { nameWithOwner: string };
    labels?: { nodes: { name: string }[]; pageInfo?: { hasNextPage: boolean } };
    assignees?: { nodes: { login: string }[]; pageInfo?: { hasNextPage: boolean } };
  };
}

interface Page {
  repositoryOwner: null | {
    projectV2?: null | {
      title: string;
      field?: { options?: { name: string }[] } | null;
      items: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ItemNode[] };
    };
  };
}

const TASK_TITLE = /^\[(TASK-\d{3,})\]/;

/**
 * Places the cards again with the rules of each repository's process (DEC-015). A repository with
 * no rules keeps the placement it has, which is the default. The cards are not changed; new ones come back.
 */
export function placeWithRules(cards: readonly ProjectCard[], rulesFor: (repository: string) => ColumnRules | undefined): ProjectCard[] {
  return cards.map((card) => {
    const rules = rulesFor(card.repository);
    return rules ? { ...card, placement: placeIssue(card, rules) } : card;
  });
}

/**
 * Reads every item of a Project, page by page, and turns the Issues of the
 * registered repositories into cards. Failures come back as notices, never as
 * exceptions, so the caller can show the reason and fall back to files.
 *
 * `fetchImpl` defaults to the global `fetch`; tests and other hosts may pass their own.
 */
export async function readProject(
  token: string,
  project: { owner: string; number: number },
  /** The repositories to read; left out, every repository that has Issues on the Project is read. */
  repositories: readonly string[] | undefined,
  fetchImpl: Fetch = fetch as unknown as Fetch,
  /** Project fields to read besides `Status`, so a task contract's `project-field` can be compared (DEC-016). */
  extraFields: readonly string[] = [],
): Promise<ProjectResult> {
  const registered = repositories ? new Set(repositories.map((name) => name.toLowerCase())) : undefined;
  const cards: ProjectCard[] = [];
  let skipped = 0;
  let membershipComplete = true;
  let title = '';
  let statusOptions: string[] | undefined;
  let cursor: string | null = null;
  const seenCursors = new Set<string>();
  const query = buildQuery(extraFields);

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let response;
    try {
      response = await fetchImpl(API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { o: project.owner, n: project.number, c: cursor } }),
      });
    } catch {
      return { ok: false, error: { code: 'project.unreachable' } };
    }

    if (response.status === 401) return { ok: false, error: { code: 'project.unauthorized' } };
    let body: { data?: Page; errors?: { type?: string; message: string }[] };
    try {
      body = (await response.json()) as typeof body;
    } catch {
      return { ok: false, error: { code: 'project.unreachable' } };
    }
    if (!body || typeof body !== 'object' || (body.errors !== undefined && (!Array.isArray(body.errors) || body.errors.some((error) => !error || typeof error.message !== 'string')))) return { ok: false, error: { code: 'project.unreachable' } };
    const failure = describeFailure(response, body, project);
    if (failure) return { ok: false, error: failure };

    const found = body.data?.repositoryOwner?.projectV2;
    if (!found) return { ok: false, error: { code: 'project.not-found', args: { owner: project.owner, number: project.number } } };
    if (!found.items || !Array.isArray(found.items.nodes) || typeof found.items.pageInfo?.hasNextPage !== 'boolean') return { ok: false, error: { code: 'project.pagination-incomplete' } };
    if (typeof found.title !== 'string' || (found.field?.options !== undefined && (!Array.isArray(found.field.options) || found.field.options.some((option) => !option || typeof option.name !== 'string' || !option.name)))) return { ok: false, error: { code: 'project.pagination-incomplete' } };
    const pageOptions = found.field?.options?.map((option) => option.name);
    if (page > 0 && (title !== found.title || JSON.stringify(statusOptions ?? null) !== JSON.stringify(pageOptions ?? null))) return { ok: false, error: { code: 'project.changed-during-read' } };
    title = found.title;
    statusOptions = pageOptions;

    for (const node of found.items.nodes) {
      if (!node || typeof node !== 'object') return { ok: false, error: { code: 'project.pagination-incomplete' } };
      const issue = node.content;
      const issueRef = typeof issue?.url === 'string' ? parseIssueUrl(issue.url) : undefined;
      const invalidIssue = issue?.__typename === 'Issue' && (typeof issue.repository?.nameWithOwner !== 'string' || !issue.repository.nameWithOwner || !issueRef || `${issueRef.owner}/${issueRef.repo}`.toLowerCase() !== issue.repository.nameWithOwner.toLowerCase() || issueRef.number !== issue.number || !Number.isSafeInteger(issue.number) || (issue.number as number) < 1 || typeof issue.title !== 'string' || !issue.title || (issue.state !== 'OPEN' && issue.state !== 'CLOSED'));
      const invalidContent = !issue || typeof issue !== 'object' || !['Issue', 'PullRequest', 'DraftIssue'].includes(issue.__typename);
      if (invalidContent || invalidIssue) membershipComplete = false;
      const repository = issue?.repository?.nameWithOwner;
      if (issue?.__typename !== 'Issue' || invalidIssue || !repository || (registered && !registered.has(repository.toLowerCase()))) {
        skipped += 1;
        continue;
      }
      if (!issue.labels || !Array.isArray(issue.labels.nodes) || issue.labels.pageInfo?.hasNextPage !== false || issue.labels.nodes.some((label) => !label || typeof label.name !== 'string' || !label.name)) return { ok: false, error: { code: 'project.labels-incomplete', args: { repository, number: issue.number ?? 0 } } };
      if (!issue.assignees || issue.assignees.pageInfo?.hasNextPage !== false || !Array.isArray(issue.assignees.nodes) || issue.assignees.nodes.some((assignee) => !assignee || typeof assignee.login !== 'string' || !assignee.login)) return { ok: false, error: { code: 'project.pagination-incomplete' } };
      const state = issue.state === 'CLOSED' ? 'closed' : 'open';
      const labels = (issue.labels?.nodes ?? []).map((label) => label.name);
      const taskId = TASK_TITLE.exec(issue.title ?? '')?.[1];
      const fields: Record<string, string> = {};
      const fieldsRead: Record<string, boolean> = {};
      extraFields.forEach((name, i) => {
        const value = node[`f${i}`];
        const text = value?.name ?? value?.text;
        fieldsRead[name] = value === null || typeof text === 'string';
        if (typeof text === 'string') fields[name] = text;
      });
      const pulls = mergeCardPulls(
        (Array.isArray(issue.closedByPullRequestsReferences?.nodes) ? issue.closedByPullRequestsReferences.nodes : []).filter((n): n is RawPull => n !== null),
        (Array.isArray(issue.timelineItems?.nodes) ? issue.timelineItems.nodes : []).map((n) => n?.source).filter((n): n is RawPull => n !== null && n !== undefined),
      );
      cards.push({
        repository,
        ...(node.id ? { projectItemId: node.id } : {}),
        number: issue.number as number,
        title: issue.title ?? '',
        url: issue.url ?? '',
        state,
        labels,
        assignees: issue.assignees.nodes.map((a) => a.login),
        boardStatusRead: statusOptions !== undefined && (node.fieldValueByName === null || (typeof node.fieldValueByName?.name === 'string' && node.fieldValueByName.name.length > 0)),
        ...(node.fieldValueByName?.name ? { boardStatus: node.fieldValueByName.name } : {}),
        ...(extraFields.length > 0 ? { fields, fieldsRead } : {}),
        ...(taskId ? { taskId } : {}),
        ...(issue.updatedAt ? { updatedAt: issue.updatedAt } : {}),
        ...(issue.closedByPullRequestsReferences && issue.timelineItems &&
          Number.isInteger(issue.closedByPullRequestsReferences.totalCount) && Number.isInteger(issue.timelineItems.totalCount)
          ? { pullCount: issue.closedByPullRequestsReferences.totalCount + issue.timelineItems.totalCount }
          : {}),
        ...(!issue.closedByPullRequestsReferences || !issue.timelineItems ||
          !Array.isArray(issue.closedByPullRequestsReferences.nodes) || !Array.isArray(issue.timelineItems.nodes) ||
          !Number.isInteger(issue.closedByPullRequestsReferences.totalCount) || !Number.isInteger(issue.timelineItems.totalCount) ||
          issue.closedByPullRequestsReferences.totalCount > issue.closedByPullRequestsReferences.nodes.length ||
          issue.timelineItems.totalCount > issue.timelineItems.nodes.length ? { pullsIncomplete: true } : {}),
        ...(pulls.length > 0 ? { pulls } : {}),
        placement: placeIssue({ state, labels, ...(node.fieldValueByName?.name ? { boardStatus: node.fieldValueByName.name } : {}) }),
      });
    }

    if (!found.items.pageInfo.hasNextPage) return { ok: true, read: { title, cards, skipped, membershipComplete, ...(statusOptions ? { statusOptions } : {}) } };
    const nextCursor = found.items.pageInfo.endCursor;
    if (!nextCursor || seenCursors.has(nextCursor)) return { ok: false, error: { code: 'project.pagination-incomplete' } };
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  return { ok: false, error: { code: 'project.too-large', args: { pages: MAX_PAGES } } };
}

function describeFailure(
  response: { ok: boolean; status: number },
  body: { data?: Page; errors?: { type?: string; message: string }[] },
  project: { owner: string; number: number },
): Notice | undefined {
  const errors = body.errors ?? [];
  if (errors.some((e) => e.type === 'NOT_FOUND')) {
    return { code: 'project.not-found', args: { owner: project.owner, number: project.number } };
  }
  if (errors.some((e) => e.type === 'INSUFFICIENT_SCOPES' || /scope/i.test(e.message))) {
    return { code: 'project.missing-scope' };
  }
  if (errors.some((e) => e.type === 'RATE_LIMITED')) return { code: 'project.rate-limited' };
  if (response.status === 403) return { code: 'project.forbidden' };
  if (!response.ok || errors.length) return { code: 'project.unreachable' };
  return undefined;
}
