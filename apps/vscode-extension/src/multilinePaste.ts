import { inlinePrefix } from './inlineEditing';

/** Plan one atomic multiline plain-text replacement in a simple one-line block.
 * Unsupported Markdown is rejected rather than interpreted or rewritten. */
export function createPastePlanner(prefixFor: typeof inlinePrefix) {
 return function planMultilinePaste(line: string, blockType: string, start: number, end: number, text: string, eol: string): string | undefined {
  if (!['paragraph_open', 'list_item_inline'].includes(blockType) || (eol !== '\n' && eol !== '\r\n') ||
      text.length > 10000 || !/[\r\n]/.test(text) || /\0/.test(text)) return undefined;
  const prefix = prefixFor(line, blockType);
  if (prefix === undefined) return undefined;
  const value = line.slice(prefix.length);
  const boundary = (offset: number) => Number.isSafeInteger(offset) && offset >= 0 && offset <= value.length &&
    !(offset > 0 && offset < value.length && /[\uD800-\uDBFF]/.test(value[offset - 1]) && /[\uDC00-\uDFFF]/.test(value[offset]));
  if (!boundary(start) || !boundary(end) || start > end) return undefined;
  const segments = text.replace(/\r\n?/g, '\n').split('\n');
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
export const planMultilinePaste = createPastePlanner(inlinePrefix);
