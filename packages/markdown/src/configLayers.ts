/**
 * The configuration files that can apply to the folder Weaver runs in, nearest first (DEC-018 item 4):
 * the workspace `fabric.yaml`, then the nearest root file, then the personal file. The first one that
 * exists decides `project` and `repositories` as a whole; the others are shown as not applied, with
 * the layer that comes before them, so that a person never edits a file that does not count (item 9).
 */
export type ConfigLayerKind = 'workspace' | 'root' | 'personal';

export interface ConfigLayer {
  kind: ConfigLayerKind;
  file: string;
  /** True for the one file that decides. */
  applies: boolean;
  /** For a file that does not apply: the layer that decides instead. */
  overriddenBy?: ConfigLayerKind;
}

export interface FoundConfigFiles {
  workspace?: string;
  root?: string;
  personal?: string;
}

const ORDER: readonly ConfigLayerKind[] = ['workspace', 'root', 'personal'];

/** The files that exist, nearest first, with the one that applies marked. Missing layers are left out. */
export function configLayers(found: FoundConfigFiles): ConfigLayer[] {
  const present = ORDER.filter((kind) => found[kind] !== undefined);
  const decider = present[0];
  return present.map((kind) =>
    kind === decider
      ? { kind, file: found[kind] as string, applies: true }
      : { kind, file: found[kind] as string, applies: false, overriddenBy: decider },
  );
}

/**
 * Where choosing the repositories writes. A workspace `fabric.yaml` belongs to a repository and is
 * changed by a reviewed pull request, so Weaver only opens it; a root file and the personal file are
 * the person's own and are written after a confirmation (DEC-014, DEC-018 item 10).
 */
export function repositoryListTarget(layers: ConfigLayer[]): { kind: 'write' | 'open'; layer: ConfigLayer } | undefined {
  const layer = layers.find((candidate) => candidate.applies);
  if (!layer) return undefined;
  return { kind: layer.kind === 'workspace' ? 'open' : 'write', layer };
}
