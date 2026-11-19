import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderMarkdown } from '../../../apps/vscode-extension/src/renderMarkdown';
import { markdownClient } from '../../../apps/vscode-extension/src/markdownWebview';

describe('nested list source guidance', () => {
  function setup() {
    const html = renderMarkdown('- Parent\n  - Child\n    - **Grandchild**\n- Peer\n', value => value, 'Write', 'Checklist', 'Edit in source.');
    const dom = new JSDOM(`<button id="source">Open source</button><main>${html}</main>`, { runScripts: 'outside-only' });
    const sent: {type: string}[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: {type: string}) => sent.push(event) }), editorConfig: { version: 1, labels: { nestedHint: 'Edit in source.', source: 'Open source' } } });
    dom.window.eval(markdownClient);
    return { dom, sent };
  }
  it('tags nested items only and provides one source action on click', () => {
    const { dom, sent } = setup();
    const items = dom.window.document.querySelectorAll('li');
    expect([...items].map(item => item.hasAttribute('data-nested-source'))).toEqual([false, false, true, false]);
    const nested = items[2]; expect(nested.getAttribute('tabindex')).toBe('0'); expect(nested.getAttribute('aria-description')).toBe('Edit in source.');
    nested.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    nested.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const notes = nested.querySelectorAll(':scope > [data-nested-hint]');
    expect(notes).toHaveLength(1); expect(notes[0].textContent).toContain('Edit in source.');
    notes[0].querySelector('button')!.click(); expect(sent.at(-1)).toMatchObject({type: 'source'});
    dom.window.close();
  });
  it('edits safe leaf items including nested checklists and preserves rich items in source mode', () => {
    const html=renderMarkdown('- Parent\n  - Leaf\n\n  - **Rich**\n  - [ ] Check\n  - \n', value=>value, 'Write', 'Checklist', 'Edit in source.');
    const dom=new JSDOM(`<main>${html}</main>`); const items=[...dom.window.document.querySelectorAll('li')];
    expect(items[1].querySelector('[data-inline-original="  - Leaf"]')).toBeTruthy();
    expect(items[1].hasAttribute('data-nested-source')).toBe(false);
    expect(items[2].hasAttribute('data-nested-source')).toBe(true);
    expect(items[3].hasAttribute('data-nested-source')).toBe(false);
    expect(items[3].querySelector('[data-inline-original]')?.getAttribute('data-inline-original')).toBe('  - [ ] Check');
    expect(items[3].querySelector('input[data-checklist-line="4"]')).toBeTruthy();
    expect(items[4].querySelector('[data-inline-original="  - "]')).toBeTruthy();
    expect(items[4].hasAttribute('data-nested-source')).toBe(false); dom.window.close();
  });
  it('recognizes a leaf followed by a blank line and a top-level checklist', () => {
    const html=renderMarkdown('- Parent item\n  - Nested item\n\n- [x] Finished task\n', value=>value, 'Write', 'Checklist', 'Edit in source.');
    const dom=new JSDOM(`<main>${html}</main>`);
    expect(dom.window.document.querySelector('[data-inline-original="  - Nested item"]')).toBeTruthy();
    expect(dom.window.document.querySelector('[data-inline-original="  - Nested item"]')!.closest('li')!.hasAttribute('data-nested-source')).toBe(false); dom.window.close();
  });
  it('makes an empty nested checklist leaf editable and toggleable', () => {
    const html=renderMarkdown('- Parent\n  - [ ] \n', value=>value, 'Write', 'Checklist', 'Edit in source.');
    const dom=new JSDOM(`<main>${html}</main>`);
    const item=dom.window.document.querySelectorAll('li')[1];
    expect(item.querySelector('input[data-checklist-line="1"]')).toBeTruthy();
    expect(item.querySelector('[data-inline-original]')?.getAttribute('data-inline-original')).toBe('  - [ ] ');
    expect(item.hasAttribute('data-nested-source')).toBe(false); dom.window.close();
  });
  it('allows keyboard users to reveal the source action', () => {
    const { dom } = setup(); const nested = dom.window.document.querySelector<HTMLElement>('[data-nested-source]')!;
    nested.focus(); const enter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    nested.dispatchEvent(enter); expect(enter.defaultPrevented).toBe(true);
    expect(nested.querySelector('[role=status] button')?.textContent).toBe('Open source'); dom.window.close();
  });
});
