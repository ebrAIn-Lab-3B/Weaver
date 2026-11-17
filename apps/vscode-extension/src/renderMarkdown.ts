import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';

/** Render without raw HTML and retain source lines for safe, targeted editing. */
export function renderMarkdown(text: string, imageUri: (source: string) => string): string {
  const md = new MarkdownIt({ html: false, linkify: true }).use(taskLists);
  md.core.ruler.push('weaver-source-lines', (state) => {
    for (const token of state.tokens) {
      if (token.map && token.nesting >= 0 && token.level === 0 && token.type.endsWith('_open')) {
        token.attrSet('data-source-line', String(token.map[0]));
        token.attrSet('data-source-end', String(token.map[1]));
        token.attrSet('data-source-type', token.type);
      }
    }
  });
  const originalImage = md.renderer.rules.image!;
  md.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const src = token.attrGet('src');
    if (typeof src === 'string' && src && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)) {
      try { token.attrSet('src', imageUri(src)); }
      catch { token.attrSet('src', ''); }
    }
    return originalImage(tokens, index, options, env, self);
  };
  return md.render(text);
}
