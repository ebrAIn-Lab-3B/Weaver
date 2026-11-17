import mermaid from 'mermaid';
import { en } from '../../../packages/markdown/src/i18n/en';
import { ko } from '../../../packages/markdown/src/i18n/ko';

// VS Code reloads contributed preview scripts when the preview content changes.
// Keep the original code visible until a diagram has rendered successfully.
export async function renderDiagrams() {
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true });
  const catalog = navigator.language.toLowerCase().startsWith('ko') ? ko : en;
  const blocks = document.querySelectorAll('pre > code.language-mermaid');
  for (let index = 0; index < blocks.length; index++) {
    const code = blocks[index];
    const pre = code.parentElement;
    if (!pre || pre.dataset.weaverDiagram) continue;
    pre.dataset.weaverDiagram = 'true';
    try {
      const result = await mermaid.render(`weaver-mermaid-${index}-${Date.now()}`, code.textContent || '');
      const figure = document.createElement('div');
      figure.className = 'weaver-mermaid';
      figure.innerHTML = result.svg;
      pre.replaceWith(figure);
    } catch {
      const error = document.createElement('p');
      error.className = 'weaver-mermaid-error';
      error.textContent = catalog['ui.preview.diagram-error'];
      pre.insertAdjacentElement('beforebegin', error);
    }
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void renderDiagrams(); });
  else void renderDiagrams();
}
