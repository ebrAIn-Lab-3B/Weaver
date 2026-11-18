import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';
import { markdownClient } from '../../../apps/vscode-extension/src/markdownWebview';

/** Run the actual extension host message handler with a small in-memory VS Code document. */
async function editorHost(initial: string) {
  let text = initial;
  let onChange: (event: unknown) => void = () => {};
  let onMessage: (event: Record<string, unknown>) => Promise<void> = async () => {};
  const replies: Record<string, unknown>[] = [];
  class Position { constructor(public line: number, public character: number) {} }
  class Range { constructor(public start: Position, public end: Position) {} }
  class WorkspaceEdit {
    changes: { start: Position; end: Position; text: string }[] = [];
    replace(_uri: unknown, range: Range, value: string) { this.changes.push({ start: range.start, end: range.end, text: value }); }
    insert(_uri: unknown, position: Position, value: string) { this.changes.push({ start: position, end: position, text: value }); }
  }
  const uri = { fsPath: 'C:/test.md', scheme: 'file', toString: () => 'file:///test.md' };
  const document = {
    uri, version: 1, eol: 1,
    get lineCount() { return text.split('\n').length; },
    getText: () => text,
    lineAt(line: number) { const value = text.split('\n')[line]; return { text: value, range: new Range(new Position(line, 0), new Position(line, value.length)) }; },
    offsetAt(pos: Position) { return text.split('\n').slice(0, pos.line).reduce((sum, item) => sum + item.length + 1, 0) + pos.character; },
    positionAt(offset: number) { const before = text.slice(0, offset).split('\n'); return new Position(before.length - 1, before.at(-1)!.length); },
    save: async () => true,
  };
  const mock = {
    Position, Range, WorkspaceEdit, EndOfLine: { CRLF: 2 },
    Uri: { joinPath: () => uri, file: () => uri, parse: () => uri },
    env: { language: 'en', openExternal: async () => {} },
    window: { visibleTextEditors: [], showWarningMessage: () => {}, showInformationMessage: () => {}, showErrorMessage: () => {} },
    commands: { executeCommand: async () => {} },
    workspace: {
      workspaceFolders: [], getConfiguration: () => ({ get: () => 'en' }),
      onDidChangeTextDocument: (handler: typeof onChange) => { onChange = handler; return { dispose() {} }; },
      applyEdit: async (_edit: WorkspaceEdit) => { throw new Error('document changed before apply'); },
    },
  };
  const panel = {
    viewColumn: 1,
    webview: {
      options: {}, cspSource: 'csp', html: '', asWebviewUri: () => ({ toString: () => 'script' }),
      onDidReceiveMessage(handler: typeof onMessage) { onMessage = handler; return { dispose() {} }; },
      postMessage: async (event: Record<string, unknown>) => { replies.push(event); return true; },
    },
    onDidDispose() {},
  };
  const bundle = await build({ entryPoints: [path.resolve(process.cwd(), '../../apps/vscode-extension/src/markdownEditor.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], write: false, logLevel: 'silent' });
  const nodeRequire = createRequire(import.meta.url);
  const module = { exports: {} as { attachMarkdownEditor: (document: unknown, panel: unknown, context: unknown) => void } };
  const load = (id: string) => id === 'vscode' ? mock : nodeRequire(id);
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(load, module, module.exports);
  module.exports.attachMarkdownEditor(document, panel, { extensionUri: uri });
  return { receive: (event: Record<string, unknown>) => onMessage(event), replies, source: () => text,
    external: (next: string) => {
      const old = text;
      text = next; document.version++;
      onChange({ document, contentChanges: [{ rangeOffset:0, rangeLength:old.length, text:next }] });
    },
  };
}

describe('rejected host document edits', () => {
  it('keeps an external document update and an unsent inline draft', async () => {
    const host = await editorHost('Hello');
    const dom = new JSDOM('<button id="source"></button><main><p contenteditable="plaintext-only" data-inline-original="Hello" data-source-line="0" data-source-end="1" data-source-type="paragraph_open">Hello</p></main>', {runScripts:'outside-only'});
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({postMessage:(event:Record<string, unknown>) => sent.push(event)}), editorConfig:{version:1, labels:{conflict:'Conflict',copyDraft:'Copy',openDraft:'Open'}} });
    dom.window.eval(markdownClient);
    const field = dom.window.document.querySelector('p') as HTMLElement;
    field.focus(); await host.receive(sent[0]);
    field.textContent = 'My unsent draft'; field.dispatchEvent(new dom.window.Event('input', { bubbles:true }));
    host.external('External revision');
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {data:host.replies.at(-1)}));
    await host.receive(sent[1]);
    expect(host.source()).toBe('External revision');
    expect(field.textContent).toBe('My unsent draft');
    expect(dom.window.document.querySelector('[role="alert"]')?.textContent).toContain('Copy');
    expect(host.replies.at(-1)).toMatchObject({type:'edit-failed'});
    dom.window.close();
  });

  it('preserves the active draft and exposes copy/open after a refused change', async () => {
    const host = await editorHost('Hello');
    const dom = new JSDOM('<button id="source"></button><main><p contenteditable="plaintext-only" data-inline-original="Hello" data-source-line="0" data-source-end="1" data-source-type="paragraph_open">Hello</p></main>', { runScripts:'outside-only' });
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({postMessage:(event:Record<string, unknown>) => sent.push(event)}), editorConfig:{version:1, labels:{conflict:'Conflict',copyDraft:'Copy draft',openDraft:'Open draft'}} });
    dom.window.eval(markdownClient);
    const field = dom.window.document.querySelector('p') as HTMLElement;
    field.focus(); field.textContent = 'Uncommitted draft'; field.dispatchEvent(new dom.window.Event('input', { bubbles:true }));
    for (const event of sent.slice()) await host.receive(event);
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {data:host.replies.at(-1)}));
    expect(host.source()).toBe('Hello');
    expect(field.textContent).toBe('Uncommitted draft');
    expect(dom.window.document.querySelector('[role="alert"]')?.textContent).toContain('Copy draft');
    expect(dom.window.document.querySelector('[role="alert"]')?.textContent).toContain('Open draft');
    dom.window.close();
  });

  it('reports a rejected checklist change without claiming success', async () => {
    const host = await editorHost('- [ ] Task');
    await expect(host.receive({type:'checklist-toggle', line:0, version:1, expected:'- [ ] Task', checked:true})).resolves.toBeUndefined();
    expect(host.source()).toBe('- [ ] Task');
    expect(host.replies.at(-1)).toMatchObject({type:'checklist-result', ok:false});
  });

  it.each([
    ['inline-change', { line:0, blockType:'paragraph_open', expected:'Hello', value:'Draft' }],
    ['slot-change', { line:0, kind:'paragraph', value:'Draft' }],
    ['split', { line:0, blockType:'paragraph_open', expected:'Hello', caret:2, selectionEnd:2 }],
    ['finish', { line:0, next:true, blockType:'paragraph_open', expected:'Hello', caret:2, selectionEnd:2 }],
  ])('reports a rejected %s edit without changing the document', async (type, fields) => {
    const host = await editorHost('Hello');
    await host.receive({ type:'focus' });
    await expect(host.receive({ type, version:1, ...fields })).resolves.toBeUndefined();
    expect(host.source()).toBe('Hello');
    expect(host.replies.at(-1)).toMatchObject({ type:'edit-failed' });
  });
});
