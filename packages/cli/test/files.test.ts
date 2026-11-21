import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { readMarkdownFiles } from '../src/files';

describe('readMarkdownFiles', () => {
  it('reads Markdown with relative paths and skips dependencies, build output, and examples', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weaver-files-'));
    const write = async (relative: string, text: string) => {
      await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
      await fs.writeFile(path.join(root, relative), text);
    };
    await write('docs/tasks/TASK-001.md', 'one');
    await write('README.md', 'two');
    await write('notes.txt', 'not markdown');
    await write('node_modules/x/README.md', 'skipped');
    await write('examples/sample/tasks/TASK-100.md', 'skipped');
    await write('dist/out.md', 'skipped');
    await write('.claude/worktrees/agent-1/docs/tasks/TASK-001.md', 'skipped');
    await write('.claude/notes.md', 'kept');

    const files = await readMarkdownFiles(root);
    expect(files.map((f) => f.path).sort()).toEqual(['.claude/notes.md', 'README.md', 'docs/tasks/TASK-001.md']);
    await fs.rm(root, { recursive: true });
  });

  it('supplies the local checkout and Git origin identity without contacting the servers', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weaver-files-origins-'));
    try {
      for (const [folder, host] of [['one', 'one.example'], ['two', 'two.example']]) {
        const checkout = path.join(root, folder);
        await fs.mkdir(checkout);
        execFileSync('git', ['init', checkout], { windowsHide: true, stdio: 'ignore' });
        execFileSync('git', ['-C', checkout, 'remote', 'add', 'origin', `https://${host}/org/shared.git`], { windowsHide: true });
        await fs.writeFile(path.join(checkout, 'REQ-001.md'), 'content');
      }
      const files = await readMarkdownFiles(root);
      expect(files.find(f => f.path === 'one/REQ-001.md')).toMatchObject({ repository: 'org/shared', repositoryServer: 'one.example' });
      expect(files.find(f => f.path === 'two/REQ-001.md')).toMatchObject({ repository: 'org/shared', repositoryServer: 'two.example' });
      expect(files[0].sourceScope).not.toBe(files[1].sourceScope);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});
