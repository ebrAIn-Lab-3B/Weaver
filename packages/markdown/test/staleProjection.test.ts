import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';
import { markdownClient } from '../../../apps/vscode-extension/src/markdownWebview';
import { renderMarkdown } from '../../../apps/vscode-extension/src/renderMarkdown';

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
  const identity = () => {
    const config = JSON.parse(panel.webview.html.match(/const editorConfig=(.*?);\s*const inlinePrefix/s)![1]);
    return { documentId: config.documentId as string, projectionId: config.projectionId as string };
  };
  let directSplitId = 0;
  return { receive: (event: Record<string, unknown>) => onMessage(event.type === 'split' && event.transactionId === undefined
    ? { ...event, ...identity(), transactionId: `${identity().projectionId}:direct-${++directSplitId}` } : event),
    identity, replies, source: () => text, html: () => panel.webview.html };
}

describe('pending edits after a structural change', () => {
  it('applies multiline paste into a new slot through the host', async () => {
    const host = await editorHost('Before\n\nAfter');
    const dom = new JSDOM('<button id="source"></button><main><p data-source-line="0">Before</p><div class="insert-slot" data-insert-line="2"><div class="insert-field" contenteditable="plaintext-only"></div></div><p data-source-line="2">After</p></main>', {runScripts:'outside-only'});
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi:()=>({postMessage:(event:Record<string,unknown>)=>sent.push(event)}), editorConfig:{...host.identity(),version:1,labels:{conflict:'Conflict',copyDraft:'Copy',openDraft:'Open'}} });
    dom.window.eval(markdownClient);
    const node=dom.window.document.querySelector<HTMLElement>('.insert-field')!; node.focus();
    const range=dom.window.document.createRange(); range.selectNodeContents(node); range.collapse(true); dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    const paste=new dom.window.Event('paste',{bubbles:true,cancelable:true}); Object.defineProperty(paste,'clipboardData',{value:{getData:()=> 'ONE\nTWO\nTHREE'}}); node.dispatchEvent(paste);
    let cursor=0, reply=0;
    while (cursor < sent.length && cursor < 30) { await host.receive(sent[cursor++]); while (reply < host.replies.length) dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:host.replies[reply++]})); }
    expect(host.source()).toBe('Before\n\nONE\n\nTWO\n\nTHREE\n\nAfter');
    expect(host.replies.some(event=>event.type==='edit-failed')).toBe(false);
    dom.window.close();
  });
  it('preserves a blank paragraph separator when pasting into a new slot', async () => {
    const host=await editorHost('Before\n\nAfter');
    const dom=new JSDOM('<button id="source"></button><main><p data-source-line="0">Before</p><div class="insert-slot" data-insert-line="2"><div class="insert-field" contenteditable="plaintext-only"></div></div><p data-source-line="2">After</p></main>',{runScripts:'outside-only'});
    const sent:Record<string,unknown>[]=[];
    Object.assign(dom.window,{acquireVsCodeApi:()=>({postMessage:(event:Record<string,unknown>)=>sent.push(event)}),editorConfig:{...host.identity(),version:1,labels:{conflict:'Conflict',copyDraft:'Copy',openDraft:'Open'}}}); dom.window.eval(markdownClient);
    const node=dom.window.document.querySelector<HTMLElement>('.insert-field')!; node.focus();
    const range=dom.window.document.createRange(); range.selectNodeContents(node); range.collapse(true); dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    const paste=new dom.window.Event('paste',{bubbles:true,cancelable:true}); Object.defineProperty(paste,'clipboardData',{value:{getData:()=> 'Alpha\n\nBeta'}}); node.dispatchEvent(paste);
    let cursor=0,reply=0; while(cursor<sent.length && cursor<30) { await host.receive(sent[cursor++]); while(reply<host.replies.length) dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:host.replies[reply++]})); }
    expect(host.source()).toBe('Before\n\nAlpha\n\nBeta\n\nAfter');
    expect(host.replies.some(event=>event.type==='edit-failed')).toBe(false); dom.window.close();
  });
  it('refuses a split from a different projection or a reused transaction', async () => {
    const host = await editorHost('First');
    await host.receive({ type: 'focus' });
    const base = { type: 'split', line: 0, blockType: 'paragraph_open', version: 1, expected: 'First', caret: 2, selectionEnd: 2, ...host.identity() };
    await host.receive({ ...base, projectionId: 'stale', transactionId: 'stale:1' });
    expect(host.source()).toBe('First'); expect(host.replies.at(-1)?.type).toBe('edit-failed');
    const id = `${host.identity().projectionId}:unique`;
    await host.receive({ ...base, transactionId: id });
    expect(host.source()).toBe('Fi\n\nrst'); expect(host.replies.at(-1)).toMatchObject({ type: 'split-applied', transactionId: id });
    await host.receive({ ...base, version: 2, expected: 'Fi', transactionId: id });
    expect(host.source()).toBe('Fi\n\nrst'); expect(host.replies.at(-1)?.type).toBe('edit-failed');
  });
  it('applies a slash selection typed before the preceding block is acknowledged', async () => {
    const host = await editorHost('First\n\nSecond');
    const dom = new JSDOM('<button id="source"></button><main><p contenteditable="plaintext-only" data-inline-original="First" data-source-line="0" data-source-type="paragraph_open">First</p><div class="insert-slot" data-insert-line="2"><div class="insert-field" contenteditable="plaintext-only"></div></div><p data-source-line="2">Second</p></main>', { runScripts: 'outside-only' });
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { ...host.identity(), version: 1, labels: { heading: 'Heading', bullet: 'Bullet', checklist: 'Checklist', code: 'Code', menu: 'Menu', conflict: 'Conflict' } } });
    dom.window.eval(markdownClient);
    const first = dom.window.document.querySelector('p') as HTMLElement;
    const field = dom.window.document.querySelector<HTMLElement>('.insert-field')!;
    first.focus(); first.textContent = 'Changed'; first.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    field.focus(); field.textContent = '/check'; field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    field.textContent = 'Task'; field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    let cursor = 0, reply = 0;
    while (cursor < sent.length && cursor < 20) { await host.receive(sent[cursor++]); while (reply < host.replies.length) dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: host.replies[reply++] })); }
    expect(host.source()).toBe('Changed\n\n- [ ] Task\n\nSecond');
    expect(host.replies.some(event => event.type === 'edit-failed')).toBe(false);
    dom.window.close();
  });
  it('inserts a checklist in an earlier slot after saving a later paragraph', async () => {
    const host = await editorHost('First\n\nSecond');
    const dom = new JSDOM('<button id="source"></button><main><p data-source-line="0">First</p><div class="insert-slot" data-insert-line="2"><div class="insert-field" contenteditable="plaintext-only"></div></div><p data-source-line="2">Second</p><div class="insert-slot" data-insert-line="3"><div class="insert-field" contenteditable="plaintext-only"></div></div></main>', { runScripts: 'outside-only' });
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { ...host.identity(), version: 1, labels: { heading: 'Heading', bullet: 'Bullet', checklist: 'Checklist', code: 'Code', menu: 'Menu', conflict: 'Conflict' } } });
    dom.window.eval(markdownClient);
    const [earlier, later] = [...dom.window.document.querySelectorAll<HTMLElement>('.insert-field')];
    let cursor = 0, reply = 0;
    const drain = async () => { while (cursor < sent.length && cursor < 20) { await host.receive(sent[cursor++]); while (reply < host.replies.length) dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: host.replies[reply++] })); } };
    later.focus(); later.textContent = 'Last'; later.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await drain();
    later.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    await drain();
    earlier.focus(); await new Promise(resolve => setTimeout(resolve, 5)); await drain();
    earlier.textContent = '/check'; earlier.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    earlier.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    earlier.textContent = 'Task'; earlier.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 5)); await drain();
    expect(host.source()).toBe('First\n\n- [ ] Task\n\nSecond\n\nLast\n');
    expect(host.replies.some(event => event.type === 'edit-failed')).toBe(false);
    dom.window.close();
  });
  it('edits a preceding block after saving a newly inserted heading', async () => {
    const host = await editorHost('First\n\nFollowing');
    const dom = new JSDOM('<button id="source"></button><main><p contenteditable="plaintext-only" data-inline-original="First" data-source-line="0" data-source-type="paragraph_open">First</p><div class="insert-slot" data-insert-line="2"><div class="insert-field" contenteditable="plaintext-only"></div></div><p data-source-line="2">Following</p></main>', { runScripts: 'outside-only' });
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { ...host.identity(), version: 1, labels: { heading: 'Heading', bullet: 'Bullet', checklist: 'Checklist', code: 'Code', menu: 'Menu', conflict: 'Conflict', copyDraft: 'Copy', openDraft: 'Open' } } });
    dom.window.eval(markdownClient);
    const field = dom.window.document.querySelector('.insert-field') as HTMLElement;
    const first = dom.window.document.querySelector('p') as HTMLElement;
    field.focus(); field.textContent = '/head'; field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    field.textContent = 'New heading'; field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    let cursor = 0, reply = 0;
    const drain = async () => { while (cursor < sent.length && cursor < 20) { await host.receive(sent[cursor++]); while (reply < host.replies.length) dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: host.replies[reply++] })); } };
    await drain();
    field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    await drain();
    first.focus(); first.textContent = 'First edited'; first.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 5)); await drain();
    expect(host.source()).toBe('First edited\n\n## New heading\n\nFollowing');
    expect(host.replies.some(event => event.type === 'edit-failed')).toBe(false);
    dom.window.close();
  });
  it('applies multiline paste with immediate typing through the actual host', async () => {
    const host = await editorHost('abcd\n\nFollowing');
    const dom = new JSDOM('<button id="source"></button><main><p contenteditable="plaintext-only" data-inline-original="abcd" data-source-line="0" data-source-end="1" data-source-type="paragraph_open">abcd</p><p contenteditable="plaintext-only" data-inline-original="Following" data-source-line="2" data-source-end="3" data-source-type="paragraph_open">Following</p></main>', {runScripts:'outside-only'});
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi:()=>({postMessage:(event:Record<string,unknown>)=>sent.push(event)}), editorConfig:{ ...host.identity(),version:1,labels:{conflict:'Conflict',copyDraft:'Copy',openDraft:'Open'}} });
    dom.window.eval(markdownClient);
    const node=dom.window.document.querySelector('p') as HTMLElement; node.focus();
    const range=dom.window.document.createRange(); range.setStart(node.firstChild!,1); range.setEnd(node.firstChild!,3); dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    const paste=new dom.window.Event('paste',{bubbles:true,cancelable:true}); Object.defineProperty(paste,'clipboardData',{value:{getData:()=> 'ONE\nTWO\nTHREE'}}); node.dispatchEvent(paste);
    const tail=dom.window.document.querySelectorAll('p')[2]; tail.textContent='typed '+tail.textContent; tail.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    let index=0, replyIndex=0;
    while(index < sent.length && index < 20) { await host.receive(sent[index++]); while(replyIndex < host.replies.length) dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:host.replies[replyIndex++]})); }
    expect(host.source()).toBe('aONE\n\nTWO\n\ntyped THREEd\n\nFollowing');
    expect((dom.window.document.querySelector('[data-inline-original="Following"]') as HTMLElement).dataset.sourceLine).toBe('6');
    dom.window.close();
  });
  it('keeps checklist markers while pasting multiple lines through the host', async () => {
    const host=await editorHost('- [x] abcd\n\nFollowing');
    const dom=new JSDOM('<button id="source"></button><main><ul><li><input type="checkbox" checked data-checklist-line="0" data-checklist-expected="- [x] abcd"><span contenteditable="plaintext-only" data-inline-original="- [x] abcd" data-source-line="0" data-source-end="1" data-source-type="list_item_inline">abcd</span></li></ul><p data-source-line="2">Following</p></main>',{runScripts:'outside-only'});
    const sent:Record<string,unknown>[]=[]; Object.assign(dom.window,{acquireVsCodeApi:()=>({postMessage:(event:Record<string,unknown>)=>sent.push(event)}),editorConfig:{ ...host.identity(),version:1,labels:{conflict:'Conflict',copyDraft:'Copy',openDraft:'Open'}}}); dom.window.eval(markdownClient);
    const node=dom.window.document.querySelector('span') as HTMLElement; node.focus(); const range=dom.window.document.createRange(); range.setStart(node.firstChild!,1); range.setEnd(node.firstChild!,3); dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    const paste=new dom.window.Event('paste',{bubbles:true,cancelable:true}); Object.defineProperty(paste,'clipboardData',{value:{getData:()=> 'ONE\nTWO\nTHREE'}}); node.dispatchEvent(paste);
    let index=0, replyIndex=0; while(index < sent.length && index < 20) { await host.receive(sent[index++]); while(replyIndex < host.replies.length) dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:host.replies[replyIndex++]})); }
    expect(host.source()).toBe('- [x] aONE\n- [ ] TWO\n- [ ] THREEd\n\nFollowing');
    expect([...dom.window.document.querySelectorAll('input')].map(box=>box.checked)).toEqual([true,false,false]); dom.window.close();
  });
  it('toggles and edits a nested checklist leaf without changing its parent or peers', async () => {
    const source='- Parent\n  - [ ] Child\n  - [x] Peer\n- Outside\n';
    const host=await editorHost(source); const html=renderMarkdown(source,value=>value,'Write','Checklist','Open source');
    const dom=new JSDOM('<button id="source"></button><main>'+html+'</main>',{runScripts:'outside-only'}); const sent:Record<string,unknown>[]=[];
    Object.assign(dom.window,{acquireVsCodeApi:()=>({postMessage:(event:Record<string,unknown>)=>sent.push(event)}),editorConfig:{...host.identity(),version:1,labels:{conflict:'Conflict',copyDraft:'Copy',openDraft:'Open',nestedHint:'Open source',source:'Source'}}}); dom.window.eval(markdownClient);
    const box=dom.window.document.querySelector<HTMLInputElement>('input[data-checklist-line="1"]')!; expect(box).toBeTruthy(); box.click();
    let index=0,replyIndex=0;
    const drain=async()=>{while(index<sent.length && index<30) { await host.receive(sent[index++]); while(replyIndex<host.replies.length) dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:host.replies[replyIndex++]})); }};
    await drain();
    expect(host.source()).toBe('- Parent\n  - [x] Child\n  - [x] Peer\n- Outside\n');
    const node=box.closest('li')!.querySelector<HTMLElement>('[data-inline-original]')!; node.focus(); node.textContent='Edited'; node.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    await drain();
    expect(host.source()).toBe('- Parent\n  - [x] Edited\n  - [x] Peer\n- Outside\n');
    expect(host.replies.some(event=>event.type==='edit-failed')).toBe(false); dom.window.close();
  });
  it('edits a nested checklist parent and refuses splitting its children', async () => {
    const source='- Root\n  - [ ] Parent\n    - Child\n  - Peer\n';
    const host=await editorHost(source); const html=renderMarkdown(source,value=>value,'Write','Checklist','Open source');
    const dom=new JSDOM('<button id="source"></button><main>'+html+'</main>',{runScripts:'outside-only'}); const sent:Record<string,unknown>[]=[];
    Object.assign(dom.window,{acquireVsCodeApi:()=>({postMessage:(event:Record<string,unknown>)=>sent.push(event)}),editorConfig:{...host.identity(),version:1,labels:{conflict:'Conflict',copyDraft:'Copy',openDraft:'Open',nestedHint:'Open source',source:'Source'}}}); dom.window.eval(markdownClient);
    const box=dom.window.document.querySelector<HTMLInputElement>('input[data-checklist-line="1"]')!; expect(box).toBeTruthy(); box.click();
    let index=0,replyIndex=0;
    const drain=async()=>{while(index<sent.length && index<30) { await host.receive(sent[index++]); while(replyIndex<host.replies.length) dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:host.replies[replyIndex++]})); }};
    await drain();
    const node=box.closest('li')!.querySelector<HTMLElement>('[data-inline-original]')!; node.focus(); node.textContent='Edited'; node.dispatchEvent(new dom.window.Event('input',{bubbles:true})); await drain();
    const range=dom.window.document.createRange(); range.selectNodeContents(node); range.collapse(false); dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    node.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})); await drain();
    expect(sent.some(event=>event.type==='split-unavailable')).toBe(true);
    expect(host.source()).toBe('- Root\n  - [x] Edited\n    - Child\n  - Peer\n');
    expect(host.replies.some(event=>event.type==='edit-failed')).toBe(false); dom.window.close();
  });
  it('edits and splits a simple nested leaf without changing its ancestors or peers', async () => {
    const source='- Parent\n  - Child\n    - Grandchild\n- Peer\n';
    const host=await editorHost(source); const html=renderMarkdown(source, value=>value, 'Write', 'Checklist', 'Open source');
    const dom=new JSDOM('<button id="source"></button><main>'+html+'</main>',{runScripts:'outside-only'}); const sent:Record<string,unknown>[]=[];
    Object.assign(dom.window,{acquireVsCodeApi:()=>({postMessage:(event:Record<string,unknown>)=>sent.push(event)}),editorConfig:{ ...host.identity(),version:1,labels:{conflict:'Conflict',copyDraft:'Copy',openDraft:'Open',nestedHint:'Open source',source:'Source'}}}); dom.window.eval(markdownClient);
    const node=dom.window.document.querySelector('[data-inline-original="    - Grandchild"]') as HTMLElement; expect(node).toBeTruthy();
    node.focus(); node.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})); expect(dom.window.document.querySelector('[data-nested-hint]')).toBeNull();
    const range=dom.window.document.createRange(); range.setStart(node.firstChild!,5); range.collapse(true); dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    node.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    const right=node.closest('li')!.nextElementSibling!.querySelector('[data-inline-original]') as HTMLElement; right.textContent='new child'; right.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    let index=0,replyIndex=0; while(index<sent.length && index<20) { await host.receive(sent[index++]); while(replyIndex<host.replies.length) dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:host.replies[replyIndex++]})); }
    expect(host.source()).toBe('- Parent\n  - Child\n    - Grand\n    - new child\n- Peer\n'); dom.window.close();
  });
  it('restores the edited block after undo when the history command makes no change', async () => {
    const host = await editorHost('First\n\nSecond');
    await host.receive({type:'focus'});
    const before = host.html();
    await host.receive({type:'finish', line:2, history:true});
    expect(host.html()).toBe(before);
    await host.receive({type:'undo'});
    expect(host.html()).toContain('"focusTextLine":2');
    expect(host.html()).toContain('"focusAfter":2');
  });
  it('applies a split and text typed immediately afterwards using the actual host handler', async () => {
    const host = await editorHost('First\n\nSecond');
    const dom = new JSDOM('<button id="source"></button><main><p contenteditable="plaintext-only" data-inline-original="First" data-source-line="0" data-source-end="1" data-source-type="paragraph_open">First</p><p contenteditable="plaintext-only" data-inline-original="Second" data-source-line="2" data-source-end="3" data-source-type="paragraph_open">Second</p></main>', { runScripts: 'outside-only' });
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { ...host.identity(), version:1, labels: { conflict:'Conflict', copyDraft:'Copy', openDraft:'Open' } } });
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
    Object.assign(dom.window, { acquireVsCodeApi: () => ({postMessage:(event:Record<string, unknown>) => sent.push(event)}), editorConfig:{ ...host.identity(),version:1, labels:{conflict:'Conflict', copyDraft:'Copy', openDraft:'Open'}} });
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
  it('keeps text after repeated empty-slot Enter and leaves existing Markdown unchanged', async () => {
    const host = await editorHost('Following');
    const dom = new JSDOM('<button id="source"></button><main><div class="insert-slot" data-insert-line="0"><div class="insert-field" contenteditable="plaintext-only"></div></div><p data-source-line="0">Following</p></main>', {runScripts:'outside-only'});
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({postMessage:(event:Record<string, unknown>) => sent.push(event)}), editorConfig:{ ...host.identity(),version:1, labels:{}} });
    dom.window.eval(markdownClient);
    let field = dom.window.document.querySelector('.insert-field') as HTMLElement; field.focus();
    for (let i = 0; i < 2; i++) { field.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})); field = dom.window.document.activeElement as HTMLElement; }
    field.textContent = 'New text'; field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    for (const action of sent) await host.receive(action);
    expect(host.source()).toBe('New text\n\nFollowing');
    dom.window.close();
  });
  it.each([['heading', '## Alpha', 'paragraph_open', '## Alpha\n\nNext'], ['bullet', '- Alpha', 'list_item_inline', '- Alpha\n- Next'], ['checklist', '- [ ] Alpha', 'list_item_inline', '- [ ] Alpha\n- [ ] Next']])('splits a new %s slot and preserves immediate typing through the host', async (kind, leftExpected, rightType, expected) => {
    const host = await editorHost('Following');
    const dom = new JSDOM('<button id="source"></button><main><div class="insert-slot" data-insert-line="0"><div class="insert-field" contenteditable="plaintext-only"></div></div><p data-source-line="0">Following</p></main>', {runScripts:'outside-only'});
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({postMessage:(event:Record<string, unknown>) => sent.push(event)}), editorConfig:{ ...host.identity(),version:1, labels:{heading:'heading',bullet:'bullet',checklist:'checklist',code:'code',menu:'menu',conflict:'Conflict'}} });
    dom.window.eval(markdownClient);
    const field = dom.window.document.querySelector('.insert-field') as HTMLElement; field.focus();
    field.textContent = '/' + kind; field.dispatchEvent(new dom.window.Event('input', {bubbles:true}));
    field.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    field.textContent = 'Alpha'; field.dispatchEvent(new dom.window.Event('input', {bubbles:true}));
    const range = dom.window.document.createRange(); range.selectNodeContents(field); range.collapse(false); dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    field.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    const right = (kind === 'heading' ? field.parentElement!.nextElementSibling : field.parentElement!.nextElementSibling!.querySelector('span')) as HTMLElement;
    right.textContent = 'Next'; right.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    let cursor = 0;
    while (cursor < sent.length && cursor < 8) { const msg = sent[cursor++]; await host.receive(msg); const reply = host.replies.at(-1); if (reply && ['edit-applied','split-applied','edit-failed'].includes(String(reply.type))) { host.replies.length = 0; dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:reply})); } }
    expect(host.source()).toBe(expected + '\n\nFollowing');
    expect(dom.window.document.querySelector('[data-inline-original="' + leftExpected + '"]')).not.toBeNull();
    expect(right.dataset.sourceType).toBe(rightType);
    expect((dom.window.document.querySelector('main > p:last-child') as HTMLElement).dataset.sourceLine).toBe(kind === 'heading' ? '4' : '3');
    if (kind === 'checklist') {
      const boxes = [...dom.window.document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
      expect(boxes.map(box => box.dataset.checklistLine)).toEqual(['0', '1']); expect(boxes.map(box => box.dataset.checklistExpected)).toEqual(['- [ ] Alpha', '- [ ] Next']);
      boxes[0].click();
      expect(sent.some(msg => msg.type === 'checklist-stale')).toBe(false);
      expect(sent.at(-1)).toMatchObject({type:'checklist-toggle', line:0, checked:true, expected:'- [ ] Alpha'});
      while (cursor < sent.length) await host.receive(sent[cursor++]);
      expect(host.source()).toBe('- [x] Alpha\n- [ ] Next\n\nFollowing');
    }
    dom.window.close();
  });
  it('moves to the empty slot before an existing heading at its start', async () => {
    const host = await editorHost('## Title\n\nFollowing');
    const dom = new JSDOM('<button id="source"></button><main><div class="insert-slot" data-insert-line="0"><div class="insert-field" contenteditable="plaintext-only"></div></div><h2 contenteditable="plaintext-only" data-inline-original="## Title" data-source-line="0" data-source-type="heading_open">Title</h2></main>', {runScripts:'outside-only'});
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({postMessage:(event:Record<string, unknown>) => sent.push(event)}), editorConfig:{ ...host.identity(),version:1, labels:{}} });
    dom.window.eval(markdownClient);
    const heading=dom.window.document.querySelector('h2')!; heading.focus();
    const range=dom.window.document.createRange(); range.setStart(heading.firstChild!,0); range.collapse(true); dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    heading.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    const field=dom.window.document.querySelector('.insert-field') as HTMLElement;
    expect(dom.window.document.activeElement).toBe(field);
    field.textContent='Before'; field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    await new Promise(resolve => setTimeout(resolve, 5));
    for (let cursor=0; cursor < sent.length && cursor < 10; cursor++) { await host.receive(sent[cursor]); const reply=host.replies.at(-1); if(reply && ['edit-applied','edit-failed'].includes(String(reply.type))) {host.replies.length=0;dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:reply}));} }
    expect(host.source()).toBe('Before\n\n## Title\n\nFollowing'); dom.window.close();
  });
  it.each([['Following', 0, 'Before\n\n## Title\n\nFollowing'], ['Existing', 1, 'Existing\n\nBefore\n\n## Title\n']])('types before a newly inserted heading at the beginning in %s', async (source, line, expected) => {
    const host = await editorHost(source);
    const dom = new JSDOM(`<button id="source"></button><main><div class="insert-slot" data-insert-line="${line}"><div class="insert-field" contenteditable="plaintext-only"></div></div></main>`, {runScripts:'outside-only'});
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({postMessage:(event:Record<string, unknown>) => sent.push(event)}), editorConfig:{ ...host.identity(),version:1, labels:{heading:'heading',bullet:'bullet',checklist:'checklist',code:'code',menu:'menu',conflict:'conflict'}} });
    dom.window.eval(markdownClient);
    const title=dom.window.document.querySelector('.insert-field') as HTMLElement; title.focus();
    title.textContent='/heading'; title.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    title.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    title.textContent='Title'; title.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    const range=dom.window.document.createRange(); range.setStart(title.firstChild!,0); range.collapse(true); dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    title.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    const before=dom.window.document.activeElement as HTMLElement;
    expect(before).not.toBe(title);
    before.textContent='Before'; before.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    await new Promise(resolve => setTimeout(resolve, 5));
    let cursor=0;
    while (cursor < sent.length && cursor < 15) { await host.receive(sent[cursor++]); const reply=host.replies.at(-1); if(reply && ['edit-applied','edit-failed'].includes(String(reply.type))) { host.replies.length=0; dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:reply})); } }
    expect(host.source()).toBe(expected); expect(sent.some(msg => msg.type==='split-unavailable')).toBe(false); dom.window.close();
  });
  it('splits a heading in the middle without losing either half', async () => {
    const host = await editorHost('## AlphaBeta\n\nFollowing');
    await host.receive({ type:'focus' });
    await host.receive({ type:'split', line:0, blockType:'heading_open', version:1, expected:'## AlphaBeta', caret:5, selectionEnd:5 });
    expect(host.source()).toBe('## Alpha\n\nBeta\n\nFollowing');
    expect(host.replies.at(-1)).toMatchObject({ type:'split-applied', nextLine:2, rightExpected:'Beta' });
  });
  it.each(['heading', 'bullet', 'checklist'])('cancels an empty new %s and preserves immediate paragraph typing', async (kind) => {
    const host = await editorHost('Following');
    const dom = new JSDOM('<button id="source"></button><main><div class="insert-slot" data-insert-line="0"><div class="insert-field" contenteditable="plaintext-only"></div></div><p data-source-line="0">Following</p></main>', {runScripts:'outside-only'});
    const sent: Record<string, unknown>[] = [];
    Object.assign(dom.window, { acquireVsCodeApi: () => ({postMessage:(event:Record<string, unknown>) => sent.push(event)}), editorConfig:{ ...host.identity(),version:1, labels:{heading:'heading',bullet:'bullet',checklist:'checklist',code:'code',menu:'menu'}} });
    dom.window.eval(markdownClient);
    const field = dom.window.document.querySelector('.insert-field') as HTMLElement; field.focus();
    field.textContent = '/' + kind; field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    field.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    field.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    field.textContent = 'After'; field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    let cursor = 0;
    while (cursor < sent.length && cursor < 12) { const msg=sent[cursor++]; await host.receive(msg); const reply=host.replies.at(-1); if (reply && ['edit-applied','edit-failed'].includes(String(reply.type))) { host.replies.length=0; dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:reply})); } }
    expect(host.source()).toBe('After\n\nFollowing');
    expect(sent.some(msg => msg.type === 'split-unavailable')).toBe(false); dom.window.close();
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
    Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { ...host.identity(), version: 1, labels: { conflict: 'Conflict' } } });
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
