import { describe, expect, it, vi } from 'vitest';
import { reviewRecoveryDrafts, type RecoveryReviewPort } from '../../../apps/vscode-extension/src/recoveryReview';
import type { RecoveryRecord } from '../../../apps/vscode-extension/src/recoveryJournal';

const record: RecoveryRecord = { schema: 1, documentUri: 'file:///test.md', sessionId: 'one', sequence: 2,
  baseDigest: 'a'.repeat(64), anchor: { start: 0, end: 3, original: 'old' }, draft: 'private draft', updatedAt: '2026-11-18T15:00:00.000Z' };

function setup() {
  const coordinator = {
    review: vi.fn().mockResolvedValue({ records: [record], unreadableCount: 0, lockCount: 0, temporaryCount: 0 }),
    reviewAll: vi.fn().mockResolvedValue({ records: [record], unreadableCount: 0, lockCount: 0, temporaryCount: 0 }),
    discard: vi.fn().mockResolvedValue('discarded'),
  };
  const ui: RecoveryReviewPort = {
    chooseRecord: vi.fn().mockResolvedValue(record), chooseAction: vi.fn().mockResolvedValue('open'),
    confirmDiscard: vi.fn().mockResolvedValue(true), openDraft: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn().mockResolvedValue(undefined),
  };
  return { coordinator, ui };
}

describe('review recovery drafts', () => {
  it('opens the selected text as an unsaved document without deleting or applying it', async () => {
    const { coordinator, ui } = setup();
    await reviewRecoveryDrafts(coordinator, record.documentUri, ui);
    expect(coordinator.review).toHaveBeenCalledWith(record.documentUri);
    expect(ui.openDraft).toHaveBeenCalledWith('private draft');
    expect(ui.notify).toHaveBeenCalledWith('opened');
    expect(coordinator.discard).not.toHaveBeenCalled();
  });

  it('can explicitly review stored drafts even when their original document is unavailable', async () => {
    const { coordinator, ui } = setup();
    await reviewRecoveryDrafts(coordinator, undefined, ui);
    expect(coordinator.reviewAll).toHaveBeenCalledOnce();
    expect(coordinator.review).not.toHaveBeenCalled();
    expect(ui.openDraft).toHaveBeenCalledWith('private draft');
  });

  it('requires explicit confirmation and sends the exact selected revision to discard', async () => {
    const { coordinator, ui } = setup();
    vi.mocked(ui.chooseAction).mockResolvedValue('discard');
    vi.mocked(ui.confirmDiscard).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await reviewRecoveryDrafts(coordinator, record.documentUri, ui);
    expect(coordinator.discard).not.toHaveBeenCalled();
    await reviewRecoveryDrafts(coordinator, record.documentUri, ui);
    expect(coordinator.discard).toHaveBeenCalledWith(record);
    expect(ui.notify).toHaveBeenCalledWith('discarded');
  });

  it('does not delete a newer revision and reports it to the user', async () => {
    const { coordinator, ui } = setup();
    vi.mocked(ui.chooseAction).mockResolvedValue('discard');
    coordinator.discard.mockResolvedValue('changed');
    await reviewRecoveryDrafts(coordinator, record.documentUri, ui);
    expect(ui.notify).toHaveBeenCalledWith('changed');
    expect(ui.openDraft).not.toHaveBeenCalled();
  });

  it('uses the reviewed record rather than content forged by a UI response', async () => {
    const { coordinator, ui } = setup();
    vi.mocked(ui.chooseRecord).mockResolvedValue({ ...record, draft: 'forged' });
    await reviewRecoveryDrafts(coordinator, record.documentUri, ui);
    expect(ui.openDraft).toHaveBeenCalledWith('private draft');
    vi.mocked(ui.openDraft).mockClear();
    vi.mocked(ui.chooseRecord).mockResolvedValue({ ...record, sessionId: 'different' });
    await reviewRecoveryDrafts(coordinator, record.documentUri, ui);
    expect(ui.openDraft).not.toHaveBeenCalled();
  });

  it('reports diagnostics, empty results and failures without leaking exception text', async () => {
    const { coordinator, ui } = setup();
    coordinator.review.mockResolvedValueOnce({ records: [], unreadableCount: 1, lockCount: 1, temporaryCount: 0 });
    await reviewRecoveryDrafts(coordinator, record.documentUri, ui);
    expect(ui.notify).toHaveBeenCalledWith('diagnostics');
    expect(ui.notify).toHaveBeenCalledWith('empty');
    coordinator.review.mockRejectedValueOnce(new Error('sensitive path and draft'));
    await reviewRecoveryDrafts(coordinator, record.documentUri, ui);
    expect(ui.notify).toHaveBeenCalledWith('error');
    expect(vi.mocked(ui.notify).mock.calls.flat()).not.toContain('sensitive path and draft');
  });
});
