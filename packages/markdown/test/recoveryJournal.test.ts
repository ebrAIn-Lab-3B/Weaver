import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { RecoveryJournal, RecoveryJournalError, type RecoveryFileOps, type RecoveryRecord } from '../../../apps/vscode-extension/src/recoveryJournal';

const documentUri = 'file:///C:/private/project/secret.md';
const makeRecord = (sequence: number, draft = '비공개 초안', sessionId = 'session_1'): RecoveryRecord => ({
  schema: 1, documentUri, sessionId, sequence, baseDigest: 'a'.repeat(64),
  anchor: { start: 4, end: 6, original: '원문' }, draft, updatedAt: '2026-11-18T15:00:00.000Z',
});
const key = (sessionId = 'session_1') => createHash('sha256').update(JSON.stringify([documentUri, sessionId])).digest('hex');
let root: string;
let journal: RecoveryJournal;

beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'weaver-recovery-test-')); journal = new RecoveryJournal(root); });
afterEach(async () => {
  // Delete only this test's known flat journal directory, never a recursive path.
  const dir = path.join(root, 'recovery-journal-v1');
  try { for (const file of await fs.readdir(dir)) await fs.unlink(path.join(dir, file)); await fs.rmdir(dir); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await fs.rmdir(root);
});

describe('local recovery journal prototype', () => {
  it('writes, reads, lists separate sessions, and does not expose filenames or claim durable storage', async () => {
    expect(await journal.read(documentUri, 'session_1')).toBeUndefined();
    expect(await journal.write(makeRecord(1))).toEqual({ sequence: 1, result: 'written', durability: 'unverified' });
    await journal.write(makeRecord(1, '다른 세션', 'session_2'));
    expect(await journal.read(documentUri, 'session_1')).toEqual(makeRecord(1));
    expect((await journal.list()).records).toHaveLength(2);
    const names = await fs.readdir(path.join(root, 'recovery-journal-v1'));
    expect(names).toHaveLength(2);
    expect(names.join(' ')).not.toContain('secret');
    expect(names.join(' ')).not.toContain('session_1');
    if (process.platform !== 'win32') {
      expect((await fs.stat(path.join(root, 'recovery-journal-v1'))).mode & 0o077).toBe(0);
      expect((await fs.stat(path.join(root, 'recovery-journal-v1', names[0]))).mode & 0o077).toBe(0);
    }
  });

  it('serializes overlapping writes, refuses stale sequence numbers and accepts only an identical retry', async () => {
    const [first, second] = await Promise.all([journal.write(makeRecord(1, 'one')), journal.write(makeRecord(2, 'two'))]);
    expect(first.sequence).toBe(1); expect(second.sequence).toBe(2);
    expect((await journal.read(documentUri, 'session_1'))?.draft).toBe('two');
    await expect(journal.write(makeRecord(1, 'old'))).rejects.toMatchObject({ code: 'stale-sequence' });
    await expect(journal.write(makeRecord(2, 'different'))).rejects.toMatchObject({ code: 'sequence-conflict' });
    expect(await journal.write(makeRecord(2, 'two'))).toEqual({ sequence: 2, result: 'unchanged', durability: 'unverified' });
    const same = makeRecord(2, 'two');
    const reordered = { draft: same.draft, anchor: same.anchor, sequence: same.sequence, sessionId: same.sessionId, baseDigest: same.baseDigest, documentUri: same.documentUri, updatedAt: same.updatedAt, schema: 1 as const };
    expect(await journal.write(reordered)).toMatchObject({ result: 'unchanged' });
    expect((await journal.write(makeRecord(3, 'three'))).sequence).toBe(3);
  });

  it('preserves the previous checkpoint and cleans temporary files when replacement fails', async () => {
    await journal.write(makeRecord(1, 'safe'));
    const failing: RecoveryFileOps = { ...fs, rename: async () => { throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); } };
    await expect(new RecoveryJournal(root, failing).write(makeRecord(2, 'new'))).rejects.toMatchObject({ code: 'storage-failure' });
    expect((await journal.read(documentUri, 'session_1'))?.draft).toBe('safe');
    expect(await fs.readdir(path.join(root, 'recovery-journal-v1'))).toEqual([`${key()}.json`]);
  });

  it('preserves the previous checkpoint if flushing the replacement fails', async () => {
    await journal.write(makeRecord(1, 'safe'));
    const failing: RecoveryFileOps = { ...fs, open: (async (...args: Parameters<typeof fs.open>) => {
      const file = await fs.open(...args);
      if (!String(args[0]).endsWith('.tmp')) return file;
      return new Proxy(file, { get(target, prop) {
        if (prop === 'sync') return async () => { throw new Error('flush failed'); };
        const value = Reflect.get(target, prop, target); return typeof value === 'function' ? value.bind(target) : value;
      } });
    }) as typeof fs.open };
    await expect(new RecoveryJournal(root, failing).write(makeRecord(2, 'new'))).rejects.toMatchObject({ code: 'storage-failure' });
    expect((await journal.read(documentUri, 'session_1'))?.draft).toBe('safe');
    expect(await fs.readdir(path.join(root, 'recovery-journal-v1'))).toEqual([`${key()}.json`]);
  });

  it('keeps corrupt records and reports them without leaking content', async () => {
    await journal.write(makeRecord(1));
    const file = path.join(root, 'recovery-journal-v1', `${key()}.json`);
    await fs.writeFile(file, '{PRIVATE damaged', 'utf8');
    await expect(journal.read(documentUri, 'session_1')).rejects.toMatchObject({ code: 'corrupt-record' });
    await expect(journal.write(makeRecord(2))).rejects.toMatchObject({ code: 'corrupt-record' });
    expect(await fs.readFile(file, 'utf8')).toBe('{PRIVATE damaged');
    expect(await journal.list()).toEqual({ records: [], unreadable: [key()], locks: [], temporary: [] });
  });

  it('refuses an existing cross-process lock and never removes it automatically', async () => {
    await journal.write(makeRecord(1));
    const lock = path.join(root, 'recovery-journal-v1', `${key()}.lock`);
    await fs.writeFile(lock, 'unknown owner');
    await expect(journal.write(makeRecord(2))).rejects.toMatchObject({ code: 'locked' });
    expect(await fs.readFile(lock, 'utf8')).toBe('unknown owner');
    expect((await journal.read(documentUri, 'session_1'))?.sequence).toBe(1);
    expect((await journal.list()).locks).toEqual([`${key()}.lock`]);
    // A new session is isolated; it cannot overwrite the locked session's record.
    await journal.write(makeRecord(1, 'recovered copy', 'new_session'));
    expect((await journal.read(documentUri, 'new_session'))?.draft).toBe('recovered copy');
    expect((await journal.read(documentUri, 'session_1'))?.draft).toBe('비공개 초안');
    expect(await fs.readFile(lock, 'utf8')).toBe('unknown owner');
  });

  it('reports but never deletes a possibly active or interrupted temporary file', async () => {
    await journal.write(makeRecord(1));
    const name = `${key()}.12345678-1234-4123-8123-123456789abc.tmp`;
    const temp = path.join(root, 'recovery-journal-v1', name);
    await fs.writeFile(temp, 'partial private text');
    const summary = await journal.list();
    expect(summary.temporary).toEqual([name]);
    expect(summary.records).toEqual([makeRecord(1)]);
    expect(await fs.readFile(temp, 'utf8')).toBe('partial private text');
  });

  it('rejects a journal directory junction or symbolic link without touching its target', async () => {
    const target = path.join(root, 'target');
    const link = path.join(root, 'recovery-journal-v1');
    await fs.mkdir(target);
    try {
      await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
      await expect(journal.write(makeRecord(1))).rejects.toMatchObject({ code: 'invalid-storage' });
      expect(await fs.readdir(target)).toEqual([]);
    } finally {
      try { await fs.unlink(link); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      await fs.rmdir(target);
    }
  });

  it('rejects a symlink checkpoint without reading or replacing its target', async ({ skip }) => {
    await journal.write(makeRecord(1));
    const file = path.join(root, 'recovery-journal-v1', `${key()}.json`);
    const target = path.join(root, 'private-target.txt');
    await fs.writeFile(target, 'private target');
    await fs.unlink(file);
    try {
      try { await fs.symlink(target, file, 'file'); }
      catch (error) { if (['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) { skip(); return; } throw error; }
      await expect(journal.read(documentUri, 'session_1')).rejects.toMatchObject({ code: 'corrupt-record' });
      await expect(journal.write(makeRecord(2))).rejects.toMatchObject({ code: 'corrupt-record' });
      expect((await journal.list()).unreadable).toEqual([key()]);
      expect(await fs.readFile(target, 'utf8')).toBe('private target');
    } finally { await fs.unlink(target); }
  });

  it('rejects a checkpoint reported as a symlink before opening its content', async () => {
    await journal.write(makeRecord(1));
    const file = path.join(root, 'recovery-journal-v1', `${key()}.json`);
    let checkpointRead = false;
    const guarded: RecoveryFileOps = { ...fs,
      lstat: (async (...args: Parameters<typeof fs.lstat>) => {
        const stat = await fs.lstat(...args);
        if (String(args[0]) !== file) return stat;
        return new Proxy(stat, { get(target, prop) {
          if (prop === 'isSymbolicLink') return () => true;
          const value = Reflect.get(target, prop, target); return typeof value === 'function' ? value.bind(target) : value;
        } });
      }) as typeof fs.lstat,
      readFile: (async (...args: Parameters<typeof fs.readFile>) => {
        if (String(args[0]) === file) checkpointRead = true;
        return fs.readFile(...args);
      }) as typeof fs.readFile,
    };
    await expect(new RecoveryJournal(root, guarded).read(documentUri, 'session_1')).rejects.toMatchObject({ code: 'corrupt-record' });
    expect(checkpointRead).toBe(false);
  });

  it('reports a lock-cleanup failure even if the new checkpoint was already published', async () => {
    await journal.write(makeRecord(1, 'old'));
    const failing: RecoveryFileOps = { ...fs, unlink: async (name) => {
      if (String(name).endsWith('.lock')) throw new Error('lock cleanup failed');
      await fs.unlink(name);
    } };
    await expect(new RecoveryJournal(root, failing).write(makeRecord(2, 'new'))).rejects.toMatchObject({ code: 'storage-failure' });
    expect((await journal.read(documentUri, 'session_1'))?.draft).toBe('new');
    await expect(journal.write(makeRecord(3, 'later'))).rejects.toMatchObject({ code: 'locked' });
  });

  it('rejects unsafe identity, malformed context, extra fields, and oversized input', async () => {
    expect(() => new RecoveryJournal('relative/path')).toThrow(RecoveryJournalError);
    await expect(journal.write({ ...makeRecord(1), sessionId: '../escape' })).rejects.toMatchObject({ code: 'invalid-record' });
    await expect(journal.write({ ...makeRecord(1), documentUri: 'vscode-remote://host/file' })).rejects.toMatchObject({ code: 'invalid-record' });
    await expect(journal.write({ ...makeRecord(1), documentUri: 'file:////server/share/doc.md' })).rejects.toMatchObject({ code: 'invalid-record' });
    await expect(journal.write({ ...makeRecord(1), documentUri: 'file:///%2fserver/share/doc.md' })).rejects.toMatchObject({ code: 'invalid-record' });
    if (process.platform === 'win32') expect(() => new RecoveryJournal('\\\\server\\share\\storage')).toThrowError(expect.objectContaining({ code: 'invalid-storage' }));
    await expect(journal.write({ ...makeRecord(1), anchor: { start: 4, end: 8, original: '짧음' } })).rejects.toMatchObject({ code: 'invalid-record' });
    await expect(journal.write({ ...makeRecord(1), draft: 'x'.repeat(2 * 1024 * 1024) })).rejects.toMatchObject({ code: 'invalid-record' });
    await expect(journal.write({ ...makeRecord(1), surprise: 'unexpected' } as RecoveryRecord)).rejects.toMatchObject({ code: 'invalid-record' });
  });
});
