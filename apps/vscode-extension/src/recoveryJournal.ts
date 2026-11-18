import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

/** Prototype only. The caller supplies a trusted local VS Code extension storage directory. */
export interface RecoveryRecord {
  schema: 1;
  documentUri: string;
  sessionId: string;
  sequence: number;
  baseDigest: string;
  anchor: { start: number; end: number; original: string };
  draft: string;
  updatedAt: string;
}

export type RecoveryJournalErrorCode = 'invalid-storage' | 'invalid-record' | 'corrupt-record' | 'locked' | 'stale-sequence' | 'sequence-conflict' | 'storage-failure';

/** Error messages deliberately omit document content and paths. */
export class RecoveryJournalError extends Error {
  constructor(readonly code: RecoveryJournalErrorCode) { super(`Recovery journal: ${code}`); }
}

export type RecoveryFileOps = Pick<typeof fs, 'mkdir' | 'lstat' | 'open' | 'readFile' | 'readdir' | 'rename' | 'unlink'>;
export type JournalWriteResult = { sequence: number; result: 'written' | 'unchanged'; durability: 'unverified' };

const MAX_RECORD_BYTES = 2 * 1024 * 1024;
const queues = new Map<string, Promise<void>>();

function invalid(): never { throw new RecoveryJournalError('invalid-record'); }
function exactKeys(value: object, keys: string[]): boolean { return Object.keys(value).sort().join('|') === [...keys].sort().join('|'); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function validate(value: unknown): asserts value is RecoveryRecord {
  if (!isRecord(value) || !exactKeys(value, ['schema', 'documentUri', 'sessionId', 'sequence', 'baseDigest', 'anchor', 'draft', 'updatedAt']) || value.schema !== 1 ||
      typeof value.documentUri !== 'string' || value.documentUri.length > 8192 || typeof value.sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.sessionId) ||
      !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 0 || typeof value.baseDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.baseDigest) ||
      typeof value.draft !== 'string' || typeof value.updatedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.updatedAt) ||
      !Number.isFinite(Date.parse(value.updatedAt)) || new Date(value.updatedAt).toISOString() !== value.updatedAt || !isRecord(value.anchor) ||
      !exactKeys(value.anchor, ['start', 'end', 'original']) || !Number.isSafeInteger(value.anchor.start) || !Number.isSafeInteger(value.anchor.end) ||
      (value.anchor.start as number) < 0 || (value.anchor.end as number) < (value.anchor.start as number) || typeof value.anchor.original !== 'string' ||
      value.anchor.original.length !== (value.anchor.end as number) - (value.anchor.start as number)) invalid();
  try {
    const uri = new URL(value.documentUri);
    const pathname = decodeURIComponent(uri.pathname);
    if (uri.protocol !== 'file:' || uri.hostname || uri.search || uri.hash || !pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('\\') || pathname.includes('\0')) invalid();
  } catch { invalid(); }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_RECORD_BYTES) invalid();
}

function keyFor(documentUri: string, sessionId: string): string {
  return createHash('sha256').update(JSON.stringify([documentUri, sessionId])).digest('hex');
}

function encode(record: RecoveryRecord): string {
  return JSON.stringify({ schema: 1, documentUri: record.documentUri, sessionId: record.sessionId, sequence: record.sequence,
    baseDigest: record.baseDigest, anchor: { start: record.anchor.start, end: record.anchor.end, original: record.anchor.original },
    draft: record.draft, updatedAt: record.updatedAt });
}

/** Shared validation and canonical serialization for VS Code filesystem providers. */
export { validate as validateRecoveryRecord, encode as encodeRecoveryRecord };

function inOrder<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const result = previous.then(work, work);
  const tail = result.then(() => undefined, () => undefined);
  queues.set(key, tail);
  void tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return result;
}

function isMissing(error: unknown): boolean { return isRecord(error) && error.code === 'ENOENT'; }

/**
 * No editor integration, automatic cleanup, retry, automatic replay, or remote
 * provider support. A successful write reports only file flush + rename;
 * it is not a claim of power-loss durability or a saved document. A failure
 * after rename (for example lock cleanup) can leave the new checkpoint visible;
 * callers must inspect the journal instead of assuming the old state remains.
 * Windows permissions follow the storage directory's inherited ACL; this
 * prototype does not verify that ACL. Mapped/network drives and parent path
 * redirection are not detected. The storage directory and its parents must be
 * trusted against concurrent mutation by an untrusted local process. A stale
 * lock is never automatically removed: its checkpoint can be read and a fresh
 * session may write a separate journal without deleting the old one.
 */
export class RecoveryJournal {
  private readonly directory: string;
  constructor(storageDirectory: string, private readonly io: RecoveryFileOps = fs) {
    if (!path.isAbsolute(storageDirectory) || (process.platform === 'win32' && !/^[a-z]:[\\/]/i.test(storageDirectory))) throw new RecoveryJournalError('invalid-storage');
    this.directory = path.resolve(storageDirectory, 'recovery-journal-v1');
    if (path.relative(path.resolve(storageDirectory), this.directory) !== 'recovery-journal-v1') throw new RecoveryJournalError('invalid-storage');
  }

  private async prepare(): Promise<void> {
    const root = path.dirname(this.directory);
    const rootStat = await this.io.lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new RecoveryJournalError('invalid-storage');
    try { await this.io.mkdir(this.directory, { mode: 0o700 }); }
    catch (error) { if (!isRecord(error) || error.code !== 'EEXIST') throw error; }
    const dirStat = await this.io.lstat(this.directory);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink() || (process.platform !== 'win32' && (dirStat.mode & 0o077) !== 0)) throw new RecoveryJournalError('invalid-storage');
  }

  private async readKey(key: string): Promise<RecoveryRecord | undefined> {
    const filename = path.join(this.directory, `${key}.json`);
    try {
      const info = await this.io.lstat(filename);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_RECORD_BYTES || (process.platform !== 'win32' && (info.mode & 0o077) !== 0)) throw new RecoveryJournalError('corrupt-record');
      const raw = await this.io.readFile(filename, 'utf8');
      let value: unknown;
      try { value = JSON.parse(raw); validate(value); }
      catch { throw new RecoveryJournalError('corrupt-record'); }
      if (keyFor(value.documentUri, value.sessionId) !== key) throw new RecoveryJournalError('corrupt-record');
      return value;
    } catch (error) { if (isMissing(error)) return undefined; throw error; }
  }

  private async locked<T>(key: string, work: () => Promise<T>): Promise<T> {
    const lockPath = path.join(this.directory, `${key}.lock`);
    const token = randomUUID();
    let lock: Awaited<ReturnType<typeof fs.open>>;
    try { lock = await this.io.open(lockPath, 'wx', 0o600); }
    catch (error) { if (isRecord(error) && error.code === 'EEXIST') throw new RecoveryJournalError('locked'); throw error; }
    let result: T | undefined;
    let failure: unknown;
    try { await lock.writeFile(token, 'utf8'); await lock.sync(); result = await work(); }
    catch (error) { failure = error; }
    try {
      await lock.close();
      // Cooperating writers do not replace locks. The token check detects some
      // replacements, but cannot make check-and-unlink atomic against a hostile
      // process that can modify this trusted directory concurrently.
      if (await this.io.readFile(lockPath, 'utf8') !== token) throw new RecoveryJournalError('locked');
      await this.io.unlink(lockPath);
    } catch (error) { if (!failure) failure = error; }
    if (failure) throw failure;
    return result as T;
  }

  async read(documentUri: string, sessionId: string): Promise<RecoveryRecord | undefined> {
    // Validate identity without exposing a separate permissive path parser.
    validate({ schema: 1, documentUri, sessionId, sequence: 0, baseDigest: '0'.repeat(64), anchor: { start: 0, end: 0, original: '' }, draft: '', updatedAt: '2026-01-01T00:00:00.000Z' });
    try { await this.prepare(); return await this.readKey(keyFor(documentUri, sessionId)); }
    catch (error) { if (error instanceof RecoveryJournalError) throw error; throw new RecoveryJournalError('storage-failure'); }
  }

  async write(record: RecoveryRecord): Promise<JournalWriteResult> {
    validate(record);
    // Capture exact bytes before awaiting: caller mutations must not change the operation.
    const encoded = encode(record);
    const captured = JSON.parse(encoded) as RecoveryRecord;
    const key = keyFor(captured.documentUri, captured.sessionId);
    return inOrder(path.join(this.directory, key), async () => {
      try {
        await this.prepare();
        return await this.locked(key, async () => {
          const previous = await this.readKey(key);
          if (previous && captured.sequence < previous.sequence) throw new RecoveryJournalError('stale-sequence');
          if (previous && captured.sequence === previous.sequence) {
            if (encode(previous) !== encoded) throw new RecoveryJournalError('sequence-conflict');
            return { sequence: captured.sequence, result: 'unchanged', durability: 'unverified' };
          }
          const temp = path.join(this.directory, `${key}.${randomUUID()}.tmp`);
          const target = path.join(this.directory, `${key}.json`);
          let created = false;
          try {
            const file = await this.io.open(temp, 'wx', 0o600);
            created = true;
            try { await file.writeFile(encoded, 'utf8'); await file.sync(); }
            finally { await file.close(); }
            await this.io.rename(temp, target);
            created = false;
          } finally {
            if (created) { try { await this.io.unlink(temp); } catch { /* The old checkpoint remains; orphan cleanup needs a policy. */ } }
          }
          return { sequence: captured.sequence, result: 'written', durability: 'unverified' };
        });
      } catch (error) { if (error instanceof RecoveryJournalError) throw error; throw new RecoveryJournalError('storage-failure'); }
    });
  }

  /**
   * Explicitly discard one reviewed checkpoint only if its sequence has not
   * changed since it was shown. Cooperating writers use the same lock and
   * queue, so a later checkpoint cannot be removed by an older UI action.
   * Unknown locks and corrupt records are never removed as a side effect.
   */
  async discard(documentUri: string, sessionId: string, expectedSequence: number): Promise<'discarded' | 'missing' | 'changed'> {
    validate({ schema: 1, documentUri, sessionId, sequence: expectedSequence, baseDigest: '0'.repeat(64), anchor: { start: 0, end: 0, original: '' }, draft: '', updatedAt: '2026-01-01T00:00:00.000Z' });
    const key = keyFor(documentUri, sessionId);
    return inOrder(path.join(this.directory, key), async () => {
      try {
        await this.prepare();
        return await this.locked(key, async () => {
          const current = await this.readKey(key);
          if (!current) return 'missing';
          if (current.sequence !== expectedSequence) return 'changed';
          await this.io.unlink(path.join(this.directory, `${key}.json`));
          return 'discarded';
        });
      } catch (error) { if (error instanceof RecoveryJournalError) throw error; throw new RecoveryJournalError('storage-failure'); }
    });
  }

  /** Report checkpoints and opaque diagnostic names; locks and temp files may still belong to live writers. */
  async list(): Promise<{ records: RecoveryRecord[]; unreadable: string[]; locks: string[]; temporary: string[] }> {
    try {
      await this.prepare();
      const entries = await this.io.readdir(this.directory);
      const records: RecoveryRecord[] = [];
      const unreadable: string[] = [];
      for (const filename of entries.filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).sort()) {
        const key = filename.slice(0, 64);
        try { const record = await this.readKey(key); if (record) records.push(record); }
        catch { unreadable.push(key); }
      }
      const locks = entries.filter((name) => /^[a-f0-9]{64}\.lock$/.test(name)).sort();
      const temporary = entries.filter((name) => /^[a-f0-9]{64}\.[a-f0-9-]{36}\.tmp$/.test(name)).sort();
      return { records, unreadable, locks, temporary };
    } catch (error) { if (error instanceof RecoveryJournalError) throw error; throw new RecoveryJournalError('storage-failure'); }
  }
}
