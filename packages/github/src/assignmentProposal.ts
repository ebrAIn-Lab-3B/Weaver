import { parseIssueUrl, parseProcess, placeIssue, planNextAssignee, type Contributor, type ProposalAction, type ProposalSnapshot, type RosterRef } from '@ebrain-lab/weaver-markdown';
import { fetchIssue, setIssueAssignees, type FetchFn } from './issue';
import { fetchProcessFile } from './processFile';
import { readProject, type Fetch } from './project';

export interface FreshAssignmentContext {
  /** Read the effective roster from its source, not a stale cached copy. */
  readRoster(reference: RosterRef | undefined): Promise<{ contributors: readonly Contributor[]; version: string } | undefined>;
  /** Read the task holder and an exact version; even an absent task must be represented explicitly. */
  readHolder(): Promise<{ holder?: string; version: string } | undefined>;
  /** Organization-supplied execution observation; absence is unknown, never assumed idle. */
  readExecution(issueUrl: string): Promise<'yes' | 'no' | 'unknown'>;
}

const normalized = (values: readonly string[]) => JSON.stringify([...values].map((value) => value.toLowerCase()).sort());

/** Fresh GitHub snapshot for an assignment confirmation. Undefined means a required source was unavailable. */
export async function readAssignmentSnapshot(
  token: string,
  project: { owner: string; number: number },
  issueUrl: string,
  context: FreshAssignmentContext,
  fetchImpl: FetchFn = fetch,
): Promise<ProposalSnapshot | undefined> {
  const ref = parseIssueUrl(issueUrl);
  if (!ref) return undefined;
  const repository = `${ref.owner}/${ref.repo}`;
  try {
    const [issue, processFile, holder, activeExecution] = await Promise.all([
      fetchIssue(token, issueUrl, fetchImpl), fetchProcessFile(token, repository, {}, fetchImpl),
      context.readHolder(), context.readExecution(issueUrl),
    ]);
    if (!issue.ok || processFile.status !== 'read' || !holder?.version) return undefined;
    const process = parseProcess(`${repository}/.weaver/process.yaml`, processFile.text);
    if (process.issues.some((item) => item.severity === 'error' || item.code === 'roster-invalid-reference' || (item.code === 'process-section-not-a-mapping' && item.args?.section === 'roster')) || !process.process.assignment) return undefined;
    const roster = await context.readRoster(process.rosterRef);
    if (!roster?.version) return undefined;
    const fields = [...new Set(Object.values(process.process.assignment).flatMap((rule) => rule.when ? [rule.when.projectField] : []))];
    const board = await readProject(token, project, [repository], fetchImpl as unknown as Fetch, fields);
    if (!board.ok) return undefined;
    const card = board.read.cards.find((entry) => entry.number === ref.number && entry.repository.toLowerCase() === repository.toLowerCase());
    if (!card || card.state !== issue.issue.state || normalized(card.labels) !== normalized(issue.issue.labels) || normalized(card.assignees) !== normalized(issue.issue.assignees)) return undefined;
    const column = placeIssue({ ...issue.issue, boardStatus: card.boardStatus }, process.process.columns);
    if (column.gaps.length) return undefined;
    const conditionFields = card.fields ?? {};
    const plan = planNextAssignee({ column: column.column, rules: process.process.assignment, contributors: roster.contributors, holder: holder.holder, projectFields: conditionFields });
    return {
      issueUrl: issue.issue.url, issueState: issue.issue.state, labels: issue.issue.labels, assignees: issue.issue.assignees,
      activeExecution, conditionFields, processVersion: processFile.text,
      rosterVersion: JSON.stringify([roster.version, holder.version]), plan,
    };
  } catch { return undefined; }
}

/** Perform exactly one previously confirmed Issue action. A label can trigger a configured external agent. */
export async function writeProposalAction(token: string, action: ProposalAction, fetchImpl: FetchFn = fetch): Promise<void> {
  const ref = parseIssueUrl(action.issueUrl);
  if (!ref) throw new Error('Invalid issue URL');
  const repository = `${ref.owner}/${ref.repo}`;
  if (action.type === 'issue-assignees') return setIssueAssignees(token, repository, ref.number, action.to, fetchImpl);
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/issues/${ref.number}/labels`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ labels: [action.label] }),
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  const labels = await response.json() as { name?: string }[];
  if (!Array.isArray(labels) || !labels.some((label) => label.name?.toLowerCase() === action.label.toLowerCase())) throw new Error('GitHub did not return the requested label');
}
