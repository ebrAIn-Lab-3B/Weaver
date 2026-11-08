import * as path from 'path';
import { type GuidelineCopies, readGuidelineCopies, serializeGuidelineCopies } from '@palab/weaver-markdown';
import { type GuidelineCopyStore, memoryCopies } from '@palab/weaver-github';
import type { Deps } from './contract';
import { configPath } from './setup';

/** `guidelines.json` next to the personal configuration, or under `WEAVER_HOME`. Never inside a repository. */
export function guidelineCopiesPath(env: Record<string, string | undefined>): string {
  return path.join(path.dirname(configPath(env)), 'guidelines.json');
}

/**
 * The guideline copies kept on this computer, for one run of the tool. `save` writes them back; a
 * copy that cannot be saved is not an error for the person, because the copy is a convenience.
 */
export async function openGuidelineCopies(deps: Pick<Deps, 'env' | 'system'>): Promise<{ store: GuidelineCopyStore; save(): Promise<void> }> {
  const file = guidelineCopiesPath(deps.env);
  const kept: GuidelineCopies = readGuidelineCopies(await deps.system.readText(file).catch(() => undefined));
  const store = memoryCopies(kept);
  return {
    store,
    save: async () => {
      const now = store.all();
      if (JSON.stringify(now) === JSON.stringify(kept)) return;
      await deps.system.writeFile(file, serializeGuidelineCopies(now)).catch(() => undefined);
    },
  };
}
