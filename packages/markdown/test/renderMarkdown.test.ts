import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../../apps/vscode-extension/src/renderMarkdown';

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
});
