import { inlinePrefix } from './inlineEditing';

/** Split a plain paragraph at a UTF-16 selection without touching neighboring Markdown. */
export function splitParagraph(line: string, blockType: string, start: number, end: number, eol: string): string | undefined {
  const prefix = inlinePrefix(line, blockType);
  if (prefix === undefined || !['paragraph_open', 'list_item_inline'].includes(blockType)) return undefined;
  const value = line.slice(prefix.length);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > value.length) return undefined;
  if (blockType === 'paragraph_open') return value.slice(0, start) + eol + eol + value.slice(end);
  const nextPrefix = prefix.replace(/\[[xX]\]/, '[ ]');
  return prefix + value.slice(0, start) + eol + nextPrefix + value.slice(end);
}
