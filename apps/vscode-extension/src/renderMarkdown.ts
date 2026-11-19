import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import { inlinePrefix } from './inlineEditing';
import { fenceBody } from './fenceEditing';

/** Render without raw HTML and retain source lines for safe, targeted editing. */
export function renderMarkdown(text: string, imageUri: (source: string) => string, insertLabel?: string, emptyChecklistLabel?: string, nestedSourceHint?: string): string {
  const md = new MarkdownIt({ html: false, linkify: true }).use(taskLists);
  const lines = text.split(/\r?\n/);
  const hasFrontMatter = lines[0] === '---';
  const frontMatterEnd = hasFrontMatter ? lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line)) : -1;
  const looksLikeMetadata = frontMatterEnd >= 0 && lines.slice(1, frontMatterEnd).some((line) => /^[ \t]*(?:[A-Za-z_][\w.-]*|"(?:[^"\\]|\\.)+"|'(?:[^']|'')+'):[ \t]*(?:\S|$)/.test(line));
  const escapeAttribute = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Do not let Markdown interpret the metadata delimiters as horizontal rules or
  // its contents as headings. Keep every original line ending so token maps still
  // address the unmodified document. Incomplete metadata stays visible and locked.
  let renderedSource = text;
  if (looksLikeMetadata) {
    let bodyOffset = 0;
    for (let line = 0; line <= frontMatterEnd; line++) {
      const newline = text.indexOf('\n', bodyOffset);
      bodyOffset = newline < 0 ? text.length : newline + 1;
    }
    renderedSource = text.slice(0, bodyOffset).replace(/[^\r\n]/g, '') + text.slice(bodyOffset);
  }
  md.core.ruler.push('weaver-source-lines', (state) => {
    let listDepth = 0;
    for (const [index, token] of state.tokens.entries()) {
      if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') listDepth++;
      if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') listDepth--;
      if (insertLabel !== undefined && listDepth > 1 && token.type === 'list_item_open' && token.map) {
        token.attrSet('data-nested-source', String(token.map[0]));
        token.attrSet('tabindex', '0');
        if (nestedSourceHint) { token.attrSet('aria-description', nestedSourceHint); token.attrSet('title', nestedSourceHint); }
      }
      if (token.map && token.nesting >= 0 && token.level === 0 && token.type.endsWith('_open')) {
        token.attrSet('data-source-line', String(token.map[0]));
        token.attrSet('data-source-end', String(token.map[1]));
        token.attrSet('data-source-type', token.type);
        if (insertLabel !== undefined && token.map[1] === token.map[0] + 1 && (!hasFrontMatter || (frontMatterEnd >= 0 && token.map[0] > frontMatterEnd))) {
          const line = lines[token.map[0]];
          const prefix = inlinePrefix(line, token.type);
          if (prefix !== undefined) {
            token.attrSet('data-inline-prefix', prefix);
            token.attrSet('data-inline-original', line);
            token.attrSet('contenteditable', 'plaintext-only');
            token.attrSet('spellcheck', 'true');
          }
        }
      }
      // In tight lists the paragraph token is hidden, so wrap only the plain text in a span.
      // The checkbox remains outside the editable element and the original list marker stays in source.
      const paragraph = state.tokens[index - 1];
      const item = state.tokens[index - 2];
      // Enable only top-level checkbox markers that can be traced to a source
      // line. Nested lists, quoted examples, and front matter stay read-only.
      if (insertLabel !== undefined && token.type === 'inline' && token.map && paragraph?.type === 'paragraph_open' &&
          item?.type === 'list_item_open' && item.level === 1 && (!hasFrontMatter || (frontMatterEnd >= 0 && token.map[0] > frontMatterEnd))) {
        const lineNumber = token.map[0];
        const line = lines[lineNumber];
        const marker = /^( {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+\[)([ xX])(\])(?=[ \t]|$)/.exec(line);
        const checkbox = token.children?.[0];
        if (marker && checkbox?.type === 'html_inline' && /^<input class="task-list-item-checkbox"/.test(checkbox.content)) {
          const label = line.slice(marker[0].length).trim() || emptyChecklistLabel || insertLabel;
          checkbox.content = checkbox.content
            .replace(/\s+disabled(?:="[^"]*")?/, '')
            .replace('<input ', `<input data-checklist-line="${lineNumber}" data-checklist-expected="${escapeAttribute(line)}" aria-label="${escapeAttribute(label)}" `);
        }
      }
      if (insertLabel !== undefined && token.type === 'inline' && token.map && token.map[1] === token.map[0] + 1 &&
          paragraph?.type === 'paragraph_open' && item?.type === 'list_item_open' && item.level === 1 &&
          (!hasFrontMatter || (frontMatterEnd >= 0 && token.map[0] > frontMatterEnd))) {
        const line = lines[token.map[0]];
        const prefix = inlinePrefix(line, 'list_item_inline');
        const children = token.children ?? [];
        const checkbox = children[0]?.type === 'html_inline' && /^<input\b[^>]*\bclass="task-list-item-checkbox"/.test(children[0].content);
        const contentIndex = checkbox ? 1 : 0;
        const content = children[contentIndex];
        const visible = content?.type === 'text' ? (checkbox ? content.content.replace(/^[ \t]+/, '') : content.content) : undefined;
        if (prefix !== undefined && children.length === contentIndex + 1 && visible === line.slice(prefix.length)) {
          const open = new state.Token('span_open', 'span', 1);
          open.attrSet('data-source-line', String(token.map[0]));
          open.attrSet('data-source-end', String(token.map[1]));
          open.attrSet('data-source-type', 'list_item_inline');
          open.attrSet('data-inline-prefix', prefix);
          open.attrSet('data-inline-original', line);
          open.attrSet('contenteditable', 'plaintext-only');
          open.attrSet('spellcheck', 'true');
          const close = new state.Token('span_close', 'span', -1);
          if (checkbox) {
            // Keep a separating space outside the editable text without rewriting the prefix.
            const separator = new state.Token('text', '', 0);
            separator.content = ' ';
            content.content = visible;
            token.children = [children[0], separator, open, content, close];
          } else token.children = [open, content, close];
        }
      }
    }
    if (insertLabel !== undefined) {
      // Markdown-it omits the inline token for an empty list item, and its
      // task-list plugin does not render an empty checkbox. Keep those new
      // items editable without adding invisible characters to the source.
      for (let index = state.tokens.length - 1; index >= 0; index--) {
        const item = state.tokens[index];
        if (item.type !== 'list_item_open' || item.level !== 1 || !item.map || item.map[1] !== item.map[0] + 1 ||
            (hasFrontMatter && (frontMatterEnd < 0 || item.map[0] <= frontMatterEnd))) continue;
        const line = lines[item.map[0]];
        const prefix = inlinePrefix(line, 'list_item_inline');
        if (prefix === undefined || line !== prefix) continue;
        const isChecklist = /\[[ xX]\][ \t]+$/.test(prefix);
        const span = `<span data-source-line="${item.map[0]}" data-source-end="${item.map[1]}" data-source-type="list_item_inline" data-inline-prefix="${escapeAttribute(prefix)}" data-inline-original="${escapeAttribute(line)}" contenteditable="plaintext-only" spellcheck="true"></span>`;
        if (isChecklist) {
          const inline = state.tokens[index + 2];
          if (state.tokens[index + 1]?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;
          const checked = /\[[xX]\]/.test(prefix) ? ' checked' : '';
          const markup = new state.Token('html_inline', '', 0);
          markup.content = `<input type="checkbox" data-checklist-line="${item.map[0]}" data-checklist-expected="${escapeAttribute(line)}" aria-label="${escapeAttribute(emptyChecklistLabel || insertLabel)}"${checked}> ${span}`;
          inline.children = [markup];
        } else if (state.tokens[index + 1]?.type === 'list_item_close') {
          const markup = new state.Token('html_block', '', 0);
          markup.content = span;
          state.tokens.splice(index + 1, 0, markup);
        }
      }
      const slots = new Set<number>();
      for (const token of state.tokens) {
        if (!token.map || token.level !== 0 || token.nesting < 0 || token.type === 'inline') continue;
        const line = token.map[0];
        if ((hasFrontMatter && (frontMatterEnd < 0 || line <= frontMatterEnd)) || (line > 0 && line !== frontMatterEnd + 1 && lines[line - 1].trim() !== '')) continue;
        slots.add(line);
      }
      // An unclosed front matter block is left untouched, including its end.
      if (!(lines[0] === '---' && frontMatterEnd < 0)) slots.add(lines.length);
      const safeLabel = escapeAttribute(insertLabel);
      const output: typeof state.tokens = [];
      for (const token of state.tokens) {
        if (token.map && token.level === 0 && token.nesting >= 0 && slots.delete(token.map[0])) {
          const marker = new state.Token('html_block', '', 0);
          marker.content = `<div class="insert-slot" data-insert-line="${token.map[0]}"><div class="insert-field" contenteditable="plaintext-only" role="textbox" aria-label="${safeLabel}" data-placeholder="${safeLabel}"></div></div>`;
          output.push(marker);
        }
        output.push(token);
      }
      if (slots.has(lines.length)) {
        const marker = new state.Token('html_block', '', 0);
        marker.content = `<div class="insert-slot" data-insert-line="${lines.length}"><div class="insert-field" contenteditable="plaintext-only" role="textbox" aria-label="${safeLabel}" data-placeholder="${safeLabel}"></div></div>`;
        output.push(marker);
      }
      state.tokens = output;
    }
  });
  const originalImage = md.renderer.rules.image!;
  const originalFence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const html = originalFence(tokens, index, options, env, self);
    const map = tokens[index].map;
    if (insertLabel === undefined || !map || !fenceBody(text, map[0], map[1], tokens)) return html;
    // Metadata alone does not enable editing until the webview has multiline support.
    return html.replace('<code', `<code data-fence-editable="true" data-source-line="${map[0]}" data-source-end="${map[1]}" data-source-type="fence_code"`);
  };
  md.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const src = token.attrGet('src');
    if (typeof src === 'string' && src && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)) {
      try { token.attrSet('src', imageUri(src)); }
      catch { token.attrSet('src', ''); }
    }
    return originalImage(tokens, index, options, env, self);
  };
  return md.render(renderedSource);
}
