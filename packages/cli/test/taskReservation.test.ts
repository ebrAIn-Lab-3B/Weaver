import { describe, expect, it } from 'vitest';
import type { Fetch } from '@ebrain-lab/weaver-github';
import { operationReservationVisible, reserveRecovery, reserveRecoveryFromDefault, reserveTask, taskReservationRefs } from '../src/taskReservation';

describe('repository task reservations', () => {
  function server(uncertainFirst = false) {
    const refs = new Set<string>();
    let calls = 0;
    const fetchImpl: Fetch = async (url, init) => {
      if (url.endsWith('/repos/owner/repo')) return { ok: true, status: 200, json: async () => ({ default_branch: 'main' }) };
      if (url.endsWith('/commits/main')) return { ok: true, status: 200, json: async () => ({ sha: 'a'.repeat(40) }) };
      const body = JSON.parse(init.body) as { ref: string; sha: string };
      if (refs.has(body.ref)) return { ok: false, status: 422, json: async () => ({}) };
      refs.add(body.ref);
      calls += 1;
      if (uncertainFirst && calls === 1) throw new Error('response lost');
      return { ok: true, status: 201, json: async () => ({ ref: body.ref, object: { sha: body.sha } }) };
    };
    return { refs, fetchImpl };
  }

  it('allows only one concurrent reservation for the same operation', async () => {
    const { fetchImpl, refs } = server();
    const key = taskReservationRefs('owner/repo', 'REQ-001', undefined, undefined, 'Title', 'TASK-041');
    const results = await Promise.allSettled([reserveTask('t', 'owner/repo', key, fetchImpl), reserveTask('t', 'owner/repo', key, fetchImpl)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(refs).toEqual(new Set([key.operation, key.task]));
  });

  it('uses valid Fetch GET requests for repository and commit reads', async () => {
    const { fetchImpl } = server();
    const key = taskReservationRefs('owner/repo', 'REQ-001', undefined, undefined, 'Title', 'TASK-041');
    await reserveTask('t', 'owner/repo', key, async (url, init) => {
      const request = new Request(url, init);
      if (init.method === 'GET') expect(request.body).toBeNull();
      return fetchImpl(url, init);
    });
  });

  it('leaves an uncertain reservation in place and refuses an automatic retry', async () => {
    const { fetchImpl, refs } = server(true);
    const key = taskReservationRefs('owner/repo', 'REQ-001', undefined, undefined, 'Title', 'TASK-041');
    await expect(reserveTask('t', 'owner/repo', key, fetchImpl)).rejects.toThrow();
    expect(refs).toEqual(new Set([key.operation]));
    await expect(reserveTask('t', 'owner/repo', key, fetchImpl)).rejects.toThrow();
    expect(refs).toEqual(new Set([key.operation]));
  });

  it('prevents different operations from claiming the same task ID', async () => {
    const { fetchImpl, refs } = server();
    const first = taskReservationRefs('owner/repo', 'REQ-001', undefined, undefined, 'First', 'TASK-041');
    const second = taskReservationRefs('owner/repo', 'REQ-001', undefined, undefined, 'Second', 'TASK-041');
    await reserveTask('t', 'owner/repo', first, fetchImpl);
    await expect(reserveTask('t', 'owner/repo', second, fetchImpl)).rejects.toThrow();
    expect(refs.has(second.operation)).toBe(true);
    expect(refs.has(second.task)).toBe(true);
  });

  it('allows only one branch PR recovery attempt to reserve the task', async () => {
    const { fetchImpl, refs } = server();
    const ref = 'refs/heads/weaver/reservations/recover-pr-task-041';
    const results = await Promise.allSettled([reserveRecovery('t', 'owner/repo', ref, 'a'.repeat(40), fetchImpl), reserveRecovery('t', 'owner/repo', ref, 'a'.repeat(40), fetchImpl)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(refs).toEqual(new Set([ref]));
  });

  it('uses the same exclusive reservation before a new branch and an existing-branch recovery', async () => {
    const { fetchImpl } = server();
    const ref = 'refs/heads/weaver/reservations/recover-pr-task-041';
    const results = await Promise.allSettled([reserveRecoveryFromDefault('t', 'owner/repo', ref, fetchImpl), reserveRecovery('t', 'owner/repo', ref, 'b'.repeat(40), fetchImpl)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });

  it('distinguishes a visible reservation from an unreadable one', async () => {
    const ref = taskReservationRefs('owner/repo', 'REQ-001', undefined, undefined, 'Title', 'TASK-041').operation;
    await expect(operationReservationVisible('t', 'owner/repo', ref, async () => ({ ok: true, status: 200, json: async () => ({ ref }) }))).resolves.toBe(true);
    await expect(operationReservationVisible('t', 'owner/repo', ref, async () => ({ ok: false, status: 403, json: async () => ({}) }))).rejects.toThrow();
    await expect(operationReservationVisible('t', 'owner/repo', ref, async () => ({ ok: false, status: 404, json: async () => ({}) }))).resolves.toBe(false);
  });
});
