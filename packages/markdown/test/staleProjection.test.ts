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
      applyEdit: async (edit: WorkspaceEdit) => {
        for (const change of edit.changes) {
          const start = document.offsetAt(change.start), end = document.offsetAt(change.end);
          text = text.slice(0, start) + change.text + text.slice(end);
          document.version++;
          onChange({ document, contentChanges: [{ rangeOffset: start, rangeLength: end - start, text: change.text }] });
        }
        return true;
      },
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
  return { receive: (event: Record<string, unknown>) => onMessage(event), replies, source: () => text };
}

describe('pending edits after a structural change', () => {
  it('applies a split and text typed immediately afterwards using the actual host handler', async () => {
    const host = await editorHost('First\n\nSecond');
    const dom = new JSDOM('<button id="source"></button><main><p contenteditable="plaintext-only" data-inline-original="First" data-source-line="0" data-source-end="1" data-source-type="paragraph_open">First</p><p contenteditable="plaintext-only" data-inline-original="Second" data-source-line="2" data-source-end="3" data-source-type="paragraph_open">Second</p></main>', { runScripts: 'outside-only' });
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { version:1, labels: { conflict:'Conflict', copyDraft:'Copy', openDraft:'Open' } } });
    dom.window.eval(markdownClient);
    const first = dom.window.document.querySelector('p') as HTMLElement;
    first.focus(); const range = dom.window.document.createRange(); range.setStart(first.firstChild!, 2); range.collapse(true);
    dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }));
    const right = first.nextElementSibling as HTMLElement;
    right.textContent = 'typed rst'; right.dispatchEvent(new dom.window.Event('input', { bubbles:true }));
    await host.receive(sent[0]); await host.receive(sent[1]);
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data:host.replies.at(-1) }));
    expect(sent.at(-1)).toMatchObject({ type:'split' });
    await host.receive(sent.at(-1)!);
    expect(host.source()).toBe('Fi\n\nrst\n\nSecond');
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data:host.replies.at(-1) }));
    expect(sent.at(-1)).toMatchObject({ type:'inline-change', line:2, value:'typed rst' });
    await host.receive(sent.at(-1)!);
    expect(host.source()).toBe('Fi\n\ntyped rst\n\nSecond');
    expect(dom.window.document.querySelectorAll('p')[2].dataset.sourceLine).toBe('4');
    dom.window.close();
  });
  it('splits an inserted paragraph and preserves immediate input with the actual host', async () => {
    const host = await editorHost('First\n\nFollowing');
    const dom = new JSDOM('<button id="source"></button><main><p data-source-line="0">First</p><div class="insert-slot" data-insert-line="2"><div class="insert-field" contenteditable="plaintext-only"></div></div><p contenteditable="plaintext-only" data-inline-original="Following" data-source-line="2" data-source-type="paragraph_open">Following</p></main>', {runScripts:'outside-only'});
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({postMessage:(event:Record<string, unknown>) => sent.push(event)}), editorConfig:{version:1, labels:{conflict:'Conflict', copyDraft:'Copy', openDraft:'Open'}} });
    dom.window.eval(markdownClient);
    const field = dom.window.document.querySelector('.insert-field') as HTMLElement; field.focus();
    field.textContent = 'AlphaBeta'; field.dispatchEvent(new dom.window.Event('input', {bubbles:true}));
    const range = dom.window.document.createRange(); range.setStart(field.firstChild!,5); range.collapse(true); dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    field.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    const right = field.parentElement!.nextElementSibling as HTMLElement; right.textContent = 'typed Beta'; right.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    await host.receive(sent[0]); await host.receive(sent[1]); dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:host.replies.at(-1)}));
    await host.receive(sent.at(-1)!); dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:host.replies.at(-1)}));
    await host.receive(sent.at(-1)!); dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:host.replies.at(-1)}));
    expect(sent.at(-1)).toMatchObject({type:'inline-change',value:'typed Beta'}); await host.receive(sent.at(-1)!);
    expect(host.source()).toBe('First\n\nAlpha\n\ntyped Beta\n\nFollowing');
    expect((dom.window.document.querySelector('[data-inline-original="Following"]') as HTMLElement).dataset.sourceLine).toBe('6'); dom.window.close();
  });
  it('creates an editable paragraph after a heading through the host', async () => {
    const host = await editorHost('## Title\n\nFollowing');
    await host.receive({ type:'focus' });
    await host.receive({ type:'split', line:0, blockType:'heading_open', version:1, expected:'## Title', caret:5, selectionEnd:5 });
    expect(host.replies.at(-1)).toMatchObject({ type:'split-applied', nextLine:2, rightExpected:'' });
    await host.receive({ type:'inline-change', line:2, blockType:'paragraph_open', version:2, expected:'', value:'Next' });
    expect(host.source()).toBe('## Title\n\nNext\n\nFollowing');
  });
  it('does not change the document if a split would create Markdown syntax', async () => {
    const host = await editorHost('text # heading');
    await host.receive({ type:'focus' });
    await host.receive({ type:'split', line:0, blockType:'paragraph_open', version:1, expected:'text # heading', caret:5, selectionEnd:5 });
    expect(host.source()).toBe('text # heading');
    expect(host.replies.at(-1)).toMatchObject({ type:'edit-failed' });
  });
  it('splits a checklist item and rejects a split from a stale projection', async () => {
    const host = await editorHost('- [x] hello\n\nSame');
    await host.receive({ type: 'focus' });
    await host.receive({ type: 'finish', line: 0, next: true, caret: 2, selectionEnd: 2, blockType: 'list_item_inline', version: 1, expected: '- [x] hello' });
    expect(host.source()).toBe('- [x] he\n- [ ] llo\n\nSame');
    await host.receive({ type: 'focus' });
    await host.receive({ type: 'finish', line: 0, next: true, preserve: true, caret: 1, selectionEnd: 1, blockType: 'list_item_inline', version: 2, expected: '- [x] he' });
    await host.receive({ type: 'finish', line: 1, next: true, caret: 1, selectionEnd: 1, blockType: 'list_item_inline', version: 2, expected: '- [ ] llo' });
    expect(host.source()).toBe('- [x] he\n- [ ] llo\n\nSame');
    expect(host.replies.at(-1)).toMatchObject({ type: 'edit-failed' });
  });
  it('rejects a stale duplicate-line edit in the actual host and keeps the webview draft', async () => {
    const host = await editorHost('A\n\nSame');
    const dom = new JSDOM('<button id="source"></button><main><div class="insert-slot" data-insert-line="2"><div class="insert-field" contenteditable="plaintext-only"></div></div><p contenteditable="plaintext-only" data-inline-original="Same" data-source-line="2" data-source-type="paragraph_open">Same</p></main>', { runScripts: 'outside-only' });
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { version: 1, labels: { conflict: 'Conflict' } } });
    dom.window.eval(markdownClient);
    const inserted = dom.window.document.querySelector('.insert-field') as HTMLElement;
    const original = dom.window.document.querySelector('p') as HTMLElement;
    inserted.focus(); inserted.textContent = 'Same'; inserted.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    original.focus(); original.textContent = 'changed'; original.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await host.receive(sent[0]); await host.receive(sent[1]);
    expect(host.source()).toBe('A\n\nSame\n\nSame');
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: host.replies.at(-1) }));
    const actions = sent.slice(2);
    expect(actions.map((event) => event.type)).toEqual(['finish', 'focus', 'inline-change']);
    for (const action of actions) await host.receive(action);
    expect(host.source()).toBe('A\n\nSame\n\nSame');
    const error = host.replies.at(-1)!;
    expect(error.type).toBe('edit-failed');
    expect(error.detail).toContain('has not been saved');
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: error }));
    expect(original.textContent).toBe('changed');
    expect(dom.window.document.querySelector('[role="alert"]')?.textContent).toContain('has not been saved');
    dom.window.close();
  });
  it('does not render over a queued draft when Enter splits a paragraph', async () => {
    const host = await editorHost('First\n\nSecond');
    await host.receive({ type: 'focus' });
    await host.receive({ type: 'finish', line: 0, next: true, preserve: true, caret: 2, selectionEnd: 2, blockType: 'paragraph_open', version: 1, expected: 'First' });
    await host.receive({ type: 'focus' });
    await host.receive({ type: 'inline-change', line: 2, version: 1, expected: 'Second', blockType: 'paragraph_open', value: 'Pending draft' });
    expect(host.source()).toBe('First\n\nSecond');
    expect(host.replies.at(-1)).toMatchObject({ type: 'edit-failed', detail: expect.stringContaining('has not been saved') });
  });
  it('rejects queued edits and checklist changes after a code block changes line count', async () => {
    const host = await editorHost('```js\nold\n```\n\n- [ ] Same');
    await host.receive({ type: 'focus' });
    await host.receive({ type: 'fence-change', line: 0, endLine: 3, expected: 'old\n', value: 'old\nnew\n', version: 1 });
    expect(host.source()).toBe('```js\nold\nnew\n```\n\n- [ ] Same');
    await host.receive({ type: 'finish', line: 0, preserve: true });
    await host.receive({ type: 'focus' });
    await host.receive({ type: 'inline-change', line: 4, version: 2, expected: '- [ ] Same', blockType: 'list_item_inline', value: 'Changed' });
    expect(host.replies.at(-1)).toMatchObject({ type: 'edit-failed', detail: expect.stringContaining('has not been saved') });
    await host.receive({ type: 'checklist-toggle', line: 4, version: 2, expected: '- [ ] Same', checked: true });
    expect(host.replies.at(-1)).toMatchObject({ type: 'checklist-result', ok: false });
    expect(host.source()).toBe('```js\nold\nnew\n```\n\n- [ ] Same');
  });
});
