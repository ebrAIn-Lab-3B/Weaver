import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../../apps/vscode-extension/src/renderMarkdown';
import { JSDOM } from 'jsdom';

describe('rendered Markdown editor', () => {
  it('renders common Markdown, preserves source lines, and resolves relative images', () => {
    const html = renderMarkdown('# Title\n\nParagraph\n\n- [x] Done\n\n![Alt](images/a.png)\n\n```mermaid\ngraph TD\nA-->B\n```', (src) => `safe:///${src}`);
    expect(html).toContain('data-source-line="0"');
    expect(html).toContain('data-source-type="paragraph_open"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('src="safe:///images/a.png"');
    expect(html).toContain('language-mermaid');
  });

  it('escapes raw HTML and leaves ordinary code as code', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n```js\nconst x = 1;\n```', (src) => src);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('language-js');
  });

  it('hides closed front matter without changing body source line numbers', () => {
    const source = '---\nid: REQ-001\ntitle: Internal metadata\n---\n# Body title\n\nParagraph\n\n```js\nx()\n```';
    const html = renderMarkdown(source, (src) => src, 'Write');
    expect(html).not.toContain('Internal metadata');
    expect(html).not.toContain('REQ-001');
    expect(html).not.toContain('<hr');
    expect(html).toMatch(/data-source-line="4"[^>]*>Body title<\/h1>/);
    expect(html).toMatch(/data-source-line="6"[^>]*>Paragraph<\/p>/);
    expect(html).toContain('data-insert-line="4"');
    expect(html).toContain('data-fence-editable="true" data-source-line="8"');
  });

  it('keeps unclosed front matter visible and does not offer edits inside it', () => {
    const html = renderMarkdown('---\nid: REQ-001\n\n# Still unclosed', (src) => src, 'Write');
    expect(html).toContain('REQ-001');
    expect(html).toContain('Still unclosed');
    expect(html).not.toContain('contenteditable=');
    expect(html).not.toContain('data-insert-line=');
  });

  it('does not hide ordinary content between thematic breaks', () => {
    const html = renderMarkdown('---\n\nSome ordinary text\n\n---\n\nAfter', (src) => src, 'Write');
    expect(html).toContain('Some ordinary text');
    expect(html).toContain('After');
  });

  it('preserves original line maps for CRLF and front matter with no body', () => {
    const source = '---\r\ntitle: internal\r\n...\r\n\r\n# Visible';
    const html = renderMarkdown(source, (src) => src, 'Write');
    expect(html).toContain('data-source-line="4"');
    expect(html).toContain('Visible');
    expect(html).not.toContain('title: internal');
    const frontMatterOnly = renderMarkdown('---\ntitle: internal\n---', (src) => src, 'Write');
    expect(frontMatterOnly).not.toContain('title: internal');
    expect(frontMatterOnly).toContain('data-insert-line="3"');
  });

  it('enables traceable top-level checkboxes only in the authoring view', () => {
    const source = '---\nid: REQ-001\n---\n\n- [ ] Plain & "quoted"\n- [x] **Rich**\n- parent\n  - [ ] nested\n\n> - [ ] quoted\n\n```md\n- [ ] code\n```';
    const html = renderMarkdown(source, (src) => src, 'Write');
    const dom = new JSDOM(html);
    const boxes = [...dom.window.document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
    expect(boxes).toHaveLength(4);
    expect(boxes[0].disabled).toBe(false);
    expect(boxes[0].dataset.checklistLine).toBe('4');
    expect(boxes[0].dataset.checklistExpected).toBe('- [ ] Plain & "quoted"');
    expect(boxes[0].getAttribute('aria-label')).toBe('Plain & "quoted"');
    expect(boxes[1].disabled).toBe(false);
    expect(boxes[1].checked).toBe(true);
    expect(boxes[1].dataset.checklistLine).toBe('5');
    expect(boxes[2].disabled).toBe(true);
    expect(boxes[3].disabled).toBe(true);
    const readOnly = new JSDOM(renderMarkdown('- [ ] Read only', (src) => src));
    expect(readOnly.window.document.querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
    dom.window.close(); readOnly.window.close();
  });
});
