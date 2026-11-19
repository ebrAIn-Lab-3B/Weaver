/** Return the literal prefix for simple one-line blocks; leave rich Markdown in source mode. */
export function inlinePrefix(line: string, type: string): string | undefined {
  const match = type === 'heading_open' ? /^(#{1,6}[ \t]+)(.*)$/.exec(line)
    : type === 'paragraph_open' ? /^()(.*)$/.exec(line)
      : type === 'list_item_inline' ? /^([ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)(.*)$/.exec(line)
        : null;
  if (!match || /[*_`~\[\]<>!\\]/.test(match[2]) || /&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i.test(match[2]) || /^\s*(?:[-+*>#]|\d+[.)])\s/.test(match[2])) return undefined;
  return match[1];
}
