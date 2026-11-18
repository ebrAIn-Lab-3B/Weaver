import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { markdownClient } from '../../../apps/vscode-extension/src/markdownWebview';

describe('list text selection', () => {
  it('does not open the parent list source for editable text, but keeps the source fallback for unsupported content', () => {
    const dom = new JSDOM('<button id="source"></button><main><ul data-source-line="3"><li><span contenteditable="plaintext-only" data-inline-original="- one" data-source-line="3">one</span></li></ul><ul data-source-line="7"><li><strong>rich text</strong></li></ul></main>', { runScripts: 'outside-only' });
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { version: 1, labels: {} } });
    dom.window.eval(markdownClient);
    dom.window.document.querySelector('span')!.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
    expect(sent.filter((event) => event.type === 'edit')).toEqual([]);
    dom.window.document.querySelector('strong')!.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
    expect(sent.filter((event) => event.type === 'edit')).toEqual([{ type: 'edit', line: 7 }]);
    dom.window.close();
  });
});
