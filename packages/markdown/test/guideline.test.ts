import { describe, expect, it } from 'vitest';
import { chooseGuideline, DEFAULT_GUIDELINE_PATH, guidelineNote, describeGuideline, guidelineCacheKey, parseConfig, parseProcess, readGuidelineRef, resolveSetup, serializeConfig } from '../src';
import type { ValidationIssue } from '../src';

function read(data: unknown) {
  const issues: { severity: string; code: string; args?: unknown }[] = [];
  const ref = readGuidelineRef(data, (severity, code, args) => issues.push({ severity, code, args }), 'guideline');
  return { ref, issues };
}

describe('readGuidelineRef', () => {
  it('reads repository, path, and ref', () => {
    expect(read({ repository: 'org/base', path: 'tools/process.yaml', ref: 'v2' })).toEqual({
      ref: { repository: 'org/base', path: 'tools/process.yaml', ref: 'v2' },
      issues: [],
    });
  });

  it('defaults the path and leaves the ref to the default branch', () => {
    expect(read({ repository: 'org/base' }).ref).toEqual({ repository: 'org/base', path: DEFAULT_GUIDELINE_PATH });
  });

  it('is silent when there is no reference', () => {
    expect(read(undefined)).toEqual({ ref: undefined, issues: [] });
    expect(read(null)).toEqual({ ref: undefined, issues: [] });
  });

  it.each([
    ['not a mapping', 'org/base'],
    ['no repository', { path: 'a.yaml' }],
    ['a repository without an owner', { repository: 'base' }],
    ['an absolute path', { repository: 'org/base', path: '/etc/x' }],
    ['a path that climbs out', { repository: 'org/base', path: '../x.yaml' }],
    ['an empty path', { repository: 'org/base', path: '  ' }],
  ])('warns and ignores %s', (_name, data) => {
    const { ref, issues } = read(data);
    expect(ref).toBeUndefined();
    expect(issues).toEqual([{ severity: 'warning', code: 'guideline-invalid-reference', args: { field: 'guideline' } }]);
  });

  it('warns about an unknown key and still reads the reference', () => {
    const { ref, issues } = read({ repository: 'org/base', branch: 'x' });
    expect(ref).toEqual({ repository: 'org/base', path: DEFAULT_GUIDELINE_PATH });
    expect(issues).toEqual([{ severity: 'warning', code: 'unknown-field', args: { field: 'guideline.branch' } }]);
  });
});

describe('guideline labels and keys', () => {
  it('describes a reference and keys it without regard to case in the repository', () => {
    const ref = { repository: 'Org/Base', path: '.weaver/process.yaml', ref: 'v1' };
    expect(describeGuideline(ref)).toBe('Org/Base .weaver/process.yaml@v1');
    expect(guidelineCacheKey(ref)).toBe(guidelineCacheKey({ ...ref, repository: 'org/base' }));
    expect(guidelineCacheKey(ref)).not.toBe(guidelineCacheKey({ ...ref, ref: 'v2' }));
  });
});

describe('chooseGuideline', () => {
  const process = { ref: { repository: 'a/process', path: 'p' }, source: 'process' as const };
  const root = { ref: { repository: 'a/root', path: 'p' }, source: 'root' as const };
  const personal = { ref: { repository: 'a/personal', path: 'p' }, source: 'personal' as const };

  it('takes the first declared, nearest first', () => {
    expect(chooseGuideline([process, root, personal])).toBe(process);
    expect(chooseGuideline([undefined, root, personal])).toBe(root);
    expect(chooseGuideline([undefined, undefined, personal])).toBe(personal);
  });

  it('is none when nothing is declared', () => {
    expect(chooseGuideline([undefined, undefined, undefined])).toBeUndefined();
  });
});

const codes = (issues: ValidationIssue[]) => issues.map((issue) => issue.code);

describe('the guideline in the configuration files', () => {
  const text = (guideline: string) => `project:\n  owner: o\n  number: 1\n${guideline}`;

  it('is read from a personal or root file', () => {
    const result = parseConfig('c.yaml', text('guideline:\n  repository: org/base\n  ref: main\n'));
    expect(result.issues).toEqual([]);
    expect(result.config?.guideline).toEqual({ repository: 'org/base', path: DEFAULT_GUIDELINE_PATH, ref: 'main' });
  });

  it('is ignored with a warning when it is wrong, and the rest of the file still works', () => {
    const result = parseConfig('c.yaml', text('guideline: nonsense\n'));
    expect(result.config?.guideline).toBeUndefined();
    expect(result.config?.project.owner).toBe('o');
    expect(codes(result.issues)).toEqual(['guideline-invalid-reference']);
  });

  it('is written back by the setup', () => {
    const config = parseConfig('c.yaml', text('guideline:\n  repository: org/base\n')).config!;
    expect(parseConfig('c.yaml', serializeConfig(config)).config?.guideline).toEqual(config.guideline);
  });

  it('applies the root file before the personal file, and says which', () => {
    const user = parseConfig('u.yaml', text('guideline:\n  repository: org/personal\n')).config!;
    const root = { config: parseConfig('r.yaml', text('guideline:\n  repository: org/root\n')).config!, path: 'r.yaml' };
    expect(resolveSetup(undefined, user, root, { user: 'u.yaml' })?.guideline).toEqual({
      ref: { repository: 'org/root', path: DEFAULT_GUIDELINE_PATH },
      source: 'root',
      file: 'r.yaml',
    });
    expect(resolveSetup(undefined, user, undefined, { user: 'u.yaml' })?.guideline).toEqual({
      ref: { repository: 'org/personal', path: DEFAULT_GUIDELINE_PATH },
      source: 'personal',
      file: 'u.yaml',
    });
  });

  it('falls to the personal file when the root file names none', () => {
    const user = parseConfig('u.yaml', text('guideline:\n  repository: org/personal\n')).config!;
    const root = { config: parseConfig('r.yaml', text('')).config!, path: 'r.yaml' };
    expect(resolveSetup(undefined, user, root)?.guideline?.source).toBe('personal');
  });

  it('is none when no file names one', () => {
    const user = parseConfig('u.yaml', text('')).config!;
    expect(resolveSetup(undefined, user)?.guideline).toBeUndefined();
  });
});

describe('the guideline a repository records in its process file', () => {
  it('is read as a reference, not as a section', () => {
    const result = parseProcess('p.yaml', 'version: 1\nguideline:\n  repository: org/base\n  path: .weaver/process.yaml\n');
    expect(result.issues).toEqual([]);
    expect(result.guidelineRef).toEqual({ repository: 'org/base', path: '.weaver/process.yaml' });
    expect(result.sources.columns).toBe('default');
  });

  it('never changes the repository process', () => {
    const plain = parseProcess('p.yaml', 'version: 1\n');
    const named = parseProcess('p.yaml', 'version: 1\nguideline:\n  repository: org/base\n');
    expect(named.process).toEqual(plain.process);
  });

  it('warns about a wrong reference and still reads the file', () => {
    const result = parseProcess('p.yaml', 'version: 1\nguideline: 3\n');
    expect(result.guidelineRef).toBeUndefined();
    expect(codes(result.issues)).toEqual(['guideline-invalid-reference']);
  });
});

describe('guidelineNote', () => {
  const root = { ref: { repository: 'org/base', path: '.weaver/process.yaml' }, source: 'root' as const };

  it('is nothing when no guideline applies', () => {
    expect(guidelineNote('missing', undefined, undefined)).toBeUndefined();
  });

  it('can offer a starting file only for a repository with no process file', () => {
    expect(guidelineNote('missing', undefined, root)?.startable).toBe(true);
    expect(guidelineNote('read', undefined, root)?.startable).toBe(false);
    expect(guidelineNote('failed', undefined, root)?.startable).toBe(false);
    expect(guidelineNote('unknown', undefined, root)?.startable).toBe(false);
  });

  it('prefers the reference recorded in the repository', () => {
    const note = guidelineNote('read', { repository: 'org/own', path: 'p.yaml' }, root);
    expect(note?.guideline.source).toBe('process');
    expect(note?.guideline.ref.repository).toBe('org/own');
  });
});
