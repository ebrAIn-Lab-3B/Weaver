import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { markdownClient } from '../../../apps/vscode-extension/src/markdownWebview';

function editor() {
  const dom = new JSDOM('<button id="source"></button><main><div class="insert-slot" data-insert-line="0"><div class="insert-field" contenteditable="plaintext-only"></div></div></main>', { runScripts: 'outside-only' });
  const sent: Record<string, unknown>[] = [];
  Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { version: 1, labels: { menu: 'Blocks', heading: 'Heading', bullet: 'Bullet list', checklist: 'Checklist', code: 'Code block' } } });
  dom.window.eval(markdownClient);
  const field = dom.window.document.querySelector<HTMLElement>('.insert-field')!;
  field.focus();
  const input = (value: string) => { field.textContent = value; field.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
  const key = (value: string) => field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  return { dom, sent, field, input, key };
}

describe('slash menu interaction', () => {
  it('filters options and inserts a heading with the keyboard', () => {
    const { dom, sent, input, key } = editor();
    input('/head');
    expect([...dom.window.document.querySelectorAll('[role=option]')].map(node => node.textContent)).toEqual(['Heading']);
    key('Enter'); input('Title');
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-applied', version: 2, expected: '## ' } }));
    expect(sent.at(-1)).toMatchObject({ type: 'slot-change', kind: 'heading', value: 'Title' });
    expect(dom.window.document.querySelector('[role=listbox]')).toBeNull();
    dom.window.close();
  });
  it('navigates the menu and chooses a checklist with the keyboard', () => {
    const { dom, sent, input, key } = editor();
    input('/'); key('ArrowDown'); key('ArrowDown');
    expect(dom.window.document.querySelector('[aria-selected=true]')?.textContent).toBe('Checklist');
    key('Enter'); input('Task');
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-applied', version: 2, expected: '- [ ] ' } }));
    expect(sent.at(-1)).toMatchObject({ type: 'slot-change', kind: 'checklist', value: 'Task' });
    dom.window.close();
  });
  it('allows mouse selection of a code block', () => {
    const { dom, sent, input } = editor();
    input('/code');
    dom.window.document.querySelector<HTMLButtonElement>('[role=option]')!.click();
    input('code');
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-applied', version: 2, expected: '```\n\n```' } }));
    expect(sent.at(-1)).toMatchObject({ type: 'slot-change', kind: 'code', value: 'code' });
    dom.window.close();
  });
  it('dismisses the menu with Escape and retains a literal slash', () => {
    const { dom, sent, input, key } = editor();
    input('/'); key('Escape');
    expect(dom.window.document.querySelector('[role=listbox]')).toBeNull();
    expect(sent.at(-1)).toMatchObject({ type: 'slot-change', kind: 'paragraph', value: '/' });
    dom.window.close();
  });
  it('writes an unmatched slash string as literal text', () => {
    const { dom, sent, input } = editor();
    input('/not-a-command');
    expect(dom.window.document.querySelector('[role=listbox]')).toBeNull();
    expect(sent.at(-1)).toMatchObject({ type: 'slot-change', kind: 'paragraph', value: '/not-a-command' });
    dom.window.close();
  });
});
