import { inlinePrefix } from './inlineEditing';

/** Split a plain paragraph at a UTF-16 selection without touching neighboring Markdown. */
export function splitParagraph(line: string, blockType: string, start: number, end: number, eol: string): string | undefined {
  const prefix = inlinePrefix(line, blockType);
  if (prefix === undefined || !['paragraph_open', 'heading_open', 'list_item_inline'].includes(blockType)) return undefined;
  const value = line.slice(prefix.length);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > value.length || (eol !== '\n' && eol !== '\r\n')) return undefined;
  const insideSurrogate = (offset: number): boolean => offset > 0 && offset < value.length && /[\uD800-\uDBFF]/.test(value[offset - 1]) && /[\uDC00-\uDFFF]/.test(value[offset]);
  if (insideSurrogate(start) || insideSurrogate(end)) return undefined;
  const left = value.slice(0, start), right = value.slice(end);
  if (blockType === 'heading_open') {
    // A split at the start needs a preceding paragraph rather than converting
    // the existing heading into plain text; leave that case to source mode.
    if (!left || inlinePrefix(right, 'paragraph_open') === undefined) return undefined;
    return prefix + left + eol + eol + right;
  }
  if (blockType === 'paragraph_open') {
    // A split may move a Markdown marker to the start of the new paragraph.
    // Refuse rather than silently convert the user's plain text into a heading or list.
    if (inlinePrefix(left, blockType) === undefined || inlinePrefix(right, blockType) === undefined) return undefined;
    return left + eol + eol + right;
  }
  const nextPrefix = prefix.replace(/\[[xX]\]/, '[ ]');
  if (inlinePrefix(prefix + left, blockType) === undefined || inlinePrefix(nextPrefix + right, blockType) === undefined) return undefined;
  return prefix + left + eol + nextPrefix + right;
}
