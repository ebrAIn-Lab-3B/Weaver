import { createHash } from 'node:crypto';
import { overlayRoster, parseSharedRoster, type Contributor, type Roster, type RosterRef } from '@ebrain-lab/weaver-markdown';
import { fetchRepositoryFile } from './processFile';
import type { FetchFn } from './issue';

export interface FreshPersonalRoster {
  /** Root and personal configuration already overlaid, read again for this action. */
  roster?: Roster;
  /** Digest of the exact effective local configuration, including absent files. */
  version: string;
}

/** No cached shared-roster fallback is permitted when preparing a write. */
export async function readFreshEffectiveRoster(
  token: string,
  reference: RosterRef | undefined,
  readPersonal: () => Promise<FreshPersonalRoster | undefined>,
  fetchImpl: FetchFn = fetch,
): Promise<{ contributors: readonly Contributor[]; version: string } | undefined> {
  try {
    const personal = await readPersonal();
    if (!personal?.version) return undefined;
    let shared: Roster | undefined;
    let sharedText = '';
    if (reference) {
      const fetched = await fetchRepositoryFile(token, reference.repository, reference.path, { ref: reference.ref }, fetchImpl);
      if (fetched.status !== 'read') return undefined;
      const parsed = parseSharedRoster(reference.path, fetched.text);
      // A skipped or malformed entry can change candidate uniqueness. Fail closed instead of using a partial roster.
      if (!parsed.roster || parsed.issues.some((issue) => issue.code !== 'roster-agent-incomplete')) return undefined;
      shared = parsed.roster;
      sharedText = fetched.text;
    }
    const effective = overlayRoster(shared, personal.roster)?.roster;
    if (!effective?.contributors.length) return undefined;
    const version = createHash('sha256').update(JSON.stringify([reference ?? null, sharedText, personal.version, effective.contributors])).digest('hex');
    return { contributors: effective.contributors, version };
  } catch { return undefined; }
}
