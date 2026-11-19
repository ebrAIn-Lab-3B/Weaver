import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderMarkdown } from '../../../apps/vscode-extension/src/renderMarkdown';
import { markdownClient } from '../../../apps/vscode-extension/src/markdownWebview';

describe('nested list source guidance', () => {
  function setup() {
    const html = renderMarkdown('- Parent\n  - Child\n    - Grandchild\n- Peer\n', value => value, 'Write', 'Checklist', 'Edit in source.');
    const dom = new JSDOM(`<button id="source">Open source</button><main>${html}</main>`, { runScripts: 'outside-only' });
    const sent: {type: string}[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: {type: string}) => sent.push(event) }), editorConfig: { version: 1, labels: { nestedHint: 'Edit in source.', source: 'Open source' } } });
    dom.window.eval(markdownClient);
    return { dom, sent };
  }
  it('tags nested items only and provides one source action on click', () => {
    const { dom, sent } = setup();
    const items = dom.window.document.querySelectorAll('li');
    expect([...items].map(item => item.hasAttribute('data-nested-source'))).toEqual([false, true, true, false]);
    const nested = items[1]; expect(nested.getAttribute('tabindex')).toBe('0'); expect(nested.getAttribute('aria-description')).toBe('Edit in source.');
    nested.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    nested.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const notes = nested.querySelectorAll(':scope > [data-nested-hint]');
    expect(notes).toHaveLength(1); expect(notes[0].textContent).toContain('Edit in source.');
    notes[0].querySelector('button')!.click(); expect(sent.at(-1)).toMatchObject({type: 'source'});
    dom.window.close();
  });
  it('allows keyboard users to reveal the source action', () => {
    const { dom } = setup(); const nested = dom.window.document.querySelector<HTMLElement>('[data-nested-source]')!;
    nested.focus(); const enter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    nested.dispatchEvent(enter); expect(enter.defaultPrevented).toBe(true);
    expect(nested.querySelector('[role=status] button')?.textContent).toBe('Open source'); dom.window.close();
  });
});
