import { describe, expect, it } from 'vitest';
import { configLayers, repositoryListTarget } from '../src/configLayers';

describe('configLayers', () => {
  it('lists the files nearest first and marks the root file as the one that applies over the personal file', () => {
    expect(configLayers({ root: '/prj/.weaver/config.yaml', personal: '/home/.weaver/config.yaml' })).toEqual([
      { kind: 'root', file: '/prj/.weaver/config.yaml', applies: true },
      { kind: 'personal', file: '/home/.weaver/config.yaml', applies: false, overriddenBy: 'root' },
    ]);
  });

  it('lets the workspace file decide over both other layers', () => {
    const layers = configLayers({ workspace: '/repo/fabric.yaml', root: '/prj/.weaver/config.yaml', personal: '/home/.weaver/config.yaml' });
    expect(layers.map((l) => [l.kind, l.applies, l.overriddenBy])).toEqual([
      ['workspace', true, undefined],
      ['root', false, 'workspace'],
      ['personal', false, 'workspace'],
    ]);
  });

  it('applies the personal file when it is the only one', () => {
    expect(configLayers({ personal: '/home/.weaver/config.yaml' })).toEqual([
      { kind: 'personal', file: '/home/.weaver/config.yaml', applies: true },
    ]);
  });

  it('returns nothing when there is no file', () => {
    expect(configLayers({})).toEqual([]);
  });
});

describe('repositoryListTarget', () => {
  it('writes the root file when it applies, not the personal file', () => {
    const target = repositoryListTarget(configLayers({ root: '/prj/.weaver/config.yaml', personal: '/home/.weaver/config.yaml' }));
    expect(target).toEqual({ kind: 'write', layer: { kind: 'root', file: '/prj/.weaver/config.yaml', applies: true } });
  });

  it('only opens a workspace fabric.yaml, which belongs to a repository', () => {
    expect(repositoryListTarget(configLayers({ workspace: '/repo/fabric.yaml', personal: '/home/.weaver/config.yaml' }))?.kind).toBe('open');
  });

  it('has no target without a file', () => {
    expect(repositoryListTarget([])).toBeUndefined();
  });
});
