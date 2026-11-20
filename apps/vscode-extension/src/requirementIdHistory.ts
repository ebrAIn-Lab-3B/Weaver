import { mkdir, open, readFile } from 'fs/promises';
import * as path from 'path';

export const requirementIdHistoryPath = (root: string): string => path.join(root, '.weaver', 'requirement-ids.txt');
export class InvalidRequirementIdHistory extends Error {
  constructor(readonly historyFile: string) { super(); }
}

/** Incomplete or malformed history fails closed rather than risking ID reuse. */
export async function highestReservedRequirementId(root: string): Promise<bigint> {
  let text: string;
  try {
    text = await readFile(requirementIdHistoryPath(root), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0n;
    throw error;
  }
  // A new allocation never intentionally leaves an empty file. It can indicate
  // interrupted creation or truncation of an existing reservation history.
  if (!text) throw new InvalidRequirementIdHistory(requirementIdHistoryPath(root));
  if (!text.endsWith('\n')) throw new InvalidRequirementIdHistory(requirementIdHistoryPath(root));
  let highest = 0n;
  for (const line of text.slice(0, -1).split('\n').map(value => value.endsWith('\r') ? value.slice(0, -1) : value)) {
    const match = /^REQ-(\d{3,})$/.exec(line);
    if (!match) throw new InvalidRequirementIdHistory(requirementIdHistoryPath(root));
    const value = BigInt(match[1]);
    if (value < 1n) throw new InvalidRequirementIdHistory(requirementIdHistoryPath(root));
    if (value > highest) highest = value;
  }
  return highest;
}

/** Call only under the creation lock, before attempting to create the document. */
export async function reserveRequirementId(root: string, id: string): Promise<void> {
  const file = requirementIdHistoryPath(root);
  await mkdir(path.dirname(file), { recursive: true });
  const handle = await open(file, 'a');
  try {
    await handle.writeFile(`${id}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}
