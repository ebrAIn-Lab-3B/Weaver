import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { markdownSlotStyles } from '../../../apps/vscode-extension/src/markdownSlotStyles';

describe('rendered editor insertion hit areas', () => {
  it('constrains an unfocused slot before a checklist to its layout height', () => {
    const dom = new JSDOM(`<style>${markdownSlotStyles}</style><main><pre><code>code</code></pre><div class="insert-slot"><div class="insert-field" contenteditable="plaintext-only"></div></div><ul><li><input type="checkbox"></li></ul><div class="insert-slot"><div class="insert-field" contenteditable="plaintext-only"></div></div></main>`);
    const [beforeChecklist, last] = [...dom.window.document.querySelectorAll<HTMLElement>('.insert-field')];
    const style = dom.window.getComputedStyle(beforeChecklist);
    expect(style.height).toBe('4px');
    expect(style.maxHeight).toBe('4px');
    expect(style.lineHeight).toBe('4px');
    expect(style.overflow).toBe('hidden');
    expect(dom.window.getComputedStyle(last).maxHeight).not.toBe('4px');
    dom.window.close();
  });
});
