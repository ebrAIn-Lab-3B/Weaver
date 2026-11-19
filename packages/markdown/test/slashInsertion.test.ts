import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../../apps/vscode-extension/src/renderMarkdown';
import { planInsertion } from '../../../apps/vscode-extension/src/slashInsertion';
import { inlinePrefix } from '../../../apps/vscode-extension/src/inlineEditing';

const apply = (source: string, line: number, kind: 'heading' | 'bullet' | 'checklist' | 'code', value: string) => {
  const edit = planInsertion(source, line, kind, value)!;
  return source.slice(0, edit.offset) + edit.text + source.slice(edit.offset);
};

describe('slash insertion', () => {
  const source = '---\nid: REQ-001\n---\n\n# Title\n\n```mermaid\ngraph TD\nA-->B\n```\n\nAfter';
  it('offers block boundaries but never inside front matter or a diagram', () => {
    const html = renderMarkdown(source, (src) => src, 'Add');
    expect(html).toContain('data-insert-line="4"');
    expect(html).toContain('data-insert-line="6"');
    expect(html).toContain('data-insert-line="11"');
    expect(html).not.toContain('data-insert-line="1"');
    expect(planInsertion(source, 8, 'heading', 'Bad')).toBeUndefined();
    expect(planInsertion('---\nid: unfinished', 2, 'heading', 'Bad')).toBeUndefined();
    expect(renderMarkdown('---\ntitle: metadata\n---\n\nBody', (src) => src, 'Add')).not.toContain('data-inline-original="title: metadata"');
    expect(renderMarkdown('---\nid: unfinished\n\nBody', (src) => src, 'Add')).not.toContain('data-inline-original=');
    const noBlank = '---\nid: REQ-001\n---\n# Body';
    const edit = planInsertion(noBlank, 3, 'heading', 'Inserted');
    expect(edit).toBeDefined();
    expect(noBlank.slice(0, edit!.offset) + edit!.text + noBlank.slice(edit!.offset)).toBe('---\nid: REQ-001\n---\n\n## Inserted\n\n# Body');
  });
  it('inserts each block without changing surrounding source', () => {
    expect(apply(source, 6, 'heading', 'A')).toContain('## A\n\n```mermaid\ngraph TD\nA-->B\n```');
    expect(apply(source, 6, 'bullet', 'A')).toContain('- A\n\n```mermaid');
    expect(apply(source, 6, 'checklist', 'A')).toContain('- [ ] A\n\n```mermaid');
    expect(apply(source, 6, 'code', 'A')).toContain('```\nA\n```\n\n```mermaid');
  });
  it('chooses a code fence longer than any backtick run in the inserted code', () => {
    const input = 'A\n\nAfter';
    expect(apply(input, 2, 'code', '```')).toBe('A\n\n````\n```\n````\n\nAfter');
    expect(apply(input, 2, 'code', 'a````b')).toBe('A\n\n`````\na````b\n`````\n\nAfter');
  });
  it('preserves CRLF and supports an empty document and end of file', () => {
    expect(apply('', 1, 'heading', 'A')).toBe('## A\n');
    expect(apply('First\r\n\r\nSecond', 2, 'bullet', 'A')).toBe('First\r\n\r\n- A\r\n\r\nSecond');
    expect(apply('First', 1, 'heading', 'A')).toBe('First\n\n## A\n');
  });
  it('uses actual line offsets in mixed LF and CRLF documents without rewriting neighboring text', () => {
    const first = 'A\n\nB\r\n\r\nC';
    const firstEdit = planInsertion(first, 2, 'heading', 'Mid')!;
    expect(firstEdit.offset).toBe(3);
    expect(first.slice(0, firstEdit.offset) + firstEdit.text + first.slice(firstEdit.offset)).toBe('A\n\n## Mid\r\n\r\nB\r\n\r\nC');

    const second = 'A\r\n\r\nB\n\nC';
    const secondEdit = planInsertion(second, 4, 'bullet', 'Mid')!;
    expect(secondEdit.offset).toBe(8);
    expect(second.slice(0, secondEdit.offset) + secondEdit.text + second.slice(secondEdit.offset)).toBe('A\r\n\r\nB\n\n- Mid\r\n\r\nC');
  });
  it('rejects malformed requests and escapes insertion labels', () => {
    expect(planInsertion(source, 6, 'heading', 'A\nB')).toBeUndefined();
    expect(planInsertion(source, -1, 'heading', 'A')).toBeUndefined();
    expect(renderMarkdown('Hello', (src) => src, '<Add>')).toContain('&lt;Add&gt;');
  });
  it('exposes only simple one-line paragraphs and headings for direct editing', () => {
    expect(inlinePrefix('## Heading', 'heading_open')).toBe('## ');
    expect(inlinePrefix('plain text', 'paragraph_open')).toBe('');
    expect(inlinePrefix('some **bold** text', 'paragraph_open')).toBeUndefined();
    const html = renderMarkdown('# Heading\n\nplain text\n\n[link](https://example.org)\n\nline one\nline two', (src) => src, 'Write');
    expect(html).toContain('data-inline-original="# Heading"');
    expect(html).toContain('data-inline-original="plain text"');
    expect(html).not.toContain('data-inline-original="[link]');
    expect(html).not.toContain('data-inline-original="line one"');
    expect(html).not.toContain('insert-start');
  });
  it('edits simple list item text while preserving the source markers and checkbox state', () => {
    const markdown = '- first\n- [x] complete\n- [ ] unfinished\n1. numbered\n';
    const html = renderMarkdown(markdown, (src) => src, 'Write');
    expect(inlinePrefix('- first', 'list_item_inline')).toBe('- ');
    expect(inlinePrefix('- [x] complete', 'list_item_inline')).toBe('- [x] ');
    expect(inlinePrefix('- [ ] unfinished', 'list_item_inline')).toBe('- [ ] ');
    expect(inlinePrefix('1. numbered', 'list_item_inline')).toBe('1. ');
    expect(html).toContain('data-inline-original="- first"');
    expect(html).toContain('data-inline-original="- [x] complete"');
    expect(html).toContain('data-inline-original="- [ ] unfinished"');
    expect(html).toContain('data-inline-original="1. numbered"');
    // The checkbox is outside the editable text and carries its source line.
    expect(html).toMatch(/<input[^>]*data-checklist-line="1"[^>]*checked=""[^>]*> <span[^>]*data-inline-original="- \[x\] complete"[^>]*>complete<\/span>/);
  });
  it('edits simple nested leaves while leaving rich, continued, or encoded text in source mode', () => {
    const html = renderMarkdown('- **bold**\n- parent\n  - nested\n- first line\n  continuation\n- A &amp; B\n', (src) => src, 'Write');
    expect(html).not.toContain('data-inline-original="- **bold**"');
    expect(html).toContain('data-inline-original="  - nested"');
    expect(html).not.toContain('data-inline-original="- first line"');
    expect(html).not.toContain('data-inline-original="- A &amp;amp; B"');
    expect(inlinePrefix('- **bold**', 'list_item_inline')).toBeUndefined();
    expect(inlinePrefix('- A &amp; B', 'list_item_inline')).toBeUndefined();
  });
});
