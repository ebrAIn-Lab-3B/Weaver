import { describe, expect, it } from 'vitest';
import { planChecklistToggle } from '../../../apps/vscode-extension/src/checklistEditing';

function apply(source: string, line: number, expectedLine: string, checked: boolean): string | undefined {
  const edit = planChecklistToggle(source, line, expectedLine, checked);
  if (!edit) return undefined;
  expect(source.slice(edit.offset, edit.offset + edit.length)).toBe(edit.expected);
  return source.slice(0, edit.offset) + edit.text + source.slice(edit.offset + edit.length);
}

describe('checklist checkbox changes', () => {
  it('toggles a newly created empty checklist item', () => {
    expect(apply('- [x] first\n- [ ] ', 1, '- [ ] ', true)).toBe('- [x] first\n- [x] ');
  });
  it('changes only the checkbox marker, preserving surrounding Markdown', () => {
    const source = '---\nid: REQ-001\n---\n\n- [ ] **Read** [guide](docs/a.md)\n- [X] Done\n\n```mermaid\nA-->B\n```\n';
    const checked = apply(source, 4, '- [ ] **Read** [guide](docs/a.md)', true)!;
    expect(checked).toBe(source.replace('- [ ] **Read**', '- [x] **Read**'));
    const unchecked = apply(checked, 5, '- [X] Done', false)!;
    expect(unchecked).toBe(checked.replace('- [X] Done', '- [ ] Done'));
  });

  it('uses UTF-16 offsets and preserves mixed line endings and list markers', () => {
    const source = '# 한글 🌱\r\n\r\n1. [ ] 첫 항목\n+ [x] 둘째\r* [ ] 셋째\n';
    expect(apply(source, 2, '1. [ ] 첫 항목', true)).toBe(source.replace('1. [ ]', '1. [x]'));
    expect(apply(source, 3, '+ [x] 둘째', false)).toBe(source.replace('+ [x]', '+ [ ]'));
    expect(apply(source, 4, '* [ ] 셋째', true)).toBe(source.replace('* [ ]', '* [x]'));
  });

  it('rejects stale source, invalid inputs, and no-op requests', () => {
    expect(planChecklistToggle('- [ ] new', 0, '- [ ] old', true)).toBeUndefined();
    expect(planChecklistToggle('- [ ] new', 0, '- [ ] new', false)).toBeUndefined();
    expect(planChecklistToggle('- [x] new', 0, '- [x] new', true)).toBeUndefined();
    expect(planChecklistToggle('- [ ] new', -1, '- [ ] new', true)).toBeUndefined();
    expect(planChecklistToggle('- [ ] new', 1, '- [ ] new', true)).toBeUndefined();
  });

  it('never edits lookalikes inside front matter, fenced code, blockquotes or nested lists', () => {
    const source = '---\n- [ ] metadata\n---\n\n```md\n- [ ] code\n```\n\n> - [ ] quoted\n\n- parent\n  - [ ] nested\n';
    expect(planChecklistToggle(source, 1, '- [ ] metadata', true)).toBeUndefined();
    expect(planChecklistToggle(source, 5, '- [ ] code', true)).toBeUndefined();
    expect(planChecklistToggle(source, 8, '> - [ ] quoted', true)).toBeUndefined();
    expect(planChecklistToggle(source, 11, '  - [ ] nested', true)).toBeUndefined();
    expect(planChecklistToggle('---\n- [ ] unfinished', 1, '- [ ] unfinished', true)).toBeUndefined();
  });

  it('accepts only task boxes represented by the Markdown parser', () => {
    expect(planChecklistToggle('- [!] different task marker', 0, '- [!] different task marker', true)).toBeUndefined();
    expect(planChecklistToggle('- [ ]', 0, '- [ ]', true)).toBeUndefined();
    expect(planChecklistToggle('- [ ]first', 0, '- [ ]first', true)).toBeUndefined();
    expect(apply('- [ ] one\n  continued', 0, '- [ ] one', true)).toBe('- [x] one\n  continued');
  });
});
