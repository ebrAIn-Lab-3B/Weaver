import { describe, expect, it } from 'vitest';
import { documentLinks } from '../../../apps/vscode-extension/src/documentLinks';
import { renderRequirementHtml } from '../../../apps/vscode-extension/src/requirementHtml';
import { parseArtifact } from '@ebrain-lab/weaver-markdown';

describe('requirement document links', () => {
  const source = '---\nid: REQ-001\ntype: requirement\ntitle: Example\nstatus: draft\n---\n\n# Example\n\n[Idea](../idea%20one.md) and [Guide][guide]\n\n[guide]: https://example.org/guide\n\n```md\n[Ignored](no.md)\n```\n\n[Bad](javascript:alert(1))';
  it('extracts body links and skips code and unsafe links', () => {
    expect(documentLinks(source)).toEqual([
      { label: 'Idea', href: '../idea%20one.md' },
      { label: 'Guide', href: 'https://example.org/guide' },
    ]);
  });
  it('renders escaped links in the requirement view', () => {
    const requirement = parseArtifact('req.md', source).artifact!;
    if (requirement.kind !== 'requirement') throw new Error('Expected requirement');
    const html = renderRequirementHtml(requirement, [], [], 'nonce', 'csp', undefined, 'ko', undefined, documentLinks(source));
    expect(html).toContain('문서 링크');
    expect(html).toContain('data-document-link="../idea%20one.md">Idea</a>');
  });
});
