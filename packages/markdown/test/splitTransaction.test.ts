import { describe, expect, it } from 'vitest';
import { acknowledgeSplit, planSplitDraft, prepareSplit, updateSplitDraft, type SplitRequest, type SplitTransaction } from '../../../apps/vscode-extension/src/splitTransaction';

function request(source = 'hello', overrides: Partial<SplitRequest> = {}): SplitRequest {
  return { id: 'op1', documentId: 'doc', projectionId: 'view1', version: 4, source, start: 0, end: source.length,
    original: source, blockType: 'paragraph_open', selectionStart: 2, selectionEnd: 2, eol: '\n', ...overrides };
}
function ack(tx: SplitTransaction, overrides: Record<string, unknown> = {}) {
  return { id: tx.request.id, documentId: tx.request.documentId, projectionId: tx.request.projectionId,
    version: tx.request.version + 1, source: tx.split.resultingSource, ...overrides } as Parameters<typeof acknowledgeSplit>[1];
}
function draft(tx: SplitTransaction, value: string, composing = false) {
  return updateSplitDraft(tx, { value, selectionStart: value.length, selectionEnd: value.length, composing })!;
}

describe('isolated split transaction model', () => {
  it('preserves immediate typing until the split is acknowledged and replays it at the exact right range', () => {
    let tx = prepareSplit(request())!;
    tx = draft(tx, 'new llo');
    expect(planSplitDraft(tx, { documentId: 'doc', version: 4, source: 'hello' }).status).toBe('wait');
    tx = acknowledgeSplit(tx, ack(tx));
    const plan = planSplitDraft(tx, { documentId: 'doc', version: 5, source: tx.split.resultingSource });
    expect(plan).toEqual({ status: 'ready', version: 5, start: 4, end: 7, expected: 'llo', text: 'new llo', selectionStart: 7, selectionEnd: 7 });
    if (plan.status !== 'ready') throw new Error('expected edit');
    const result = tx.split.resultingSource.slice(0, plan.start) + plan.text + tx.split.resultingSource.slice(plan.end);
    expect(result).toBe('he\n\nnew llo');
    // The two inverse edits restore the split and original in reverse order.
    const undoDraft = result.slice(0, plan.start) + plan.expected + result.slice(plan.start + plan.text.length);
    expect(undoDraft).toBe('he\n\nllo');
    expect(undoDraft.slice(0, tx.split.start) + tx.request.original + undoDraft.slice(tx.split.start + tx.split.replacement.length)).toBe('hello');
  });

  it('targets an exact range among duplicate lines and rejects a stale range', () => {
    const tx = prepareSplit(request('Same\n\nSame', { start: 6, end: 10, original: 'Same', selectionStart: 2, selectionEnd: 2 }))!;
    expect(tx.split.resultingSource).toBe('Same\n\nSa\n\nme');
    expect(tx.split.rightStart).toBe(10);
    expect(prepareSplit(request('Same\n\nSame', { start: 5, end: 9, original: 'Same' }))).toBeUndefined();
    expect(prepareSplit(request('Same\n\nSame', { start: 6, end: 10, original: 'Other' }))).toBeUndefined();
    const conflict = acknowledgeSplit(draft(tx, 'my draft'), ack(tx, { version: 6 }));
    expect(conflict.status).toBe('conflict');
    expect(conflict.draft.value).toBe('my draft');
  });

  it('handles a selection, endpoints, checklist markers and CRLF offsets', () => {
    for (const [start, end, result] of [[0, 0, '\n\nhello'], [5, 5, 'hello\n\n'], [1, 4, 'h\n\no']] as const) {
      expect(prepareSplit(request('hello', { selectionStart: start, selectionEnd: end }))!.split.resultingSource).toBe(result);
    }
    const tx = prepareSplit(request('top\r\n* [X] hello', { start: 5, end: 16, original: '* [X] hello', blockType: 'list_item_inline', selectionStart: 1, selectionEnd: 4, eol: '\r\n' }))!;
    expect(tx.split.resultingSource).toBe('top\r\n* [X] h\r\n* [ ] o');
    expect(tx.split.resultingSource.slice(tx.split.rightStart)).toBe('o');
  });

  it('rejects a split inside a surrogate pair', () => {
    expect(prepareSplit(request('a😀b', { selectionStart: 2, selectionEnd: 2 }))).toBeUndefined();
    expect(prepareSplit(request('a😀b', { selectionStart: 3, selectionEnd: 3 }))!.split.resultingSource).toBe('a😀\n\nb');
  });

  it('waits for IME composition and preserves the draft through conflicts', () => {
    let tx = draft(prepareSplit(request())!, '한llo', true);
    tx = acknowledgeSplit(tx, ack(tx));
    expect(planSplitDraft(tx, { documentId: 'doc', version: 5, source: tx.split.resultingSource }).status).toBe('wait');
    tx = draft(tx, '한국llo');
    expect(planSplitDraft(tx, { documentId: 'doc', version: 5, source: tx.split.resultingSource }).status).toBe('ready');
    expect(planSplitDraft(tx, { documentId: 'doc', version: 6, source: tx.split.resultingSource }).status).toBe('conflict');
    expect(tx.draft.value).toBe('한국llo');
  });

  it('ignores unrelated acknowledgements and rejects mismatched revision, source, document or projection', () => {
    const tx = draft(prepareSplit(request())!, 'typed');
    expect(acknowledgeSplit(tx, ack(tx, { id: 'other' }))).toBe(tx);
    for (const change of [{ version: 6 }, { source: 'changed' }, { documentId: 'other' }, { projectionId: 'other' }]) {
      const rejected = acknowledgeSplit(tx, ack(tx, change));
      expect(rejected.status).toBe('conflict');
      expect(rejected.draft.value).toBe('typed');
    }
    const accepted = acknowledgeSplit(tx, ack(tx));
    expect(acknowledgeSplit(accepted, ack(tx))).toBe(accepted);
    expect(planSplitDraft(accepted, { documentId: 'other', version: 5, source: accepted.split.resultingSource }).status).toBe('conflict');
    expect(planSplitDraft(accepted, { documentId: 'doc', version: 5, source: 'different' }).status).toBe('conflict');
  });

  it('rejects invalid drafts and leaves an unchanged draft without another edit', () => {
    const tx = prepareSplit(request())!;
    expect(updateSplitDraft(tx, { value: 'a\nb', selectionStart: 0, selectionEnd: 0, composing: false })).toBeUndefined();
    expect(updateSplitDraft(tx, { value: '😀', selectionStart: 1, selectionEnd: 1, composing: false })).toBeUndefined();
    expect(updateSplitDraft(tx, { value: 'abc', selectionStart: 2, selectionEnd: 1, composing: false })).toBeUndefined();
    const applied = acknowledgeSplit(tx, ack(tx));
    expect(planSplitDraft(applied, { documentId: 'doc', version: 5, source: applied.split.resultingSource }).status).toBe('unchanged');
  });
});
