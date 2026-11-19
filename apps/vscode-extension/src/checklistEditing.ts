import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';

export interface ChecklistToggle {
  /** UTF-16 offsets, as used by VS Code's TextDocument.positionAt. */
  offset: number;
  length: 1;
  expected: string;
  text: ' ' | 'x';
}

/**
 * Plan a one-character checkbox change on a top-level task-list item. A rendered
 * checkbox is only a hint: reparse the current source and compare the exact line
 * before applying any edit. The caller must additionally check document version.
 */
export function planChecklistToggle(source: string, line: number, expectedLine: string, checked: boolean): ChecklistToggle | undefined {
  if (!Number.isSafeInteger(line) || line < 0 || typeof expectedLine !== 'string' || typeof checked !== 'boolean') return undefined;
  const lines = source.split(/\r\n|\r|\n/);
  if (line >= lines.length || lines[line] !== expectedLine) return undefined;

  const first = lines[0].replace(/^\uFEFF/, '');
  if (first === '---') {
    const end = lines.findIndex((value, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(value));
    if (end < 0 || line <= end) return undefined;
  }

  // Only marker syntax that can be located unambiguously is editable. Do not
  // change a lookalike inside a fenced block, blockquote, or nested list.
  const marker = /^( {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+\[)([ xX])(\])(?=[ \t]|$)/.exec(expectedLine);
  if (!marker) return undefined;
  const tokens = new MarkdownIt({ html: false, linkify: true }).use(taskLists).parse(source, {});
  const isTopLevelTask = tokens.some((token, index) => {
    const paragraph = tokens[index - 1];
    const item = tokens[index - 2];
    return token.type === 'inline' && token.map?.[0] === line && paragraph?.type === 'paragraph_open' &&
      item?.type === 'list_item_open' && item.level === 1 &&
      ((token.children?.[0]?.type === 'html_inline' && /^<input class="task-list-item-checkbox"/.test(token.children[0].content)) ||
       (/^[ \t]+$/.test(expectedLine.slice(marker[0].length)) && token.children?.length === 1 && token.children[0].type === 'text' && /^\[[ xX]\]$/.test(token.children[0].content)));
  });
  if (!isTopLevelTask || (marker[2].toLowerCase() === 'x') === checked) return undefined;

  let start = 0;
  for (let i = 0; i < line; i++) {
    const ending = /\r\n|\r|\n/g;
    ending.lastIndex = start;
    const match = ending.exec(source);
    if (!match) return undefined;
    start = match.index + match[0].length;
  }
  return { offset: start + marker[1].length, length: 1, expected: marker[2], text: checked ? 'x' : ' ' };
}
