import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { RecoveryJournal } from '../../../apps/vscode-extension/src/recoveryJournal';

let root: string;
let compiled: string;
const documentUri = 'file:///C:/test.md';
beforeAll(async () => {
  const bundle = await build({ entryPoints: [path.resolve(process.cwd(), '../../apps/vscode-extension/src/markdownEditor.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], write: false, logLevel: 'silent' });
  compiled = bundle.outputFiles[0].text;
});
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'weaver-editor-recovery-')); });
afterEach(async () => {
  const dir = path.join(root, 'recovery-journal-v1');
  try { for (const file of await fs.readdir(dir)) await fs.unlink(path.join(dir, file)); await fs.rmdir(dir); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await fs.rmdir(root);
});

function host(failFirstCreate = false, userdata = false, enabled = true) {
  let receive: (event: Record<string, unknown>) => Promise<void> = async () => {};
  const replies: Record<string, unknown>[] = [], opened: string[] = [];
  const uri = { fsPath: 'C:/test.md', scheme: 'file', toString: () => documentUri };
  const makeUserUri = (value: string) => ({ scheme: 'vscode-userdata', path: value, toString: () => `vscode-userdata:${value}` });
  const storage = userdata ? makeUserUri('/global') : { fsPath: root, scheme: 'file', toString: () => 'file:///storage' };
  let creates = 0;
  const virtualFiles = new Map<string, Uint8Array>();
  const absent = () => Object.assign(new Error('missing'), { code: 'FileNotFound' });
  const document = { uri, version: 1, getText: () => 'First\n\nSecond', eol: 1 };
  const mock = {
    Uri: { parse: () => uri, joinPath: (base: { scheme: string; path?: string }, ...parts: string[]) => base.scheme === 'vscode-userdata' ? makeUserUri([base.path, ...parts].join('/')) : uri }, EndOfLine: { CRLF: 2 },
    env: { language: 'en', remoteName: undefined },
    workspace: {
      workspaceFolders: [], getConfiguration: () => ({ get: (key: string) => key === 'experimentalRecovery' ? enabled : 'en' }),
      onDidChangeTextDocument: () => ({ dispose() {} }),
      fs: {
        createDirectory: async () => { if (failFirstCreate && creates++ === 0) throw new Error('unavailable'); },
        readDirectory: async (item: { path: string }) => [...virtualFiles.keys()].filter((key) => key.startsWith(item.path + '/')).map((key) => [key.slice(item.path.length + 1), 1]),
        stat: async (item: { path: string }) => { const bytes = virtualFiles.get(item.path); if (!bytes) throw absent(); return { type: 1, size: bytes.length }; },
        readFile: async (item: { path: string }) => { const bytes = virtualFiles.get(item.path); if (!bytes) throw absent(); return bytes; },
        writeFile: async (item: { path: string }, bytes: Uint8Array) => { virtualFiles.set(item.path, bytes); },
        rename: async (from: { path: string }, to: { path: string }) => { const bytes = virtualFiles.get(from.path); if (!bytes) throw absent(); if (virtualFiles.has(to.path)) throw new Error('exists'); virtualFiles.set(to.path, bytes); virtualFiles.delete(from.path); },
        delete: async (item: { path: string }) => { if (!virtualFiles.delete(item.path)) throw absent(); },
      },
      openTextDocument: async ({ content }: { content: string }) => { opened.push(content); return {}; },
    },
    window: {
      showInformationMessage: async () => undefined, showErrorMessage: async () => undefined,
      showQuickPick: async (items: unknown[]) => items[0], showTextDocument: async () => ({}),
      showWarningMessage: async () => undefined,
    },
    commands: { executeCommand: async () => {} },
  };
  const panel = { webview: { options: {}, cspSource: 'csp', html: '', asWebviewUri: () => ({ toString: () => 'script' }),
    onDidReceiveMessage(handler: typeof receive) { receive = handler; return { dispose() {} }; },
    postMessage: async (event: Record<string, unknown>) => { replies.push(event); return true; } }, onDidDispose() {} };
  const context = { extensionUri: uri, globalStorageUri: storage, globalState: { get: () => true, update: async () => {} } };
  const nodeRequire = createRequire(import.meta.url);
  const module = { exports: {} as { attachMarkdownEditor: (document: unknown, panel: unknown, context: unknown) => void } };
  new Function('require', 'module', 'exports', compiled)((id: string) => id === 'vscode' ? mock : nodeRequire(id), module, module.exports);
  module.exports.attachMarkdownEditor(document, panel, context);
  return { receive: (event: Record<string, unknown>) => receive(event), replies, opened, virtualFiles, source: document.getText };
}

describe('editor recovery checkpoint integration', () => {
  it('does not create a checkpoint when experimental recovery is disabled', async () => {
    const editor = host(false, true, false);
    await editor.receive({ type: 'recovery-checkpoint', draftId: 'generation-1', revision: 1, line: 0, blockType: 'paragraph_open', value: 'private text' });
    expect(editor.replies).toContainEqual({ type: 'recovery-failed', draftId: 'generation-1', revision: 1 });
    expect(editor.virtualFiles.size).toBe(0);
    await editor.receive({ type: 'review-recovery' });
    expect(editor.source()).toBe('First\n\nSecond');
  });
  it('writes and opens a draft using the vscode-userdata provider without converting its URI to a filesystem path', async () => {
    const editor = host(false, true);
    await editor.receive({ type: 'recovery-checkpoint', draftId: 'generation-1', revision: 1, line: 0, blockType: 'paragraph_open', value: 'provider draft' });
    await vi.waitFor(() => expect(editor.replies).toContainEqual({ type: 'recovery-checkpointed', draftId: 'generation-1', revision: 1 }), { timeout: 5000 });
    expect([...editor.virtualFiles.keys()].every((key) => key.startsWith('/global/recovery-provider-v1/'))).toBe(true);
    await editor.receive({ type: 'review-recovery' });
    expect(editor.opened).toEqual(['provider draft']);
    expect(editor.source()).toBe('First\n\nSecond');
  });
  it('retains the latest draft per block for explicit review after a new editor session', async () => {
    const first = host();
    await first.receive({ type: 'recovery-checkpoint', draftId: 'generation-1', revision: 1, line: 0, blockType: 'paragraph_open', value: 'first draft' });
    await first.receive({ type: 'recovery-checkpoint', draftId: 'generation-1', revision: 2, line: 0, blockType: 'paragraph_open', value: 'latest draft' });
    await first.receive({ type: 'recovery-checkpoint', draftId: 'generation-2', revision: 1, line: 2, blockType: 'paragraph_open', value: 'other block' });
    await vi.waitFor(() => expect(first.replies).toContainEqual({ type: 'recovery-checkpointed', draftId: 'generation-1', revision: 2 }), { timeout: 5000 });
    await vi.waitFor(() => expect(first.replies).toContainEqual({ type: 'recovery-checkpointed', draftId: 'generation-2', revision: 1 }), { timeout: 5000 });
    const records = (await new RecoveryJournal(root).list()).records;
    expect(records.map((item) => item.draft).sort()).toEqual(['latest draft', 'other block']);
    expect(records.find((item) => item.draft === 'other block')?.anchor).toEqual({ start: 7, end: 13, original: 'Second' });
    expect(first.source()).toBe('First\n\nSecond');
    const reopened = host();
    await reopened.receive({ type: 'review-recovery' });
    expect(reopened.opened).toHaveLength(1);
    expect(['latest draft', 'other block']).toContain(reopened.opened[0]);
    expect(reopened.source()).toBe('First\n\nSecond');
    expect((await new RecoveryJournal(root).list()).records).toHaveLength(2);
  });

  it('reports storage failure and retries on later input without pretending the first draft was stored', async () => {
    const editor = host(true);
    await editor.receive({ type: 'recovery-checkpoint', draftId: 'generation-1', revision: 1, line: 0, blockType: 'paragraph_open', value: 'first' });
    await vi.waitFor(() => expect(editor.replies).toContainEqual({ type: 'recovery-failed', draftId: 'generation-1', revision: 1 }), { timeout: 5000 });
    expect((await new RecoveryJournal(root).list()).records).toHaveLength(0);
    await editor.receive({ type: 'recovery-checkpoint', draftId: 'generation-1', revision: 2, line: 0, blockType: 'paragraph_open', value: 'retry' });
    await vi.waitFor(() => expect(editor.replies).toContainEqual({ type: 'recovery-checkpointed', draftId: 'generation-1', revision: 2 }), { timeout: 5000 });
    expect((await new RecoveryJournal(root).list()).records[0].draft).toBe('retry');
    expect(editor.source()).toBe('First\n\nSecond');
  });
});
