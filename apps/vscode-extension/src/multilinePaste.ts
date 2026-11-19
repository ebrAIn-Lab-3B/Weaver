import { inlinePrefix } from './inlineEditing';

/** Treat a single blank line between plain paragraphs as their separator. */
export function pasteParts(text: string, blockType: string): string[] | undefined {
  const parts = text.replace(/\r\n?/g, '\n').split('\n');
  if (blockType !== 'paragraph_open') return parts;
  if (!parts[0]?.trim() || !parts.at(-1)?.trim()) return undefined;
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i].trim() && (parts[i] !== '' || !parts[i - 1]?.trim() || !parts[i + 1]?.trim())) return undefined;
  }
  return parts.filter(part => part !== '');
}

/** Plan one atomic multiline plain-text replacement in a simple one-line block.
 * Unsupported Markdown is rejected rather than interpreted or rewritten. */
export function createPastePlanner(prefixFor: typeof inlinePrefix, splitParts: typeof pasteParts) {
 return function planMultilinePaste(line: string, blockType: string, start: number, end: number, text: string, eol: string): string | undefined {
  if (!['paragraph_open', 'list_item_inline'].includes(blockType) || (eol !== '\n' && eol !== '\r\n') ||
      text.length > 10000 || !/[\r\n]/.test(text) || /\0/.test(text)) return undefined;
  const prefix = prefixFor(line, blockType);
  if (prefix === undefined) return undefined;
  const value = line.slice(prefix.length);
  const boundary = (offset: number) => Number.isSafeInteger(offset) && offset >= 0 && offset <= value.length &&
    !(offset > 0 && offset < value.length && /[\uD800-\uDBFF]/.test(value[offset - 1]) && /[\uDC00-\uDFFF]/.test(value[offset]));
  if (!boundary(start) || !boundary(end) || start > end) return undefined;
  const segments = splitParts(text, blockType);
  if (!segments || segments.length < 2) return undefined;
  segments[0] = value.slice(0, start) + segments[0];
  segments[segments.length - 1] += value.slice(end);
  // Empty paragraphs and list items cannot round-trip unambiguously in this editor.
  if (segments.some(segment => !segment.trim())) return undefined;
  const nextPrefix = blockType === 'list_item_inline' ? prefix.replace(/\[[xX]\]/, '[ ]') : '';
  const result = segments.map((segment, index) => (index ? nextPrefix : prefix) + segment);
  if (result.some(item => prefixFor(item, blockType) === undefined)) return undefined;
  return result.join(blockType === 'paragraph_open' ? eol + eol : eol);
}

}
export const planMultilinePaste = createPastePlanner(inlinePrefix, pasteParts);
