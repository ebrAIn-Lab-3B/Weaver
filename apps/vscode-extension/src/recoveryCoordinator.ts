import { createHash, randomUUID } from 'node:crypto';
import type { JournalWriteResult, RecoveryRecord } from './recoveryJournal';

/** A backend may use either native local files or a VS Code filesystem provider. */
export interface RecoveryStore {
  write(record: RecoveryRecord): Promise<JournalWriteResult>;
  list(): Promise<{ records: RecoveryRecord[]; unreadable: string[]; locks: string[]; temporary: string[] }>;
  discard(documentUri: string, sessionId: string, expectedSequence: number): Promise<'discarded' | 'missing' | 'changed'>;
}

/**
 * Host-side interface for a single editable block. A separate session is
 * required per block and per editor panel; offsets belong to the supplied
 * base source and are never used to apply a recovery automatically.
 */
export interface DraftSnapshot {
  source: string;
  start: number;
  end: number;
  draft: string;
}

export interface RecoveryCheckpoint extends JournalWriteResult {
  sessionId: string;
  /** This is neither a saved document nor a power-loss durability promise. */
  documentSaved: false;
}

export class RecoverySession {
  readonly sessionId = randomUUID();
  private sequence = 0;

  constructor(private readonly journal: RecoveryStore, readonly documentUri: string) {}

  /** Sequence numbers are reserved before asynchronous IO starts. */
  async checkpoint(snapshot: DraftSnapshot): Promise<RecoveryCheckpoint> {
    const { source, start, end, draft } = snapshot;
    if (typeof source !== 'string' || typeof draft !== 'string' || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > source.length) {
      throw new Error('Invalid recovery snapshot');
    }
    if (!Number.isSafeInteger(this.sequence + 1)) throw new Error('Recovery sequence exhausted');
    const sequence = ++this.sequence;
    const record: RecoveryRecord = {
      schema: 1, documentUri: this.documentUri, sessionId: this.sessionId, sequence,
      baseDigest: createHash('sha256').update(source, 'utf8').digest('hex'),
      anchor: { start, end, original: source.slice(start, end) }, draft,
      updatedAt: new Date().toISOString(),
    };
    const written = await this.journal.write(record);
    return { ...written, sessionId: this.sessionId, documentSaved: false };
  }
}

/**
 * Recovery is always review-only: callers may present/open the draft, but no
 * operation in this class edits the original document or discards records.
 */
export class RecoveryCoordinator {
  constructor(private readonly journal: RecoveryStore) {}

  begin(documentUri: string): RecoverySession { return new RecoverySession(this.journal, documentUri); }

  async review(documentUri: string): Promise<{ records: RecoveryRecord[]; unreadableCount: number; lockCount: number; temporaryCount: number }> {
    const { records, unreadable, locks, temporary } = await this.journal.list();
    return {
      records: records.filter((record) => record.documentUri === documentUri),
      // These counts describe the complete journal, not just this document.
      // A lock or temporary file may still belong to a live writer.
      unreadableCount: unreadable.length, lockCount: locks.length, temporaryCount: temporary.length,
    };
  }

  /** Include records whose original file was moved or deleted, for explicit review. */
  async reviewAll(): Promise<{ records: RecoveryRecord[]; unreadableCount: number; lockCount: number; temporaryCount: number }> {
    const { records, unreadable, locks, temporary } = await this.journal.list();
    return { records, unreadableCount: unreadable.length, lockCount: locks.length, temporaryCount: temporary.length };
  }

  /** Only call following an explicit user discard of the exact displayed record. */
  async discard(record: RecoveryRecord): Promise<'discarded' | 'missing' | 'changed'> {
    return this.journal.discard(record.documentUri, record.sessionId, record.sequence);
  }
}
