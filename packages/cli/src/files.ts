import { promises as fs } from 'fs';
import * as path from 'path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { repositoryFromRemote, type SourceFile } from '@ebrain-lab/weaver-markdown';

const runFile = promisify(execFile);

async function checkoutRoot(start: string): Promise<string | undefined> {
  let current = path.resolve(start);
  for (;;) {
    try { await fs.stat(path.join(current, '.git')); return current; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

async function origin(root: string): Promise<{ repository: string; server: string } | undefined> {
  try {
    const { stdout } = await runFile('git', ['-C', root, 'config', '--get', 'remote.origin.url'], { timeout: 5000, windowsHide: true });
    return repositoryFromRemote(stdout.trim());
  } catch { return undefined; }
}

/** Folders that hold no work of the repository: dependencies, build output, and the sample workspaces. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'out', 'examples']);

/** Agent worktrees are full copies of the repository, so their documents would all count as duplicate IDs. */
const AGENT_WORKTREES = '.claude/worktrees';

/** Every Markdown file under `root`, with `/`-separated paths relative to it. */
export async function readMarkdownFiles(root: string): Promise<SourceFile[]> {
  const found: SourceFile[] = [];
  const checkout = await checkoutRoot(root);
  const origins = new Map<string, Promise<{ repository: string; server: string } | undefined>>();
  const walk = async (directory: string, currentCheckout: string | undefined): Promise<void> => {
    if (currentCheckout && !origins.has(currentCheckout)) origins.set(currentCheckout, origin(currentCheckout));
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const full = path.join(directory, entry.name);
        const relative = path.relative(root, full).split(path.sep).join('/');
        if (!SKIP.has(entry.name) && relative !== AGENT_WORKTREES) {
          let nested = currentCheckout;
          try { await fs.stat(path.join(full, '.git')); nested = full; }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
          await walk(full, nested);
        }
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const full = path.join(directory, entry.name);
        const identity = currentCheckout ? await origins.get(currentCheckout) : undefined;
        const scope = currentCheckout ?? root;
        found.push({ path: path.relative(root, full).split(path.sep).join('/'), text: await fs.readFile(full, 'utf8'), sourceScope: process.platform === 'win32' ? path.resolve(scope).toLowerCase() : path.resolve(scope), ...(identity ? { repository: identity.repository, repositoryServer: identity.server } : {}) });
      }
    }
  };
  await walk(root, checkout);
  return found;
}
