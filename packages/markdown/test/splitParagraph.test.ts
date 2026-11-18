import { describe, expect, it } from 'vitest';
import { splitParagraph } from '../../../apps/vscode-extension/src/splitParagraph';

describe('split a simple paragraph at the selection', () => {
  it('splits at the start, middle and end and replaces a selection', () => {
    expect(splitParagraph('hello', 'paragraph_open', 0, 0, '\n')).toBe('\n\nhello');
    expect(splitParagraph('hello', 'paragraph_open', 2, 2, '\n')).toBe('he\n\nllo');
    expect(splitParagraph('hello', 'paragraph_open', 5, 5, '\n')).toBe('hello\n\n');
    expect(splitParagraph('hello', 'paragraph_open', 1, 4, '\r\n')).toBe('h\r\n\r\no');
  });
  it('keeps unsupported or invalid content untouched', () => {
    expect(splitParagraph('bold **text**', 'paragraph_open', 4, 4, '\n')).toBeUndefined();
    expect(splitParagraph('A &amp; B', 'paragraph_open', 3, 3, '\n')).toBeUndefined();
    expect(splitParagraph('# Heading', 'heading_open', 2, 2, '\n')).toBeUndefined();
    expect(splitParagraph('abc', 'paragraph_open', 4, 4, '\n')).toBeUndefined();
  });
  it('never splits a surrogate pair or changes a new paragraph into a Markdown block', () => {
    expect(splitParagraph('a😀b', 'paragraph_open', 2, 2, '\n')).toBeUndefined();
    expect(splitParagraph('a😀b', 'paragraph_open', 1, 3, '\n')).toBe('a\n\nb');
    expect(splitParagraph('plain - list', 'paragraph_open', 6, 6, '\n')).toBeUndefined();
    expect(splitParagraph('plain # title', 'paragraph_open', 6, 6, '\n')).toBeUndefined();
    expect(splitParagraph('hello', 'paragraph_open', 2, 2, '\r')).toBeUndefined();
  });
});

describe('split a simple list item', () => {
  it('preserves the marker and selection while clearing the new checklist', () => {
    expect(splitParagraph('- hello', 'list_item_inline', 0, 0, '\n')).toBe('- \n- hello');
    expect(splitParagraph('2) hello', 'list_item_inline', 2, 2, '\r\n')).toBe('2) he\r\n2) llo');
    expect(splitParagraph('* [X] hello', 'list_item_inline', 1, 4, '\n')).toBe('* [X] h\n* [ ] o');
    expect(splitParagraph('+ hello', 'list_item_inline', 5, 5, '\n')).toBe('+ hello\n+ ');
    expect(splitParagraph('- **hello**', 'list_item_inline', 1, 1, '\n')).toBeUndefined();
    expect(splitParagraph('- hello', 'list_item_inline', 6, 6, '\n')).toBeUndefined();
  });
  it('rejects a split that would create a nested list or split an emoji', () => {
    expect(splitParagraph('- first - nested', 'list_item_inline', 6, 6, '\n')).toBeUndefined();
    expect(splitParagraph('- a😀b', 'list_item_inline', 2, 2, '\n')).toBeUndefined();
    expect(splitParagraph('- a😀b', 'list_item_inline', 1, 3, '\n')).toBe('- a\n- b');
  });
});
