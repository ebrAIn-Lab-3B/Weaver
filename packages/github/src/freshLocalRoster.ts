import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { parseConfig, parseRootConfig, rootConfigCandidates, stackRosters, type Roster, type RosterRef } from '@ebrain-lab/weaver-markdown';

export type LocalFileRead = { status: 'read'; text: string } | { status: 'missing' } | { status: 'failed' };

async function readLocalFile(path: string): Promise<LocalFileRead> {
  try { return { status: 'read', text: await fs.readFile(path, 'utf8') }; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' ? { status: 'missing' } : { status: 'failed' }; }
}

/** Re-read configuration before a write; unreadable or invalid files never fall back to a cache. */
export async function readFreshLocalRoster(
  startFolder: string,
  personalPath: string,
  readFile: (path: string) => Promise<LocalFileRead> = readLocalFile,
): Promise<{ roster?: Roster; reference?: RosterRef; version: string } | undefined> {
  if (!startFolder || !personalPath) return undefined;
  try {
    let rootPath: string | undefined;
    let rootText: string | undefined;
    for (const candidate of rootConfigCandidates(startFolder, personalPath)) {
      const read = await readFile(candidate);
      if (read.status === 'failed') return undefined;
      if (read.status === 'read' && read.text.trim()) { rootPath = candidate; rootText = read.text; break; }
    }
    const personal = await readFile(personalPath);
    if (personal.status === 'failed') return undefined;
    const personalText = personal.status === 'read' && personal.text.trim() ? personal.text : undefined;
    const root = rootText && rootPath ? parseRootConfig(rootPath, rootText) : undefined;
    const user = personalText ? parseConfig(personalPath, personalText) : undefined;
    if ((root && !root.config) || (user && !user.config)) return undefined;
    // A malformed reference, role or reach could silently change the chosen candidate.
    if ([...(root?.issues ?? []), ...(user?.issues ?? [])].some((issue) => issue.code.startsWith('roster-invalid-'))) return undefined;
    const rootRoster = root?.config?.roster;
    const userRoster = user?.config?.roster;
    const roster = stackRosters([{ name: 'root', roster: rootRoster }, { name: 'personal', roster: userRoster }])?.roster;
    const reference = rootRoster?.from ?? userRoster?.from;
    if (!roster && !reference) return undefined;
    const version = createHash('sha256').update(JSON.stringify([startFolder, rootPath ?? null, rootText ?? null, personalPath, personalText ?? null])).digest('hex');
    return { ...(roster ? { roster } : {}), ...(reference ? { reference } : {}), version };
  } catch { return undefined; }
}
