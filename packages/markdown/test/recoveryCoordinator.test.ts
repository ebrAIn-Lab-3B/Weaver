import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { RecoveryJournal, type RecoveryFileOps } from '../../../apps/vscode-extension/src/recoveryJournal';
import { RecoveryCoordinator } from '../../../apps/vscode-extension/src/recoveryCoordinator';

const uri = 'file:///C:/workspace/notes.md';
const other = 'file:///C:/workspace/other.md';
let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'weaver-coordinator-')); });
afterEach(async () => {
  const dir = path.join(root, 'recovery-journal-v1');
  try { for (const file of await fs.readdir(dir)) await fs.unlink(path.join(dir, file)); await fs.rmdir(dir); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await fs.rmdir(root);
});

describe('review-only recovery coordination', () => {
  it('keeps different blocks and panels separate, and only returns the requested document', async () => {
    const recovery = new RecoveryCoordinator(new RecoveryJournal(root));
    const first = recovery.begin(uri), second = recovery.begin(uri), elsewhere = recovery.begin(other);
    const saved = await first.checkpoint({ source: 'same\n\nsame', start: 0, end: 4, draft: 'first' });
    await second.checkpoint({ source: 'same\n\nsame', start: 6, end: 10, draft: 'second' });
    await elsewhere.checkpoint({ source: 'other', start: 0, end: 5, draft: 'private' });
    expect(saved).toMatchObject({ sequence: 1, sessionId: first.sessionId, documentSaved: false, durability: 'unverified' });
    expect(first.sessionId).not.toBe(second.sessionId);
    const drafts = (await recovery.review(uri)).records;
    expect(drafts.map((item) => item.draft).sort()).toEqual(['first', 'second']);
    expect(drafts.find((item) => item.draft === 'second')?.anchor).toEqual({ start: 6, end: 10, original: 'same' });
    expect((await recovery.review(other)).records.map((item) => item.draft)).toEqual(['private']);
  });

  it('retains the newest checkpoint even if an old displayed version is discarded', async () => {
    const recovery = new RecoveryCoordinator(new RecoveryJournal(root));
    const block = recovery.begin(uri);
    await block.checkpoint({ source: 'old', start: 0, end: 3, draft: 'one' });
    const old = (await recovery.review(uri)).records[0];
    await block.checkpoint({ source: 'old', start: 0, end: 3, draft: 'two' });
    expect(await recovery.discard(old)).toBe('changed');
    expect((await recovery.review(uri)).records[0].draft).toBe('two');
    const current = (await recovery.review(uri)).records[0];
    expect(await recovery.discard(current)).toBe('discarded');
    expect(await recovery.discard(current)).toBe('missing');
    expect((await recovery.review(uri)).records).toEqual([]);
  });

  it('serializes overlapping snapshots and never marks a failed write as protected', async () => {
    const failing: RecoveryFileOps = { ...fs, rename: async () => { throw new Error('disk full'); } };
    const failed = new RecoveryCoordinator(new RecoveryJournal(root, failing)).begin(uri);
    await expect(failed.checkpoint({ source: 'old', start: 0, end: 3, draft: 'unsaved' })).rejects.toMatchObject({ code: 'storage-failure' });
    expect((await new RecoveryCoordinator(new RecoveryJournal(root)).review(uri)).records).toEqual([]);
    const block = new RecoveryCoordinator(new RecoveryJournal(root)).begin(uri);
    const [a, b] = await Promise.all([
      block.checkpoint({ source: 'old', start: 0, end: 3, draft: 'first' }),
      block.checkpoint({ source: 'old', start: 0, end: 3, draft: 'latest' }),
    ]);
    expect([a.sequence, b.sequence]).toEqual([1, 2]);
    expect((await new RecoveryCoordinator(new RecoveryJournal(root)).review(uri)).records[0].draft).toBe('latest');
  });

  it('refuses invalid ranges instead of creating an ambiguous record', async () => {
    const recovery = new RecoveryCoordinator(new RecoveryJournal(root));
    const block = recovery.begin(uri);
    await expect(block.checkpoint({ source: 'old', start: 2, end: 4, draft: 'x' })).rejects.toThrow('Invalid recovery snapshot');
    expect((await recovery.review(uri)).records).toEqual([]);
  });

  it('does not discard a locked or corrupt checkpoint', async () => {
    const journal = new RecoveryJournal(root), recovery = new RecoveryCoordinator(journal);
    const block = recovery.begin(uri);
    await block.checkpoint({ source: 'old', start: 0, end: 3, draft: 'safe' });
    const record = (await recovery.review(uri)).records[0];
    const dir = path.join(root, 'recovery-journal-v1');
    const json = (await fs.readdir(dir)).find((name) => name.endsWith('.json'))!;
    await fs.writeFile(path.join(dir, json.replace(/\.json$/, '.lock')), 'another writer');
    await expect(recovery.discard(record)).rejects.toMatchObject({ code: 'locked' });
    expect((await recovery.review(uri)).records[0].draft).toBe('safe');
    await fs.unlink(path.join(dir, json.replace(/\.json$/, '.lock')));
    await fs.writeFile(path.join(dir, json), '{damaged private contents');
    await expect(recovery.discard(record)).rejects.toMatchObject({ code: 'corrupt-record' });
    expect(await fs.readFile(path.join(dir, json), 'utf8')).toBe('{damaged private contents');
    expect((await recovery.review(uri)).unreadableCount).toBe(1);
  });
});
