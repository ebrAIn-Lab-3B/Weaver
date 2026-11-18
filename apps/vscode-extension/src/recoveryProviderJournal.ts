import type * as vscode from 'vscode';
import { createHash, randomUUID } from 'node:crypto';
import { RecoveryJournalError, encodeRecoveryRecord, validateRecoveryRecord, type JournalWriteResult, type RecoveryRecord } from './recoveryJournal';
import type { RecoveryStore } from './recoveryCoordinator';

type ProviderFs = Pick<vscode.FileSystem, 'createDirectory' | 'readDirectory' | 'stat' | 'readFile' | 'writeFile' | 'rename' | 'delete'>;
type JoinUri = (base: vscode.Uri, ...paths: string[]) => vscode.Uri;
const MAX_RECORD_BYTES = 2 * 1024 * 1024;
const queues = new Map<string, Promise<void>>();
const checkpointName = /^([a-f0-9]{64})\.(\d{1,16})\.json$/;
const temporaryName = /^[a-f0-9]{64}\.\d{1,16}\.[a-f0-9-]{36}\.tmp$/;

function keyFor(uri: string, session: string): string {
  return createHash('sha256').update(JSON.stringify([uri, session])).digest('hex');
}
function missing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && ['FileNotFound', 'EntryNotFound', 'ENOENT'].includes(String((error as { code?: unknown }).code));
}
function inOrder<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const result = previous.then(work, work);
  const tail = result.then(() => undefined, () => undefined);
  queues.set(key, tail);
  void tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return result;
}
function storageError(error: unknown): never {
  if (error instanceof RecoveryJournalError) throw error;
  throw new RecoveryJournalError('storage-failure');
}

/**
 * VS Code's local userdata provider has no fsync or exclusive-create API.
 * Each revision is an immutable provider URI, installed by rename with
 * overwrite:false. After a successful read-back, older revisions are removed
 * best effort; failed cleanup remains visible as a diagnostic until an
 * explicit session discard or a later successful checkpoint.
 * Report writes as unverified: provider rename/flush is not a power-loss
 * guarantee. Same-session writers must originate from one editor host; new
 * panels/processes create distinct random session IDs. Never use on remote
 * userdata providers or with a storage provider controlled by an attacker.
 */
export class RecoveryProviderJournal implements RecoveryStore {
  private readonly directory: vscode.Uri;
  constructor(private readonly fs: ProviderFs, root: vscode.Uri, private readonly join: JoinUri) {
    if (root.scheme !== 'vscode-userdata') throw new RecoveryJournalError('invalid-storage');
    this.directory = join(root, 'recovery-provider-v1');
  }

  private async names(): Promise<string[]> {
    await this.fs.createDirectory(this.directory);
    return (await this.fs.readDirectory(this.directory)).map(([name]) => name);
  }

  private async read(name: string): Promise<RecoveryRecord> {
    const match = checkpointName.exec(name);
    if (!match) throw new RecoveryJournalError('corrupt-record');
    const file = this.join(this.directory, name);
    const info = await this.fs.stat(file);
    // FileType.File=1 and SymbolicLink=64 in the VS Code API.
    if (!(info.type & 1) || (info.type & 64) || info.size > MAX_RECORD_BYTES) throw new RecoveryJournalError('corrupt-record');
    // A concurrent discard can remove the file between stat and read. Preserve
    // FileNotFound so list() can skip it instead of reporting corruption.
    let bytes: Uint8Array;
    try { bytes = await this.fs.readFile(file); }
    catch (error) { if (missing(error)) throw error; throw new RecoveryJournalError('corrupt-record'); }
    let record: unknown;
    try {
      if (bytes.byteLength > MAX_RECORD_BYTES) throw new Error('oversized');
      record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      validateRecoveryRecord(record);
    } catch { throw new RecoveryJournalError('corrupt-record'); }
    if (keyFor(record.documentUri, record.sessionId) !== match[1] || record.sequence !== Number(match[2])) throw new RecoveryJournalError('corrupt-record');
    return record;
  }

  async write(record: RecoveryRecord): Promise<JournalWriteResult> {
    validateRecoveryRecord(record);
    const encoded = encodeRecoveryRecord(record);
    const captured = JSON.parse(encoded) as RecoveryRecord;
    const key = keyFor(captured.documentUri, captured.sessionId);
    return inOrder(`${this.directory.toString()}/${key}`, async () => {
      try {
        const names = await this.names();
        const revisions = names.map((name) => ({ name, match: checkpointName.exec(name) })).filter((entry) => entry.match?.[1] === key);
        const highest = revisions.reduce((value, entry) => Math.max(value, Number(entry.match![2])), -1);
        if (captured.sequence < highest) throw new RecoveryJournalError('stale-sequence');
        const targetName = `${key}.${captured.sequence}.json`;
        if (captured.sequence === highest) {
          const previous = await this.read(targetName);
          if (encodeRecoveryRecord(previous) !== encoded) throw new RecoveryJournalError('sequence-conflict');
          await this.pruneVerified(targetName, encoded, revisions.map((entry) => entry.name));
          return { sequence: captured.sequence, result: 'unchanged', durability: 'unverified' };
        }
        const temp = this.join(this.directory, `${key}.${captured.sequence}.${randomUUID()}.tmp`);
        let created = false;
        try {
          created = true;
          await this.fs.writeFile(temp, new TextEncoder().encode(encoded));
          await this.fs.rename(temp, this.join(this.directory, targetName), { overwrite: false });
          created = false;
        } finally {
          if (created) { try { await this.fs.delete(temp, { recursive: false, useTrash: false }); } catch { /* Keep the old record and report orphaned temporary files. */ } }
        }
        // Never retire an older checkpoint before reading back and validating
        // the new one. A crash or provider error before this point leaves the
        // older records in place. Provider writes still cannot promise fsync.
        if (encodeRecoveryRecord(await this.read(targetName)) !== encoded) throw new RecoveryJournalError('corrupt-record');
        await this.pruneVerified(targetName, encoded, revisions.map((entry) => entry.name));
        return { sequence: captured.sequence, result: 'written', durability: 'unverified' };
      } catch (error) { return storageError(error); }
    });
  }

  /** Cleanup is best effort; never delete an old record if the new one is not readable. */
  private async pruneVerified(targetName: string, encoded: string, previous: string[]): Promise<void> {
    for (const name of previous) {
      if (name === targetName) continue;
      try {
        // Another window may explicitly discard the selected draft. If the
        // verified replacement is gone, retain the older checkpoints.
        if (encodeRecoveryRecord(await this.read(targetName)) !== encoded) return;
        await this.read(name);
        await this.fs.delete(this.join(this.directory, name), { recursive: false, useTrash: false });
      } catch { return; }
    }
  }

  async list(): Promise<{ records: RecoveryRecord[]; unreadable: string[]; locks: string[]; temporary: string[] }> {
    try {
      const names = await this.names();
      const unreadable: string[] = [];
      const latest = new Map<string, { record: RecoveryRecord; name: string }>();
      const retained: string[] = [];
      for (const name of names.filter((item) => checkpointName.test(item)).sort()) {
        try {
          const record = await this.read(name);
          const key = keyFor(record.documentUri, record.sessionId);
          const current = latest.get(key);
          if (!current || current.record.sequence < record.sequence) {
            if (current) retained.push(current.name);
            latest.set(key, { record, name });
          } else retained.push(name);
        } catch (error) { if (!missing(error)) unreadable.push(name); }
      }
      return { records: [...latest.values()].map((entry) => entry.record), unreadable, locks: [], temporary: [...names.filter((name) => temporaryName.test(name)), ...retained].sort() };
    } catch (error) { return storageError(error); }
  }

  async discard(documentUri: string, sessionId: string, expectedSequence: number): Promise<'discarded' | 'missing' | 'changed'> {
    validateRecoveryRecord({ schema: 1, documentUri, sessionId, sequence: expectedSequence, baseDigest: '0'.repeat(64), anchor: { start: 0, end: 0, original: '' }, draft: '', updatedAt: '2026-01-01T00:00:00.000Z' });
    const key = keyFor(documentUri, sessionId);
    return inOrder(`${this.directory.toString()}/${key}`, async () => {
      try {
        const names = await this.names();
        const revisions = names.map((name) => ({ name, match: checkpointName.exec(name) })).filter((entry) => entry.match?.[1] === key)
          .map((entry) => ({ name: entry.name, sequence: Number(entry.match![2]) })).sort((a, b) => a.sequence - b.sequence);
        if (!revisions.length) return 'missing';
        if (revisions.at(-1)!.sequence !== expectedSequence) return 'changed';
        // Validate every revision before deleting anything. Remove newest last so
        // a provider failure leaves the latest draft available for review.
        for (const revision of revisions) {
          const record = await this.read(revision.name);
          if (record.documentUri !== documentUri || record.sessionId !== sessionId) throw new RecoveryJournalError('corrupt-record');
        }
        for (const revision of revisions) await this.fs.delete(this.join(this.directory, revision.name), { recursive: false, useTrash: false });
        return 'discarded';
      } catch (error) { return storageError(error); }
    });
  }
}
