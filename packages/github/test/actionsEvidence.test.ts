import { describe, expect, it } from 'vitest';
import { fetchActionsEvidence, type FetchFn } from '../src';

const sha = 'a'.repeat(40);
const run = { id: 12, workflow_id: 7, html_url: 'https://github.com/example/repo/actions/runs/12', head_sha: sha, event: 'pull_request', status: 'completed', conclusion: 'success', actor: { login: 'author' }, triggering_actor: { login: 'runner' }, run_attempt: 2 };
function fixture(options: { workflow?: unknown; runs?: unknown; status?: number } = {}) {
  return (async (url: string) => ({ ok: !options.status, status: options.status ?? 200, json: async () => url.includes('/runs?') ? options.runs ?? { total_count: 1, workflow_runs: [run] } : options.workflow ?? { id: 7, path: '.github/workflows/test.yml' } })) as unknown as FetchFn;
}
const read = (fetchFn: FetchFn) => fetchActionsEvidence('token', 'example/repo', 7, sha, new Date('2026-11-28T00:00:00Z'), fetchFn);

describe('configured Actions evidence', () => {
  it('preserves exact workflow, revision, event and actor provenance without asserting independence', async () => {
    expect(await read(fixture())).toMatchObject({ status: 'read', workflowId: 7, workflowPath: '.github/workflows/test.yml', revision: sha, runs: [{ id: 12, event: 'pull_request', actor: 'author', triggeringActor: 'runner', conclusion: 'success', attempt: 2 }] });
  });
  it('keeps an empty complete run list separate from inaccessible data', async () => {
    expect(await read(fixture({ runs: { total_count: 0, workflow_runs: [] } }))).toMatchObject({ status: 'read', runs: [] });
    expect(await read(fixture({ status: 403 }))).toMatchObject({ status: 'unavailable', error: { code: 'github.err.http' } });
  });
  it('fails closed for wrong identity, stale revision and incomplete records or pagination', async () => {
    for (const options of [
      { workflow: { id: 8, path: '.github/workflows/test.yml' } },
      { workflow: { id: 7, path: '../test.yml' } },
      { runs: { total_count: 1, workflow_runs: [{ ...run, head_sha: 'b'.repeat(40) }] } },
      { runs: { total_count: 1, workflow_runs: [{ ...run, html_url: 'https://github.com/example/other/actions/runs/12' }] } },
      { runs: { total_count: 2, workflow_runs: [run] } },
      { runs: { total_count: 1, workflow_runs: [{ ...run, triggering_actor: undefined }] } },
    ]) expect(await read(fixture(options))).toMatchObject({ status: 'unavailable', error: { code: 'github.err.evidence-incomplete' } });
  });
});
