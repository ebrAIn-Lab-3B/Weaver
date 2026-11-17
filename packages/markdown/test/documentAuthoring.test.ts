import { describe, expect, it } from 'vitest';
import { ideationDraft, markdownEditorTarget, parseArtifact, requirementDraft } from '../src';

describe('human document drafts', () => {
  it('creates a requirement that the artifact parser can read, including a YAML-sensitive title', () => {
    const text = requirementDraft('REQ-123', 'A: "quoted" title', 'People can decide.', 'The outcome is visible.');
    const result = parseArtifact('REQ-123.md', text);
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(result.artifact).toMatchObject({
      kind: 'requirement', id: 'REQ-123', title: 'A: "quoted" title', status: 'draft',
      criteria: [{ id: 'AC-001', text: 'The outcome is visible.' }],
    });
    expect(text).toContain('## Outcome\n\nPeople can decide.');
  });

  it('creates an ordinary ideation document without requirement metadata', () => {
    const text = ideationDraft('  Explore an idea  ');
    expect(text).toBe('# Explore an idea\n\n');
    expect(parseArtifact('ideation.md', text).isArtifact).toBe(false);
  });

  it('routes requirements and tasks away from the ordinary Markdown editor', () => {
    expect(markdownEditorTarget('README.md', '# Hello')).toBe('markdown');
    expect(markdownEditorTarget('REQ-001.md', '')).toBe('requirement');
    expect(markdownEditorTarget('TASK-001.md', '')).toBe('task');
    expect(markdownEditorTarget('different.md', requirementDraft('REQ-123', 'Title', 'Outcome', 'Criterion'))).toBe('requirement');
    expect(markdownEditorTarget('different.md', '---\nid: TASK-001\ntype: task\ntitle: Work\nrequirement: REQ-123\nstatus: draft\n---\n')).toBe('task');
  });
});
