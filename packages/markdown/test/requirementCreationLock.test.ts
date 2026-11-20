import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { RequirementCreationLocked, withRequirementCreationLock } from '../../../apps/vscode-extension/src/requirementCreationLock';

describe('requirement creation lock', () => {
  it('rejects a concurrent creator before it can write a different destination', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weaver-lock-test-'));
    try {
      let release!: () => void;
      let entered!: () => void;
      const started = new Promise<void>((resolve) => { entered = resolve; });
      const hold = new Promise<void>((resolve) => { release = resolve; });
      const first = withRequirementCreationLock(async () => {
        entered();
        await hold;
        await writeFile(path.join(root, 'first.md'), 'REQ-001', { flag: 'wx' });
      }, root);
      await started;
      await expect(withRequirementCreationLock(() => writeFile(path.join(root, 'second.md'), 'REQ-001'), root))
        .rejects.toBeInstanceOf(RequirementCreationLocked);
      release();
      await first;
      expect(await readFile(path.join(root, 'first.md'), 'utf8')).toBe('REQ-001');
      await expect(readFile(path.join(root, 'second.md'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(withRequirementCreationLock(async () => 'available', root)).resolves.toBe('available');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('releases the lock when creation fails without replacing an existing file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weaver-lock-test-'));
    try {
      const target = path.join(root, 'existing.md');
      await writeFile(target, 'original');
      await expect(withRequirementCreationLock(() => writeFile(target, 'replacement', { flag: 'wx' }), root))
        .rejects.toMatchObject({ code: 'EEXIST' });
      expect(await readFile(target, 'utf8')).toBe('original');
      await expect(withRequirementCreationLock(async () => true, root)).resolves.toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
