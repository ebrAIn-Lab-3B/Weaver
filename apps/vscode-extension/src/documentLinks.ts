import MarkdownIt from 'markdown-it';

export interface DocumentLink { label: string; href: string }

/** Collect Markdown links from the body, ignoring frontmatter, code, and unsafe targets. */
export function documentLinks(text: string): DocumentLink[] {
  const body = text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
  const links: DocumentLink[] = [];
  const seen = new Set<string>();
  for (const token of new MarkdownIt({ html: false }).parse(body, {})) {
    if (token.type !== 'inline' || !token.children) continue;
    const children = token.children;
    for (let i = 0; i < children.length; i++) {
      if (children[i].type !== 'link_open') continue;
      const value = children[i].attrGet('href');
      const href = typeof value === 'string' ? value : '';
      let label = '';
      while (++i < children.length && children[i].type !== 'link_close') label += children[i].content;
      if (!href || href.startsWith('#') || href.startsWith('//') || /^(?!https?:)[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      const key = `${label}\0${href}`;
      if (!seen.has(key)) { links.push({ label: label || href, href }); seen.add(key); }
    }
  }
  return links;
}
