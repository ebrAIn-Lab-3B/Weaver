import { stackRosters, type Roster } from '@ebrain-lab/weaver-markdown';
import { readRootConfig } from './rootConfig';
import { readUserConfig } from './userConfig';

/**
 * The roster of the configuration files: the nearest root file's contributors with the personal file's
 * laid over them, so an id in both takes the personal fields (DEC-018 item 6), the same way the `weaver`
 * tool reads it. The reference to a shared roster is the first one declared, the root file's before the
 * personal file's (item 5). The shared roster itself is laid under this by the roster store.
 */
export async function readConfigRoster(): Promise<Roster | undefined> {
  const [root, user] = await Promise.all([readRootConfig(), readUserConfig()]);
  const rootRoster = root.kind === 'ok' ? root.config.roster : undefined;
  const personalRoster = user.kind === 'ok' ? user.config.roster : undefined;
  const stacked = stackRosters([
    { name: 'root', roster: rootRoster },
    { name: 'personal', roster: personalRoster },
  ])?.roster;
  const from = rootRoster?.from ?? personalRoster?.from;
  if (!stacked && !from) return undefined;
  return { contributors: stacked?.contributors ?? [], ...(from ? { from } : {}) };
}
