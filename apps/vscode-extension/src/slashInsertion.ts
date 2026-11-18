import { renderMarkdown } from './renderMarkdown';

export type InsertKind = 'paragraph' | 'heading' | 'bullet' | 'checklist' | 'code';

/** Compute a targeted insertion; never rebuild or normalize the original document. */
export function planInsertion(source: string, line: number, kind: InsertKind, value: string): { offset: number; text: string } | undefined {
  if (!Number.isSafeInteger(line) || line < 0 || !['paragraph', 'heading', 'bullet', 'checklist', 'code'].includes(kind) || /[\r\n]/.test(value) || value.length > 10000) return undefined;
  const html = renderMarkdown(source, (src) => src, 'insert');
  if (!html.includes(`data-insert-line="${line}"`)) return undefined;
  const lines = source.split(/\r?\n/);
  if (line > lines.length) return undefined;
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  // Source may mix LF and CRLF. Count the actual separator at each line rather
  // than assuming every separator has the chosen output EOL's width.
  let offset = 0;
  if (line === lines.length) offset = source.length;
  else {
    const separator = /\r?\n/g;
    for (let index = 0; index < line; index++) {
      const match = separator.exec(source);
      if (!match) return undefined;
      offset = separator.lastIndex;
    }
  }
  // A literal backtick run in code must not become the closing fence.
  const longestTicks = kind === 'code' ? Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length)) : 0;
  const fence = '`'.repeat(Math.max(3, longestTicks + 1));
  const block = kind === 'heading' ? `## ${value}` : kind === 'bullet' ? `- ${value}` : kind === 'checklist' ? `- [ ] ${value}` : kind === 'code' ? `${fence}${eol}${value}${eol}${fence}` : value;
  if (!value.trim() && kind === 'paragraph') return undefined;
  const before = source.slice(0, offset);
  const after = source.slice(offset);
  const prefix = !before ? '' : /(?:\r?\n){2}$/.test(before) ? '' : /\r?\n$/.test(before) ? eol : eol + eol;
  const suffix = !after ? eol : /^\r?\n/.test(after) ? eol : eol + eol;
  return { offset, text: prefix + block + suffix };
}
