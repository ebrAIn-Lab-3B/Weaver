import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { type GuidelineCopies, readGuidelineCopies, serializeGuidelineCopies } from '@palab/weaver-markdown';
import { type GuidelineCopyStore, memoryCopies } from '@palab/weaver-github';
import { userConfigPath } from './userConfig';

/** `guidelines.json` next to the personal configuration, never inside a repository (DEC-019 item 8). The tool keeps its copies in the same file. */
function copiesFile(): string {
  return path.join(path.dirname(userConfigPath()), 'guidelines.json');
}

/**
 * The guideline copies kept on this computer. `save` writes them back; a copy that cannot be saved
 * is not an error for the person, because the copy is a convenience.
 */
export async function openGuidelineCopies(): Promise<{ store: GuidelineCopyStore; save(): Promise<void> }> {
  const file = copiesFile();
  const kept: GuidelineCopies = readGuidelineCopies(await fs.readFile(file, 'utf8').catch(() => undefined));
  const store = memoryCopies(kept);
  return {
    store,
    save: async () => {
      const now = store.all();
      if (JSON.stringify(now) === JSON.stringify(kept)) return;
      try {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, serializeGuidelineCopies(now), 'utf8');
      } catch {
        // The copy is only a convenience.
      }
    },
  };
}
