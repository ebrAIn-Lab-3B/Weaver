import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { markdownClient } from '../../../apps/vscode-extension/src/markdownWebview';
import { t } from '../src/i18n';

function editor(labels: Record<string, string> = { menu: 'Blocks', heading: 'Heading', bullet: 'Bullet list', checklist: 'Checklist', code: 'Code block' }) {
  const dom = new JSDOM('<button id="source"></button><main><div class="insert-slot" data-insert-line="0"><div class="insert-field" contenteditable="plaintext-only"></div></div></main>', { runScripts: 'outside-only' });
  const sent: Record<string, unknown>[] = [];
  Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { version: 1, labels } });
  dom.window.eval(markdownClient);
  const field = dom.window.document.querySelector<HTMLElement>('.insert-field')!;
  field.focus();
  const input = (value: string) => { field.textContent = value; field.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
  const key = (value: string) => field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  return { dom, sent, field, input, key };
}

describe('slash menu interaction', () => {
  it.each(['heading', 'bullet', 'checklist', 'code'])('selects %s with keyboard and mouse', kind => {
    const kinds=['heading','bullet','checklist','code'];
    const keyboard=editor(); keyboard.input('/');
    for (let i=0;i<kinds.indexOf(kind);i++) keyboard.key('ArrowDown');
    keyboard.key('Enter'); expect(keyboard.sent.at(-1)).toMatchObject({type:'slot-change',kind}); keyboard.dom.window.close();
    const mouse=editor(); mouse.input('/');
    mouse.dom.window.document.getElementById('slash-option-'+kind)!.click();
    expect(mouse.sent.at(-1)).toMatchObject({type:'slot-change',kind}); mouse.dom.window.close();
  });
  it('filters localized Korean labels and supports keyboard selection', () => {
    const {dom,sent,input,key}=editor({menu:t('ui.markdown.slash-menu','ko'),heading:t('ui.markdown.heading','ko'),bullet:t('ui.markdown.bullet','ko'),checklist:t('ui.markdown.checklist','ko'),code:t('ui.markdown.code','ko')});
    input('/체크'); expect([...dom.window.document.querySelectorAll('[role=option]')].map(node=>node.textContent)).toEqual(['체크리스트']);
    key('Enter'); expect(sent.at(-1)).toMatchObject({type:'slot-change',kind:'checklist'}); dom.window.close();
  });
  it('exposes the selected option and clears accessibility state on dismissal', () => {
    const {dom, field, input, key}=editor();
    input('/');
    expect(field.getAttribute('role')).toBe('combobox');
    expect(field.getAttribute('aria-expanded')).toBe('true');
    expect(field.getAttribute('aria-controls')).toBe(dom.window.document.querySelector('[role=listbox]')?.id);
    expect(field.getAttribute('aria-activedescendant')).toBe('slash-option-heading');
    key('ArrowDown');
    expect(field.getAttribute('aria-activedescendant')).toBe('slash-option-bullet');
    expect(dom.window.document.getElementById(field.getAttribute('aria-activedescendant')!)?.getAttribute('aria-selected')).toBe('true');
    key('Escape');
    expect(field.getAttribute('role')).toBe('textbox');
    expect(field.hasAttribute('aria-activedescendant')).toBe(false);
    expect(field.hasAttribute('aria-controls')).toBe(false);
    dom.window.close();
  });
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
