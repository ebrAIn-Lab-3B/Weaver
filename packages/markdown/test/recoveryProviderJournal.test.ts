import { describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { RecoveryProviderJournal } from '../../../apps/vscode-extension/src/recoveryProviderJournal';
import type { RecoveryRecord } from '../../../apps/vscode-extension/src/recoveryJournal';

const originalUri = 'file:///C:/workspace/private.md';
function record(sequence: number, draft = 'draft', sessionId = 'session-one'): RecoveryRecord {
  return { schema: 1, documentUri: originalUri, sessionId, sequence, baseDigest: 'a'.repeat(64),
    anchor: { start: 0, end: 3, original: 'old' }, draft, updatedAt: '2026-11-18T15:00:00.000Z' };
}

function provider() {
  const files = new Map<string, Uint8Array>();
  const dirs = new Set<string>();
  let rejectRename = false;
  let rejectDelete = false;
  let failAfterRename = false;
  let disappearOnRead = false;
  let failReadSuffix = '';
  let onDelete: ((name: string) => void) | undefined;
  const uri = (path: string) => ({ scheme: 'vscode-userdata', path, toString: () => `vscode-userdata:${path}` }) as vscode.Uri;
  const join = (base: vscode.Uri, ...parts: string[]) => uri([base.path, ...parts].join('/'));
  const absent = () => Object.assign(new Error('missing'), { code: 'FileNotFound' });
  const fs = {
    createDirectory: async (item: vscode.Uri) => { dirs.add(item.path); },
    readDirectory: async (item: vscode.Uri) => {
      if (!dirs.has(item.path)) throw absent();
      const prefix = item.path + '/';
      return [...files.keys()].filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/')).map((key) => [key.slice(prefix.length), 1] as [string, number]);
    },
    stat: async (item: vscode.Uri) => { const data = files.get(item.path); if (!data) throw absent(); return { type: 1, size: data.length, ctime: 0, mtime: 0 }; },
    readFile: async (item: vscode.Uri) => { if (disappearOnRead) { disappearOnRead = false; files.delete(item.path); throw absent(); } if (failReadSuffix && item.path.endsWith(failReadSuffix)) throw new Error('readback failed'); const data = files.get(item.path); if (!data) throw absent(); return data.slice(); },
    writeFile: async (item: vscode.Uri, data: Uint8Array) => { files.set(item.path, data.slice()); },
    rename: async (from: vscode.Uri, to: vscode.Uri, options: { overwrite: boolean }) => {
      if (rejectRename) throw new Error('failed');
      if (!options.overwrite && files.has(to.path)) throw new Error('exists');
      const data = files.get(from.path); if (!data) throw absent(); files.set(to.path, data); files.delete(from.path);
      if (failAfterRename) throw new Error('interrupted after rename');
    },
    delete: async (item: vscode.Uri) => { if (rejectDelete && item.path.endsWith('.json')) throw new Error('delete failed'); onDelete?.(item.path); if (!files.delete(item.path)) throw absent(); },
  };
  return { journal: new RecoveryProviderJournal(fs as unknown as vscode.FileSystem, uri('/global'), join), files,
    setFail: (v: boolean) => { rejectRename = v; }, setFailDelete: (v: boolean) => { rejectDelete = v; },
    setFailAfterRename: (v: boolean) => { failAfterRename = v; }, setDisappearOnRead: () => { disappearOnRead = true; },
    setFailReadSuffix: (v: string) => { failReadSuffix = v; }, setOnDelete: (v: ((name: string) => void) | undefined) => { onDelete = v; } };
}

describe('VS Code userdata recovery provider', () => {
  it('stores immutable versions through provider URIs and lists only the latest per session', async () => {
    const { journal, files } = provider();
    expect(await journal.write(record(1, 'first'))).toMatchObject({ sequence: 1, durability: 'unverified' });
    await journal.write(record(2, 'second'));
    await journal.write(record(1, 'separate', 'session-two'));
    expect((await journal.list()).records.map((item) => item.draft).sort()).toEqual(['second', 'separate']);
    expect(files.size).toBe(2);
    expect([...files.keys()].every((key) => key.startsWith('/global/recovery-provider-v1/'))).toBe(true);
    expect([...files.keys()].join(' ')).not.toContain('private');
    expect(await journal.discard(originalUri, 'session-one', 1)).toBe('changed');
    expect(await journal.discard(originalUri, 'session-one', 2)).toBe('discarded');
    expect((await journal.list()).records.map((item) => item.draft)).toEqual(['separate']);
    expect(files.size).toBe(1);
  });

  it('preserves the previous checkpoint on provider rename failure', async () => {
    const { journal, files, setFail } = provider();
    await journal.write(record(1, 'kept'));
    setFail(true);
    await expect(journal.write(record(2, 'new'))).rejects.toMatchObject({ code: 'storage-failure' });
    expect((await journal.list()).records[0].draft).toBe('kept');
    expect(files.size).toBe(1);
    setFail(false);
    await journal.write(record(3, 'retry'));
    expect((await journal.list()).records[0].draft).toBe('retry');
  });

  it('retains older data when cleanup fails and never reveals it after explicit discard', async () => {
    const { journal, files, setFailDelete } = provider();
    await journal.write(record(1, 'old private'));
    setFailDelete(true);
    await journal.write(record(2, 'current'));
    expect(files.size).toBe(2);
    expect((await journal.list()).records.map((item) => item.draft)).toEqual(['current']);
    expect((await journal.list()).temporary).toHaveLength(1);
    await expect(journal.discard(originalUri, 'session-one', 2)).rejects.toMatchObject({ code: 'storage-failure' });
    expect((await journal.list()).records[0].draft).toBe('current');
    setFailDelete(false);
    expect(await journal.discard(originalUri, 'session-one', 2)).toBe('discarded');
    expect((await journal.list()).records).toEqual([]);
    expect(files.size).toBe(0);
  });

  it('preserves both versions if interrupted after rename and removes them on explicit discard', async () => {
    const { journal, files, setFailAfterRename } = provider();
    await journal.write(record(1, 'old'));
    setFailAfterRename(true);
    await expect(journal.write(record(2, 'new'))).rejects.toMatchObject({ code: 'storage-failure' });
    setFailAfterRename(false);
    expect(files.size).toBe(2);
    expect((await journal.list()).records[0].draft).toBe('new');
    expect((await journal.list()).temporary).toHaveLength(1);
    expect(await journal.discard(originalUri, 'session-one', 2)).toBe('discarded');
    expect((await journal.list()).records).toEqual([]);
  });

  it('does not prune the previous checkpoint when the new version cannot be verified', async () => {
    const { journal, files, setFailReadSuffix } = provider();
    await journal.write(record(1, 'old'));
    setFailReadSuffix('.2.json');
    await expect(journal.write(record(2, 'new'))).rejects.toMatchObject({ code: 'corrupt-record' });
    expect(files.size).toBe(2);
    expect((await journal.list()).records[0].draft).toBe('old');
    setFailReadSuffix('');
    expect((await journal.list()).records[0].draft).toBe('new');
  });

  it('does not report an entry removed between stat and read as corrupt', async () => {
    const { journal, setDisappearOnRead } = provider();
    await journal.write(record(1));
    setDisappearOnRead();
    const result = await journal.list();
    expect(result.records).toEqual([]);
    expect(result.unreadable).toEqual([]);
  });

  it('serializes overlapping revisions and rejects stale or conflicting retries', async () => {
    const { journal } = provider();
    await Promise.all([journal.write(record(1, 'one')), journal.write(record(2, 'two'))]);
    await expect(journal.write(record(1, 'one'))).rejects.toMatchObject({ code: 'stale-sequence' });
    await expect(journal.write(record(2, 'wrong'))).rejects.toMatchObject({ code: 'sequence-conflict' });
    expect(await journal.write(record(2, 'two'))).toMatchObject({ result: 'unchanged' });
    expect((await journal.list()).records[0].draft).toBe('two');
  });

  it('never deletes a later checkpoint when discard races a new write', async () => {
    const { journal } = provider();
    await journal.write(record(1, 'displayed'));
    const [written, discarded] = await Promise.all([
      journal.write(record(2, 'later')),
      journal.discard(originalUri, 'session-one', 1),
    ]);
    expect(written.sequence).toBe(2);
    expect(discarded).toBe('changed');
    expect((await journal.list()).records[0].draft).toBe('later');
  });

  it('preserves a new cross-window revision arriving during an explicitly confirmed discard', async () => {
    const { journal, files, setFailDelete, setOnDelete } = provider();
    await journal.write(record(1, 'first'));
    setFailDelete(true);
    await journal.write(record(2, 'selected'));
    setFailDelete(false);
    const oldPath = [...files.keys()].find((key) => key.endsWith('.1.json'))!;
    setOnDelete((name) => {
      if (name !== oldPath) return;
      setOnDelete(undefined);
      files.set(oldPath.replace(/\.1\.json$/, '.3.json'), new TextEncoder().encode(JSON.stringify(record(3, 'other window'))));
    });
    expect(await journal.discard(originalUri, 'session-one', 2)).toBe('discarded');
    expect((await journal.list()).records.map((item) => item.draft)).toEqual(['other window']);
  });

  it('retains corrupted records and refuses to discard them', async () => {
    const { journal, files } = provider();
    await journal.write(record(1, 'safe'));
    const target = [...files.keys()][0];
    files.set(target, new TextEncoder().encode('{private corrupted'));
    expect((await journal.list()).unreadable).toHaveLength(1);
    await expect(journal.discard(originalUri, 'session-one', 1)).rejects.toMatchObject({ code: 'corrupt-record' });
    expect(new TextDecoder().decode(files.get(target)!)).toBe('{private corrupted');
  });
});
