import { afterEach, describe, expect, it, vi } from 'vitest';

const render = vi.hoisted(() => vi.fn());
vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render } }));

describe('Mermaid preview', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.resetModules(); });

  it('replaces a valid diagram and leaves an invalid one as readable source', async () => {
    const replaced = vi.fn();
    const insertError = vi.fn();
    const valid = { dataset: {}, replaceWith: replaced };
    const invalid = { dataset: {}, insertAdjacentElement: insertError };
    const document = {
      readyState: 'loading',
      addEventListener: vi.fn(),
      querySelectorAll: vi.fn(() => [
        { parentElement: valid, textContent: 'graph TD; A-->B' },
        { parentElement: invalid, textContent: 'invalid' },
      ]),
      createElement: () => ({ className: '', innerHTML: '', textContent: '' }),
    };
    vi.stubGlobal('document', document);
    vi.stubGlobal('navigator', { language: 'en' });
    render.mockResolvedValueOnce({ svg: '<svg></svg>' }).mockRejectedValueOnce(new Error('invalid'));
    const preview = await import('../../../apps/vscode-extension/src/markdownPreview.js');
    await preview.renderDiagrams();
    expect(document.querySelectorAll).toHaveBeenCalledWith('pre > code.language-mermaid');
    expect(replaced).toHaveBeenCalledWith(expect.objectContaining({ className: 'weaver-mermaid', innerHTML: '<svg></svg>' }));
    expect(insertError).toHaveBeenCalledWith('beforebegin', expect.objectContaining({
      className: 'weaver-mermaid-error',
      textContent: 'The Mermaid diagram could not be rendered. Its source is shown below.',
    }));
  });
});
