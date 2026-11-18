import { inlinePrefix } from './inlineEditing';
import { splitParagraph } from './splitParagraph';

/** A source position is always bound to a particular document and projection. */
export interface SplitRequest {
  id: string;
  documentId: string;
  projectionId: string;
  version: number;
  source: string;
  start: number;
  end: number;
  original: string;
  blockType: 'paragraph_open' | 'list_item_inline';
  selectionStart: number;
  selectionEnd: number;
  eol: '\n' | '\r\n';
}

export interface SplitDraft { value: string; selectionStart: number; selectionEnd: number; composing: boolean }
export interface SplitTransaction {
  request: SplitRequest;
  status: 'awaiting-split' | 'split-applied' | 'conflict';
  split: { start: number; end: number; replacement: string; resultingSource: string; rightStart: number; rightOriginal: string };
  draft: SplitDraft;
  appliedVersion?: number;
}
export type DraftPlan =
  | { status: 'wait' | 'conflict' | 'unchanged' }
  | { status: 'ready'; version: number; start: number; end: number; expected: string; text: string; selectionStart: number; selectionEnd: number };

function validBoundary(value: string, offset: number): boolean {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > value.length) return false;
  // A browser selection offset can bisect a UTF-16 surrogate pair. Never split it.
  return !(offset > 0 && offset < value.length && /[\uD800-\uDBFF]/.test(value[offset - 1]) && /[\uDC00-\uDFFF]/.test(value[offset]));
}

/**
 * Pure planning only. The host must obtain the range from the active, validated
 * projection, serialize this operation with other edits, and guard document
 * version immediately before applying it. Text equality alone is not identity.
 */
export function prepareSplit(request: SplitRequest): SplitTransaction | undefined {
  const { source, start, end, original, blockType, selectionStart, selectionEnd, eol } = request;
  if (!request.id || !request.documentId || !request.projectionId || !Number.isSafeInteger(request.version) || request.version < 0 ||
      !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > source.length ||
      (start > 0 && source[start - 1] !== '\n' && source[start - 1] !== '\r') ||
      (end < source.length && source[end] !== '\n' && source[end] !== '\r') || source.slice(start, end) !== original ||
      (eol !== '\n' && eol !== '\r\n')) return undefined;
  const prefix = inlinePrefix(original, blockType);
  if (prefix === undefined) return undefined;
  const value = original.slice(prefix.length);
  if (!validBoundary(value, selectionStart) || !validBoundary(value, selectionEnd) || selectionEnd < selectionStart) return undefined;
  const replacement = splitParagraph(original, blockType, selectionStart, selectionEnd, eol);
  if (replacement === undefined) return undefined;
  const rightOriginal = value.slice(selectionEnd);
  const nextPrefix = blockType === 'list_item_inline' ? prefix.replace(/\[[xX]\]/, '[ ]') : '';
  const separator = blockType === 'paragraph_open' ? eol + eol : eol;
  const rightStart = start + prefix.length + selectionStart + separator.length + nextPrefix.length;
  return {
    request: { ...request }, status: 'awaiting-split',
    split: { start, end, replacement, resultingSource: source.slice(0, start) + replacement + source.slice(end), rightStart, rightOriginal },
    draft: { value: rightOriginal, selectionStart: 0, selectionEnd: 0, composing: false },
  };
}

/** Preserve the entire provisional right block, including an in-progress IME composition. */
export function updateSplitDraft(transaction: SplitTransaction, draft: SplitDraft): SplitTransaction | undefined {
  if (typeof draft.value !== 'string' || /[\r\n]/.test(draft.value) || typeof draft.composing !== 'boolean' ||
      !validBoundary(draft.value, draft.selectionStart) || !validBoundary(draft.value, draft.selectionEnd) || draft.selectionEnd < draft.selectionStart) return undefined;
  return { ...transaction, draft: { ...draft } };
}

/** Match an acknowledgement to one exact operation and resulting document revision. */
export function acknowledgeSplit(transaction: SplitTransaction, ack: { id: string; documentId: string; projectionId: string; version: number; source: string }): SplitTransaction {
  if (transaction.status !== 'awaiting-split') return transaction;
  if (ack.id !== transaction.request.id) return transaction;
  if (ack.documentId !== transaction.request.documentId || ack.projectionId !== transaction.request.projectionId ||
      ack.version !== transaction.request.version + 1 || ack.source !== transaction.split.resultingSource) return { ...transaction, status: 'conflict' };
  return { ...transaction, status: 'split-applied', appliedVersion: ack.version };
}

/** Never replay provisional text into a different or externally changed document. */
export function planSplitDraft(transaction: SplitTransaction, current: { documentId: string; version: number; source: string }): DraftPlan {
  if (transaction.status === 'conflict') return { status: 'conflict' };
  if (transaction.status !== 'split-applied' || transaction.draft.composing) return { status: 'wait' };
  if (current.documentId !== transaction.request.documentId || current.version !== transaction.appliedVersion || current.source !== transaction.split.resultingSource) return { status: 'conflict' };
  if (transaction.draft.value === transaction.split.rightOriginal) return { status: 'unchanged' };
  return { status: 'ready', version: current.version, start: transaction.split.rightStart, end: transaction.split.rightStart + transaction.split.rightOriginal.length,
    expected: transaction.split.rightOriginal, text: transaction.draft.value, selectionStart: transaction.draft.selectionStart, selectionEnd: transaction.draft.selectionEnd };
}
