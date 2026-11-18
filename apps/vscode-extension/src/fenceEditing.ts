import MarkdownIt from 'markdown-it';

export interface FenceBody {
  /** UTF-16 offsets of the body, excluding both fence lines. */
  start: number;
  end: number;
  body: string;
  eol: '\n' | '\r\n';
  marker: '`' | '~';
  markerLength: number;
}

/**
 * Identify a closed, top-level fence that can be changed without touching its delimiters.
 * Indented fences and Mermaid fall back to source mode. Parsing also rejects a purported
 * opening that is inside another fence or in unclosed front matter.
 */
export function fenceBody(source: string, startLine: number, endLine: number, parsedTokens?: readonly { type: string; level: number; map: [number, number] | null; info: string }[]): FenceBody | undefined {
  if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 0 || endLine <= startLine + 1) return undefined;
  const lines = source.split('\n');
  const clean = (line: string) => line.endsWith('\r') ? line.slice(0, -1) : line;
  if (endLine > lines.length) return undefined;
  if (clean(lines[0]) === '---') {
    const frontEnd = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(clean(line)));
    if (frontEnd < 0 || startLine <= frontEnd) return undefined;
  }
  const parsed = parsedTokens ?? new MarkdownIt({ html: false }).parse(source, {});
  const token = parsed.find((item) => item.type === 'fence' && item.level === 0 && item.map?.[0] === startLine && item.map[1] === endLine);
  if (!token || token.info.trim().split(/\s+/)[0].toLowerCase() === 'mermaid') return undefined;
  const opening = /^(`{3,}|~{3,})(.*)$/.exec(clean(lines[startLine]));
  if (!opening || (opening[1][0] === '`' && opening[2].includes('`'))) return undefined;
  const marker = opening[1][0] as '`' | '~';
  const closing = new RegExp(`^ {0,3}${marker === '`' ? '`' : '~'}{${opening[1].length},}[ \\t]*$`);
  if (!closing.test(clean(lines[endLine - 1]))) return undefined;
  const lineOffset = (line: number): number => lines.slice(0, line).reduce((sum, part) => sum + part.length + 1, 0);
  const start = lineOffset(startLine + 1);
  const end = lineOffset(endLine - 1);
  if (start > source.length || end > source.length || start > end) return undefined;
  return { start, end, body: source.slice(start, end), eol: lines[startLine].endsWith('\r') ? '\r\n' : '\n', marker, markerLength: opening[1].length };
}

/** Create a body-only edit. A newly entered closing fence is refused instead of truncating the block. */
export function planFenceBodyEdit(source: string, startLine: number, endLine: number, value: string): { start: number; end: number; text: string } | undefined {
  const fence = fenceBody(source, startLine, endLine);
  if (!fence || value.includes('\0') || value.length > 1_000_000) return undefined;
  const normalized = value.replace(/\r\n?|\n/g, '\n');
  const closing = new RegExp(`^ {0,3}${fence.marker}{${fence.markerLength},}[ \\t]*$`);
  if (normalized.split('\n').some((line) => closing.test(line))) return undefined;
  const body = normalized && !normalized.endsWith('\n') ? normalized + '\n' : normalized;
  return { start: fence.start, end: fence.end, text: body.replace(/\n/g, fence.eol) };
}
