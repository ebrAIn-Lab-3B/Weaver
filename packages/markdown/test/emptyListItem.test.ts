import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderMarkdown } from '../../../apps/vscode-extension/src/renderMarkdown';
import { markdownClient } from '../../../apps/vscode-extension/src/markdownWebview';

describe('empty list item after splitting', () => {
  for (const item of ['- ', '- [ ] ']) {
    it(`focuses the editable text in ${JSON.stringify(item)}`, () => {
      const html = renderMarkdown(`- first\n${item}`, (src) => src, 'Insert', 'Checklist');
      const dom = new JSDOM(`<button id="source"></button><main>${html}</main>`, { runScripts: 'outside-only' });
      Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage() {} }), editorConfig: { version: 1, focusTextLine: 1, labels: {} } });
      dom.window.eval(markdownClient);
      const editable = dom.window.document.querySelector('[data-inline-original][data-source-line="1"]');
      expect(editable).not.toBeNull();
      expect(dom.window.document.activeElement).toBe(editable);
      expect(dom.window.getSelection()?.anchorNode).toBe(editable);
      if (item.includes('[ ]')) {
        const checkbox = dom.window.document.querySelector('input[data-checklist-line="1"]')!;
        expect(checkbox).toHaveProperty('checked', false);
        expect(checkbox.getAttribute('aria-label')).toBe('Checklist');
      }
      dom.window.close();
    });
  }
});
