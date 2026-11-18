import type { RecoveryRecord } from './recoveryJournal';
import type { RecoveryCoordinator } from './recoveryCoordinator';

export type RecoveryNotice = 'empty' | 'opened' | 'discarded' | 'changed' | 'missing' | 'diagnostics' | 'error';
export interface RecoveryReviewPort {
  chooseRecord(records: readonly RecoveryRecord[]): Promise<RecoveryRecord | undefined>;
  chooseAction(record: RecoveryRecord): Promise<'open' | 'discard' | undefined>;
  confirmDiscard(record: RecoveryRecord): Promise<boolean>;
  /** Open only in an unsaved document; this must not overwrite the original. */
  openDraft(text: string): Promise<void>;
  notify(notice: RecoveryNotice): Promise<void>;
}

/**
 * User-driven review; no automatic replay or cleanup. The caller supplies an
 * interactive UI and never exposes another document's records to it. A stale
 * delete is delegated to the journal's conditional, locked discard operation.
 */
export async function reviewRecoveryDrafts(
  coordinator: Pick<RecoveryCoordinator, 'review' | 'reviewAll' | 'discard'>,
  documentUri: string | undefined,
  ui: RecoveryReviewPort,
): Promise<void> {
  try {
    const result = documentUri === undefined ? await coordinator.reviewAll() : await coordinator.review(documentUri);
    if (result.unreadableCount || result.lockCount || result.temporaryCount) await ui.notify('diagnostics');
    if (!result.records.length) { await ui.notify('empty'); return; }
    const selected = await ui.chooseRecord(result.records);
    // Never trust a UI return object as authority for content or deletion.
    const record = result.records.find((item) => item.sessionId === selected?.sessionId && item.sequence === selected.sequence);
    if (!record) return;
    const action = await ui.chooseAction(record);
    if (action === 'open') {
      await ui.openDraft(record.draft);
      await ui.notify('opened');
    } else if (action === 'discard' && await ui.confirmDiscard(record)) {
      await ui.notify(await coordinator.discard(record));
    }
  } catch {
    // Details may contain document paths or draft text; never put them in UI/logs.
    await ui.notify('error');
  }
}
