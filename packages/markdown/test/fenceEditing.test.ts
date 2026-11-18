import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { fenceBody, planFenceBodyEdit } from '../../../apps/vscode-extension/src/fenceEditing';
import { renderMarkdown } from '../../../apps/vscode-extension/src/renderMarkdown';
import { markdownClient } from '../../../apps/vscode-extension/src/markdownWebview';

function apply(source: string, start: number, end: number, value: string): string | undefined {
  const edit = planFenceBodyEdit(source, start, end, value);
  return edit && source.slice(0, edit.start) + edit.text + source.slice(edit.end);
}

describe('safe fenced-code editing', () => {
  it('changes only the body and preserves the original delimiter, info, and surrounding document', () => {
    const source = '# Above\n\n````ts extra\nold\n```\nstill code\n````   \n\nAfter';
    expect(fenceBody(source, 2, 7)?.body).toBe('old\n```\nstill code\n');
    expect(apply(source, 2, 7, 'first\nsecond')).toBe('# Above\n\n````ts extra\nfirst\nsecond\n````   \n\nAfter');
    expect(apply(source, 2, 7, '')).toBe('# Above\n\n````ts extra\n````   \n\nAfter');
  });
  it('preserves CRLF for inserted content and never changes adjacent lines', () => {
    const source = 'Before\r\n\r\n~~~python\r\nold\r\n~~~~  \r\n\r\nAfter';
    expect(apply(source, 2, 5, 'new\nline')).toBe('Before\r\n\r\n~~~python\r\nnew\r\nline\r\n~~~~  \r\n\r\nAfter');
  });
  it('refuses a newly introduced closing fence and permits a shorter one', () => {
    const source = '````\nbody\n````';
    expect(planFenceBodyEdit(source, 0, 3, 'safe\n  ````\nunsafe')).toBeUndefined();
    expect(planFenceBodyEdit(source, 0, 3, 'safe\n```\nvalid')).toBeDefined();
    expect(planFenceBodyEdit('~~~\nbody\n~~~', 0, 3, '~~~~')).toBeUndefined();
  });
  it('leaves Mermaid, unclosed, indented, nested, and front-matter fences in source mode', () => {
    expect(fenceBody('```mermaid\ngraph TD\n```', 0, 3)).toBeUndefined();
    expect(fenceBody('```js\nunterminated', 0, 2)).toBeUndefined();
    expect(fenceBody('  ```js\n  content\n  ```', 0, 3)).toBeUndefined();
    expect(fenceBody('````\n```js\nnot a block\n```\n````', 1, 4)).toBeUndefined();
    expect(fenceBody('---\n```js\ncontent\n```\n---\n', 1, 4)).toBeUndefined();
    expect(fenceBody('---\n```js\ncontent\n```', 1, 4)).toBeUndefined();
  });
  it('marks safe fences without enabling a multiline editor, and leaves Mermaid unmarked', () => {
    const source = '```js\nconst x = 1;\n```\n\n```mermaid\ngraph TD\n```';
    const html = renderMarkdown(source, (src) => src, 'Write');
    expect(html).toContain('<code data-fence-editable="true" data-source-line="0" data-source-end="3" data-source-type="fence_code" class="language-js">');
    expect(html).toContain('<code class="language-mermaid">');
    expect(html).not.toContain('data-fence-editable="true" data-source-line="4"');
    expect(html.match(/data-fence-editable/g)).toHaveLength(1);
  });
  it('edits multiline text in place and flushes the edit before saving', () => {
    const markup = renderMarkdown('```js\nfirst\n```\n\n```mermaid\ngraph TD\n```', (src) => src, 'Write');
    const dom = new JSDOM(`<button id="source"></button><main>${markup}</main>`, { runScripts: 'outside-only' });
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { version: 1, labels: { conflict: 'Conflict', codeEdit: 'Edit code', fenceInvalid: 'Invalid fence' } } });
    dom.window.eval(markdownClient);
    (dom.window.document.querySelector('code[data-fence-editable]') as HTMLElement).click();
    const input = dom.window.document.querySelector('textarea[data-fence-input]') as HTMLTextAreaElement;
    expect(input.value).toBe('first\n');
    expect(input.getAttribute('aria-label')).toBe('Edit code');
    const enter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    const paste = new dom.window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'new\nlines' } });
    input.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(false);
    input.value = 'first\nsecond\n';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(sent.find((event) => event.type === 'fence-change')).toMatchObject({ line: 0, endLine: 3, expected: 'first\n', value: 'first\nsecond\n', version: 1 });
    input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(sent.some((event) => event.type === 'save')).toBe(false);
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-applied', version: 2, expected: 'first\nsecond\n' } }));
    expect(sent.slice(-2).map((event) => event.type)).toEqual(['finish', 'save']);
    expect(dom.window.document.querySelector('code.language-mermaid')!.hasAttribute('data-fence-editable')).toBe(false);
    dom.window.close();
  });
  it('retains a rejected draft and retries when the forbidden closing line is corrected', () => {
    const markup = renderMarkdown('```\nfirst\n```', (src) => src, 'Write');
    const dom = new JSDOM(`<button id="source"></button><main>${markup}</main>`, { runScripts: 'outside-only' });
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { version: 1, labels: { codeEdit: 'Edit code', fenceInvalid: 'Invalid fence' } } });
    dom.window.eval(markdownClient);
    (dom.window.document.querySelector('code[data-fence-editable]') as HTMLElement).click();
    const input = dom.window.document.querySelector('textarea')!;
    input.value = 'first\n```\n'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-invalid', detail: 'Invalid fence' } }));
    expect(input.value).toBe('first\n```\n');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    input.value = 'first\nfixed\n'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(sent.filter((event) => event.type === 'fence-change').at(-1)).toMatchObject({ version: 1, expected: 'first\n', value: 'first\nfixed\n' });
    dom.window.close();
  });
});
