import { mkdir, rmdir } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export class RequirementCreationLocked extends Error {
  constructor(readonly lockPath: string) { super(lockPath); }
}

/** Serialize cooperating local creators for this OS user. An abandoned lock fails closed. */
export async function withRequirementCreationLock<T>(action: () => Promise<T>, tempRoot = os.tmpdir()): Promise<T> {
  const lock = path.join(tempRoot, 'weaver-requirement-creation.lock');
  try {
    await mkdir(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new RequirementCreationLocked(lock);
    throw error;
  }
  try {
    return await action();
  } finally {
    await rmdir(lock);
  }
}
