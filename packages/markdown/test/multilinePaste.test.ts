import { describe, expect, it } from 'vitest';
import { planMultilinePaste } from '../../../apps/vscode-extension/src/multilinePaste';

describe('plan multiline plain text paste', () => {
  it('replaces a selection with separate paragraphs and preserves target line endings', () => {
    expect(planMultilinePaste('before AFTER', 'paragraph_open', 6, 7, 'one\ntwo', '\r\n')).toBe('beforeone\r\n\r\ntwoAFTER');
    expect(planMultilinePaste('abcd', 'paragraph_open', 1, 3, 'x\r\ny', '\n')).toBe('ax\n\nyd');
  });
  it('creates simple list items and clears subsequent checklist states', () => {
    expect(planMultilinePaste('- [x] after', 'list_item_inline', 0, 0, 'one\ntwo ', '\n')).toBe('- [x] one\n- [ ] two after');
    expect(planMultilinePaste('2) item', 'list_item_inline', 4, 4, ' X\rY', '\r\n')).toBe('2) item X\r\n2) Y');
  });
  it('accepts a single empty separator between plain paragraphs', () => {
    expect(planMultilinePaste('safe', 'paragraph_open', 4, 4, 'a\n\nb', '\n')).toBe('safea\n\nb');
    expect(planMultilinePaste('safe', 'paragraph_open', 4, 4, 'a\r\n\r\nb', '\r\n')).toBe('safea\r\n\r\nb');
  });
  it('refuses ambiguous blank lines, markup and invalid selections', () => {
    expect(planMultilinePaste('safe', 'paragraph_open', 4, 4, 'a\n\n\nb', '\n')).toBeUndefined();
    expect(planMultilinePaste('safe', 'paragraph_open', 4, 4, 'a\n \nb', '\n')).toBeUndefined();
    expect(planMultilinePaste('- item', 'list_item_inline', 0, 0, 'a\n\nb', '\n')).toBeUndefined();
    expect(planMultilinePaste('safe', 'paragraph_open', 0, 0, '# heading\ntext', '\n')).toBeUndefined();
    expect(planMultilinePaste('safe', 'paragraph_open', 0, 0, '**bold**\ntext', '\n')).toBeUndefined();
    expect(planMultilinePaste('- item', 'list_item_inline', 0, 0, '- nested\ntext', '\n')).toBeUndefined();
    expect(planMultilinePaste('a😀b', 'paragraph_open', 2, 2, 'x\ny', '\n')).toBeUndefined();
    expect(planMultilinePaste('# heading', 'heading_open', 0, 0, 'x\ny', '\n')).toBeUndefined();
  });
});
