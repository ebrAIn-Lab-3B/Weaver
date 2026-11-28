import type { Notice } from '@ebrain-lab/weaver-markdown';
import { errorNotice, NoticeError } from './errors';
import { evidenceNext } from './evidencePagination';
import type { FetchFn } from './issue';

export interface ActionsEvidenceRun {
  id: number; url: string; revision: string; event: string; status: string;
  conclusion: string | null; actor: string | null; triggeringActor: string | null; attempt: number;
}
export type ActionsEvidence =
  | { status: 'read'; workflowId: number; workflowPath: string; revision: string; readAt: string; runs: ActionsEvidenceRun[] }
  | { status: 'unavailable'; error: Notice };

/** Read only an explicitly configured workflow at one exact revision; never infer independence. */
export async function fetchActionsEvidence(token: string, repository: string, workflowId: number, revision: string, readAt: Date, fetchFn: FetchFn = fetch): Promise<ActionsEvidence> {
  try {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !Number.isSafeInteger(workflowId) || workflowId < 1 || !/^[a-f\d]{40}$/i.test(revision)) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
    const base = `https://api.github.com/repos/${repository}/actions/workflows/${workflowId}`;
    const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
    const workflowResponse = await fetchFn(base, { headers });
    if (!workflowResponse.ok) throw new NoticeError({ code: 'github.err.http', args: { status: workflowResponse.status } });
    const workflow = await workflowResponse.json() as { id?: unknown; path?: unknown };
    if (workflow?.id !== workflowId || typeof workflow.path !== 'string' || !/^\.github\/workflows\/[\w.-]+\.ya?ml$/.test(workflow.path)) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
    const url = `${base}/runs?head_sha=${revision}`;
    const runs: ActionsEvidenceRun[] = [];
    let total: number | undefined;
    for (let page = 1; page <= 50; page++) {
      const response = await fetchFn(`${url}&per_page=100&page=${page}`, { headers });
      if (!response.ok) throw new NoticeError({ code: 'github.err.http', args: { status: response.status } });
      const data = await response.json() as { total_count?: unknown; workflow_runs?: unknown };
      if (!Number.isSafeInteger(data?.total_count) || Number(data.total_count) < 0 || !Array.isArray(data.workflow_runs) || data.workflow_runs.length > 100 || (total !== undefined && total !== data.total_count)) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
      total = data.total_count as number;
      for (const item of data.workflow_runs) {
        if (!item || typeof item !== 'object') throw new NoticeError({ code: 'github.err.evidence-incomplete' });
        const v = item as Record<string, any>;
        const login = (user: any): string | null | undefined => user === null ? null : typeof user?.login === 'string' && user.login ? user.login : undefined;
        const actor = login(v.actor); const triggeringActor = login(v.triggering_actor);
        const expectedUrl = `https://github.com/${repository}/actions/runs/${v.id}`.toLowerCase();
        if (!Number.isSafeInteger(v.id) || v.id < 1 || v.workflow_id !== workflowId || typeof v.html_url !== 'string' || v.html_url.toLowerCase() !== expectedUrl || typeof v.head_sha !== 'string' || v.head_sha.toLowerCase() !== revision.toLowerCase() || typeof v.event !== 'string' || !v.event || typeof v.status !== 'string' || !v.status || (v.conclusion !== null && typeof v.conclusion !== 'string') || actor === undefined || triggeringActor === undefined || !Number.isSafeInteger(v.run_attempt) || v.run_attempt < 1) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
        runs.push({ id: v.id, url: v.html_url, revision: v.head_sha, event: v.event, status: v.status, conclusion: v.conclusion, actor, triggeringActor, attempt: v.run_attempt });
      }
      const next = await evidenceNext(response.headers?.get('link'), url, page, token, fetchFn);
      if (!next && data.workflow_runs.length < 100) {
        if (runs.length !== total || new Set(runs.map((run) => run.id)).size !== runs.length) throw new NoticeError({ code: 'github.err.evidence-incomplete' });
        return { status: 'read', workflowId, workflowPath: workflow.path, revision, readAt: readAt.toISOString(), runs };
      }
    }
    throw new NoticeError({ code: 'github.err.evidence-incomplete' });
  } catch (error) { return { status: 'unavailable', error: errorNotice(error) }; }
}
