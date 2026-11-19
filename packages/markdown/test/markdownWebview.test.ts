import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { markdownClient } from '../../../apps/vscode-extension/src/markdownWebview';
import { matchesOwnDocumentChange } from '../../../apps/vscode-extension/src/ownDocumentChange';

function webview(focusTextLine?: number) {
  const dom = new JSDOM('<button id="source"></button><main><p contenteditable="plaintext-only" data-inline-original="First" data-source-line="0" data-source-type="paragraph_open">First</p><p contenteditable="plaintext-only" data-inline-original="Second" data-source-line="2" data-source-type="paragraph_open">Second</p></main>', { runScripts: 'outside-only' });
  const sent: Record<string, unknown>[] = [];
  Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { version: 1, focusTextLine, labels: { conflict: 'Conflict' } } });
  dom.window.eval(markdownClient);
  const [first, second] = [...dom.window.document.querySelectorAll('p')];
  return { dom, sent, first, second };
}

function checklistWebview() {
  const dom = new JSDOM('<button id="source"></button><main><ul><li><input type="checkbox" data-checklist-line="0" data-checklist-expected="- [ ] First"><span contenteditable="plaintext-only" data-inline-original="- [ ] First" data-source-line="0" data-source-type="list_item_inline">First</span></li></ul></main>', { runScripts: 'outside-only' });
  const sent: Record<string, unknown>[] = [];
  Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { version: 1, labels: { conflict: 'Conflict' } } });
  dom.window.eval(markdownClient);
  return { dom, sent, checkbox: dom.window.document.querySelector('input')!, text: dom.window.document.querySelector('span')! };
}

describe('rendered editor synchronization', () => {
  it('flushes save without finishing or losing focus, then continues editing', () => {
    const { dom, sent, first } = webview(); first.focus();
    first.textContent = 'Before save'; first.dispatchEvent(new dom.window.Event('input', {bubbles:true}));
    first.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key:'s', ctrlKey:true, bubbles:true, cancelable:true}));
    expect(sent.some(event => event.type === 'save')).toBe(false);
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {data:{type:'edit-applied', version:2, expected:'Before save'}}));
    expect(sent.at(-1)).toMatchObject({type:'save'});
    expect(sent.some(event => event.type === 'finish')).toBe(false);
    expect(dom.window.document.activeElement).toBe(first);
    first.textContent = 'After save'; first.dispatchEvent(new dom.window.Event('input', {bubbles:true}));
    expect(sent.at(-1)).toMatchObject({type:'inline-change', value:'After save', version:2}); dom.window.close();
  });
  it('retains text typed in a second block while the first edit is awaiting acknowledgement', () => {
    const { dom, sent, first, second } = webview();
    first.focus(); first.textContent = 'First changed'; first.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    second.focus(); second.textContent = 'Second changed'; second.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(sent.filter((e) => e.type === 'inline-change')).toHaveLength(1);
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-applied', version: 2, expected: 'First changed' } }));
    expect(sent.filter((e) => e.type === 'finish')[0]).toMatchObject({ preserve: true });
    expect(sent.filter((e) => e.type === 'inline-change')[1]).toMatchObject({ line: 2, expected: 'Second', value: 'Second changed', version: 2 });
    dom.window.close();
  });
  it('preserves each edit when focus crosses several blocks while a response is delayed', () => {
    const { dom, sent, first, second } = webview();
    const third = second.cloneNode(true) as HTMLElement;
    third.dataset.inlineOriginal = 'Third'; third.dataset.sourceLine = '4'; third.textContent = 'Third';
    second.parentElement!.append(third);
    first.focus(); first.textContent = 'First changed'; first.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    second.focus(); second.textContent = 'Second changed'; second.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    third.focus(); third.textContent = 'Third changed'; third.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-applied', version: 2, expected: 'First changed' } }));
    expect(sent.filter((e) => e.type === 'inline-change')[1]).toMatchObject({ line: 2, value: 'Second changed', version: 2 });
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-applied', version: 3, expected: 'Second changed' } }));
    expect(sent.filter((e) => e.type === 'inline-change')[2]).toMatchObject({ line: 4, value: 'Third changed', version: 3 });
    dom.window.close();
  });
  it('sends the committed Korean composition without marking intermediate composition as a document edit', () => {
    const { dom, sent, first } = webview();
    first.focus(); first.textContent = '한글';
    first.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, isComposing: true }));
    expect(sent.filter((e) => e.type === 'inline-change')).toHaveLength(0);
    first.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true, data: '한글' }));
    expect(sent.filter((e) => e.type === 'inline-change')[0]).toMatchObject({ expected: 'First', value: '한글' });
    dom.window.close();
  });
  it('ignores only the exact expected self-edit event, not an unrelated external edit', () => {
    const expected = { version: 5, offset: 12, length: 3, text: '한글' };
    expect(matchesOwnDocumentChange(expected, 5, [{ rangeOffset: 12, rangeLength: 3, text: '한글' }])).toBe(true);
    expect(matchesOwnDocumentChange(expected, 5, [{ rangeOffset: 13, rangeLength: 3, text: '한글' }])).toBe(false);
    expect(matchesOwnDocumentChange(expected, 6, [{ rangeOffset: 12, rangeLength: 3, text: '한글' }])).toBe(false);
    expect(matchesOwnDocumentChange(expected, 5, [])).toBe(false);
  });
  it('offers an explicit copy of the current draft after a conflicting edit', () => {
    const { dom, sent, first } = webview();
    first.focus(); first.textContent = 'Draft to recover';
    first.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'conflict', detail: 'Changed elsewhere' } }));
    first.textContent = 'Draft with later typing';
    const button = dom.window.document.querySelector<HTMLButtonElement>('[role=alert] button')!;
    expect(button).toBeTruthy();
    button.click();
    expect(sent.at(-1)).toMatchObject({ type: 'copy-draft', value: 'Draft with later typing' });
    const open = dom.window.document.querySelectorAll<HTMLButtonElement>('[role=alert] button')[1];
    open.click();
    expect(sent.at(-1)).toMatchObject({ type: 'open-draft', value: 'Draft with later typing' });
    expect(first.textContent).toBe('Draft with later typing');
    dom.window.close();
  });
  it('offers recovery for a second block queued when an external change conflicts', () => {
    const { dom, sent, first, second } = webview();
    first.focus(); first.textContent = 'First draft'; first.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    second.focus(); second.textContent = 'Second draft'; second.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'conflict', detail: 'Changed elsewhere' } }));
    const alerts = dom.window.document.querySelectorAll('[role=alert]');
    expect(alerts).toHaveLength(2);
    alerts[1].querySelectorAll<HTMLButtonElement>('button')[1].click();
    expect(sent.at(-1)).toMatchObject({ type: 'open-draft', value: 'Second draft' });
    expect(second.textContent).toBe('Second draft');
    dom.window.close();
  });
  it('flushes an in-flight edit before opening source or requesting undo', () => {
    for (const action of ['source', 'undo', 'save'] as const) {
      const { dom, sent, first } = webview();
      first.focus(); first.textContent = 'Changed'; first.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      if (action === 'source') dom.window.document.getElementById('source')!.click();
      else first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: action === 'save' ? 's' : 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      expect(sent.some((e) => e.type === action)).toBe(false);
      dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-applied', version: 2, expected: 'Changed' } }));
      if (action === 'save') { expect(sent.at(-1)?.type).toBe('save'); expect(sent.some(e => e.type === 'finish')).toBe(false); }
      else { expect(sent.slice(-2).map((e) => e.type)).toEqual(['finish', action]); if (action === 'undo') { expect(sent.at(-2)).toMatchObject({history:true}); expect(dom.window.document.querySelector('main')?.getAttribute('aria-busy')).toBe('true'); } }
      dom.window.close();
    }
  });
  it('waits for every delayed block edit before saving while preserving the active block', () => {
    const { dom, sent, first, second } = webview();
    first.focus(); first.textContent = 'First pending'; first.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    second.focus(); second.textContent = 'Second pending'; second.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    second.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(sent.some(event => event.type === 'save')).toBe(false);
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-applied', version: 2, expected: 'First pending' } }));
    expect(sent.at(-1)).toMatchObject({ type: 'inline-change', value: 'Second pending', version: 2 });
    expect(sent.some(event => event.type === 'save')).toBe(false);
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-applied', version: 3, expected: 'Second pending' } }));
    expect(sent.at(-1)).toMatchObject({ type: 'save' });
    expect(dom.window.document.activeElement).toBe(second);
    expect(second.textContent).toBe('Second pending'); dom.window.close();
  });
  it('waits for all delayed edits before issuing undo', () => {
    const { dom, sent, first, second } = webview();
    first.focus(); first.textContent = 'First pending'; first.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    second.focus(); second.textContent = 'Second pending'; second.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    second.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(sent.some(event => event.type === 'undo')).toBe(false);
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-applied', version: 2, expected: 'First pending' } }));
    expect(sent.at(-1)).toMatchObject({ type: 'inline-change', value: 'Second pending', version: 2 });
    expect(sent.some(event => event.type === 'undo')).toBe(false);
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-applied', version: 3, expected: 'Second pending' } }));
    expect(sent.slice(-2)).toMatchObject([{ type: 'finish', history: true }, { type: 'undo' }]);
    expect(dom.window.document.querySelector('main')?.getAttribute('aria-busy')).toBe('true'); dom.window.close();
  });
  it('does not save during Korean composition until the committed input is acknowledged', () => {
    const { dom, sent, first } = webview(); first.focus();
    first.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles: true }));
    first.textContent = '한'; first.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, isComposing: true }));
    first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(sent.some(event => event.type === 'save' || event.type === 'inline-change')).toBe(false);
    first.textContent = '한글'; first.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true, data: '한글' }));
    expect(sent.at(-1)).toMatchObject({ type: 'inline-change', value: '한글' });
    expect(sent.some(event => event.type === 'save')).toBe(false);
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-applied', version: 2, expected: '한글' } }));
    expect(sent.at(-1)).toMatchObject({ type: 'save' });
    expect(first.textContent).toBe('한글'); dom.window.close();
  });
  it('keeps the draft and cancels a queued save when the pending edit is rejected', () => {
    const { dom, sent, first } = webview(); first.focus();
    first.textContent = 'Unsaved draft'; first.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-failed', detail: 'Conflict' } }));
    expect(sent.some(event => event.type === 'save')).toBe(false);
    expect(first.textContent).toBe('Unsaved draft');
    expect(dom.window.document.querySelector('[role=alert]')).toBeTruthy(); dom.window.close();
  });
  it('prevents multiline paste before it can replace the selection', () => {
    const { dom, sent, first } = webview();
    first.focus();
    const paste = new dom.window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'first\nsecond' } });
    first.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    expect(first.textContent).toBe('First');
    expect(sent.some((e) => e.type === 'multiline-paste')).toBe(true);
    dom.window.close();
  });
  it('saves after an in-flight split without closing the new block', () => {
    const { dom, sent, first } = webview(); first.focus();
    const range = dom.window.document.createRange(); range.selectNodeContents(first); range.collapse(false); dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    first.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key:'Enter', bubbles:true, cancelable:true}));
    const right = first.nextElementSibling as HTMLElement;
    right.textContent = 'After split'; right.dispatchEvent(new dom.window.Event('input', {bubbles:true}));
    right.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key:'s', ctrlKey:true, bubbles:true, cancelable:true}));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {data:{type:'edit-applied', version:1, expected:'First'}}));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {data:{type:'split-applied', line:0, nextLine:2, version:2, leftExpected:'First', rightExpected:''}}));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {data:{type:'edit-applied', version:3, expected:'After split'}}));
    expect(sent.at(-1)).toMatchObject({type:'save'}); expect(sent.some(event => event.type === 'finish')).toBe(false);
    expect(dom.window.document.activeElement).toBe(right); dom.window.close();
  });
  it('buffers typing in the new paragraph until the split is acknowledged', () => {
    const { dom, sent, first } = webview();
    first.focus();
    const range = dom.window.document.createRange(); range.setStart(first.firstChild!, 2); range.collapse(true);
    dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const right = first.nextElementSibling as HTMLElement;
    expect(first.textContent).toBe('Fi'); expect(right.textContent).toBe('rst');
    right.textContent = 'typed rst'; right.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(sent.at(-1)).toMatchObject({ type: 'inline-change', value: 'First' });
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-applied', version: 1, expected: 'First' } }));
    expect(sent.at(-1)).toMatchObject({ type: 'split', line: 0, caret: 2, selectionEnd: 2, expected: 'First', version: 1 });
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'split-applied', line: 0, nextLine: 2, version: 2, leftExpected: 'Fi', rightExpected: 'rst' } }));
    expect(sent.at(-1)).toMatchObject({ type: 'inline-change', line: 2, expected: 'rst', value: 'typed rst', version: 2 });
    expect(right.textContent).toBe('typed rst');
    dom.window.close();
  });
  it('queues successive Enter presses and preserves immediate typing in each new block', () => {
    const { dom, sent, first } = webview(); first.focus();
    const selectEnd = (node: HTMLElement) => { const range = dom.window.document.createRange(); range.selectNodeContents(node); range.collapse(false); dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range); };
    const enter = (node: HTMLElement) => node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }));
    selectEnd(first); enter(first);
    const second = first.nextElementSibling as HTMLElement;
    second.textContent = 'Second'; second.dispatchEvent(new dom.window.Event('input', { bubbles:true }));
    selectEnd(second); enter(second);
    const third = second.nextElementSibling as HTMLElement;
    third.textContent = 'Third'; third.dispatchEvent(new dom.window.Event('input', { bubbles:true }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data:{ type:'edit-applied', version:1, expected:'First' } }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data:{ type:'split-applied', line:0, nextLine:2, version:2, leftExpected:'First', rightExpected:'' } }));
    expect(sent.at(-1)).toMatchObject({ type:'inline-change', line:2, value:'Second', expected:'' });
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data:{ type:'edit-applied', version:3, expected:'Second' } }));
    expect(sent.at(-1)).toMatchObject({ type:'split', line:2, caret:6, version:3 });
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data:{ type:'split-applied', line:2, nextLine:4, version:4, leftExpected:'Second', rightExpected:'' } }));
    expect(sent.at(-1)).toMatchObject({ type:'inline-change', line:4, value:'Third', expected:'' });
    expect([first.textContent, second.textContent, third.textContent]).toEqual(['First', 'Second', 'Third']);
    dom.window.close();
  });
  it('retains every draft if an earlier provisional block is changed during a queued split', () => {
    const { dom, sent, first } = webview(); first.focus();
    const enterAtEnd = (node: HTMLElement) => { const range = dom.window.document.createRange(); range.selectNodeContents(node); range.collapse(false); dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range); node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true })); };
    enterAtEnd(first); const second = first.nextElementSibling as HTMLElement;
    second.textContent = 'Second'; second.dispatchEvent(new dom.window.Event('input', { bubbles:true })); enterAtEnd(second);
    const third = second.nextElementSibling as HTMLElement; third.textContent = 'Third'; third.dispatchEvent(new dom.window.Event('input', { bubbles:true }));
    second.textContent = 'Revised'; second.dispatchEvent(new dom.window.Event('input', { bubbles:true }));
    expect(dom.window.document.querySelectorAll('[role=alert]')).toHaveLength(3);
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data:{ type:'edit-applied', version:1, expected:'First' } }));
    expect(sent.some(event => event.type === 'split')).toBe(false);
    expect(second.textContent).toBe('Revised'); expect(third.textContent).toBe('Third'); dom.window.close();
  });
  it('retains both halves if a split conflicts and does not send the provisional draft', () => {
    const { dom, sent, first } = webview(); first.focus();
    const range = dom.window.document.createRange(); range.setStart(first.firstChild!, 2); range.collapse(true);
    dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const right = first.nextElementSibling as HTMLElement; right.textContent = 'changed'; right.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-failed', detail: 'Conflict' } }));
    expect(first.textContent).toBe('Fi'); expect(right.textContent).toBe('changed');
    expect(dom.window.document.querySelectorAll('[role=alert]')).toHaveLength(2);
    expect(sent.some(event => event.type === 'split')).toBe(false); dom.window.close();
  });
  it('waits for IME composition in the new block before sending buffered input', () => {
    const { dom, sent, first } = webview(); first.focus();
    const range = dom.window.document.createRange(); range.selectNodeContents(first); range.collapse(false);
    dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }));
    const right = first.nextElementSibling as HTMLElement;
    right.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles:true }));
    right.textContent = '한'; right.dispatchEvent(new dom.window.InputEvent('input', { bubbles:true, isComposing:true }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data:{ type:'edit-applied', version:1, expected:'First' } }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data:{ type:'split-applied', line:0, nextLine:2, version:2, leftExpected:'First', rightExpected:'' } }));
    expect(sent.at(-1)).toMatchObject({ type:'split' });
    right.textContent = '한글'; right.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles:true, data:'한글' }));
    expect(sent.at(-1)).toMatchObject({ type:'inline-change', line:2, value:'한글', version:2 }); dom.window.close();
  });
  it('does not split during tracked IME composition even if keydown lacks the flag', () => {
    const { dom, sent, first } = webview(); first.focus();
    first.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles:true }));
    first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'Enter', bubbles:true, isComposing:false }));
    expect(sent.some(event => event.type === 'split' || event.type === 'inline-change')).toBe(false);
    expect(first.nextElementSibling?.textContent).toBe('Second'); dom.window.close();
  });
  it('does not split the provisional paragraph while its IME composition is active', () => {
    const { dom, first } = webview(); first.focus();
    const range = dom.window.document.createRange(); range.selectNodeContents(first); range.collapse(false); dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }));
    const right = first.nextElementSibling as HTMLElement;
    right.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles:true }));
    right.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'Enter', bubbles:true, isComposing:false }));
    expect(right.nextElementSibling?.textContent).toBe('Second'); dom.window.close();
  });
  it('starts a plain paragraph after a heading and buffers its input', () => {
    const { dom, sent, first } = webview(); first.dataset.sourceType = 'heading_open'; first.dataset.inlineOriginal = '## First'; first.focus();
    const range = dom.window.document.createRange(); range.selectNodeContents(first); range.collapse(false); dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }));
    const right = first.nextElementSibling as HTMLElement; expect(right.tagName).toBe('P');
    right.textContent = 'Next'; right.dispatchEvent(new dom.window.Event('input', { bubbles:true }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data:{ type:'edit-applied', version:1, expected:'## First' } }));
    expect(sent.at(-1)).toMatchObject({ type:'split', blockType:'heading_open', caret:5 });
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data:{ type:'split-applied', line:0, nextLine:2, version:2, leftExpected:'## First', rightExpected:'' } }));
    expect(sent.at(-1)).toMatchObject({ type:'inline-change', blockType:'paragraph_open', value:'Next' }); dom.window.close();
  });
  it('refuses to clone a list item containing nested lists', () => {
    const { dom, sent, text } = checklistWebview();
    text.closest('li')!.insertAdjacentHTML('beforeend', '<ul><li>nested</li></ul>'); text.focus();
    const range = dom.window.document.createRange(); range.selectNodeContents(text); range.collapse(false); dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    text.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }));
    expect(sent.at(-1)).toMatchObject({type:'split-unavailable'}); expect(dom.window.document.querySelectorAll('ul ul')).toHaveLength(1); dom.window.close();
  });
  it('moves through empty insertion fields without writing blank paragraphs or dropping later text', () => {
    const { dom, sent, first } = webview();
    const slot = dom.window.document.createElement('div'); slot.className = 'insert-slot'; slot.dataset.insertLine = '0';
    slot.innerHTML = '<div class="insert-field" contenteditable="plaintext-only"></div>'; first.before(slot);
    const enter = (node: HTMLElement) => node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }));
    let node = slot.firstElementChild as HTMLElement; node.focus(); enter(node);
    node = dom.window.document.activeElement as HTMLElement; expect(node.parentElement?.previousElementSibling?.classList.contains('empty-paragraph')).toBe(true); enter(node);
    node = dom.window.document.activeElement as HTMLElement; node.textContent = 'Actual text'; node.dispatchEvent(new dom.window.Event('input', {bubbles:true}));
    expect(sent.filter(event => event.type === 'slot-change')).toEqual([expect.objectContaining({value:'Actual text', line:0})]);
    expect(sent.some(event => event.type === 'split-unavailable')).toBe(false); dom.window.close();
  });
  it('creates an unchecked checklist item and preserves immediate input', () => {
    const { dom, sent, checkbox, text } = checklistWebview(); text.focus();
    const range = dom.window.document.createRange(); range.selectNodeContents(text); range.collapse(false);
    dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    text.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }));
    const next = text.closest('li')!.nextElementSibling!;
    const nextBox = next.querySelector<HTMLInputElement>('input')!, nextText = next.querySelector<HTMLElement>('span')!;
    expect(checkbox.checked).toBe(false); expect(nextBox.checked).toBe(false);
    nextText.textContent = 'Next'; nextText.dispatchEvent(new dom.window.Event('input', { bubbles:true }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type:'edit-applied', version:1, expected:'- [ ] First' } }));
    expect(sent.at(-1)).toMatchObject({ type:'split', caret:5 });
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type:'split-applied', line:0, nextLine:1, version:2, leftExpected:'- [ ] First', rightExpected:'- [ ] ' } }));
    expect(sent.at(-1)).toMatchObject({ type:'inline-change', line:1, value:'Next', expected:'- [ ] ' });
    expect(nextBox.dataset.checklistLine).toBe('1'); dom.window.close();
  });
  it('focuses the beginning of the requested block after a split', () => {
    const { dom, second } = webview(2);
    const selection = dom.window.getSelection()!;
    expect(dom.window.document.activeElement).toBe(second);
    expect(selection.anchorOffset).toBe(0);
    dom.window.close();
  });
  it('toggles a checkbox with version and exact source and updates subsequent edit metadata', () => {
    const { dom, sent, checkbox, text } = checklistWebview();
    checkbox.click();
    expect(checkbox.disabled).toBe(true);
    expect(sent.at(-1)).toMatchObject({ type: 'checklist-toggle', line: 0, checked: true, expected: '- [ ] First', version: 1 });
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'checklist-result', ok: true, version: 2, expected: '- [x] First', checked: true } }));
    expect(checkbox.disabled).toBe(false);
    expect(checkbox.checked).toBe(true);
    expect(text.dataset.inlineOriginal).toBe('- [x] First');
    checkbox.click();
    expect(sent.at(-1)).toMatchObject({ type: 'checklist-toggle', checked: false, expected: '- [x] First', version: 2 });
    dom.window.close();
  });
  it('flushes an in-flight text edit before toggling the same item', () => {
    const { dom, sent, checkbox, text } = checklistWebview();
    text.focus(); text.textContent = 'Changed'; text.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    checkbox.click();
    expect(sent.some((event) => event.type === 'checklist-toggle')).toBe(false);
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-applied', version: 2, expected: '- [ ] Changed' } }));
    expect(sent.at(-2)).toMatchObject({ type: 'finish', preserve: true });
    expect(sent.at(-1)).toMatchObject({ type: 'checklist-toggle', line: 0, checked: true, expected: '- [ ] Changed', version: 2 });
    dom.window.close();
  });
  it('restores the previous visual state on failure', () => {
    const { dom, checkbox } = checklistWebview();
    checkbox.click();
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'checklist-result', ok: false, detail: 'Changed elsewhere' } }));
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(false);
    expect(dom.window.document.querySelector('[role=alert]')?.textContent).toBe('Changed elsewhere');
    dom.window.close();
  });
  it('queues text typed while a checkbox update is in flight', () => {
    const { dom, sent, checkbox, text } = checklistWebview();
    checkbox.click();
    text.focus(); text.textContent = 'Changed while waiting'; text.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(sent.some((event) => event.type === 'inline-change')).toBe(false);
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'checklist-result', ok: true, version: 2, expected: '- [x] First', checked: true } }));
    expect(sent.at(-1)).toMatchObject({ type: 'inline-change', line: 0, expected: '- [x] First', value: 'Changed while waiting', version: 2 });
    dom.window.close();
  });
  it('does not apply a checkbox using stale line numbers after an inserted block', () => {
    const { dom, sent, checkbox } = checklistWebview();
    const slot = dom.window.document.createElement('div'); slot.className = 'insert-slot'; slot.dataset.insertLine = '0';
    slot.innerHTML = '<div class="insert-field" contenteditable="plaintext-only"></div>';
    const main = dom.window.document.querySelector('main')!; main.prepend(slot);
    const input = slot.querySelector<HTMLElement>('.insert-field')!;
    input.focus(); input.textContent = 'new block'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    checkbox.click();
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'edit-applied', version: 2, expected: 'new block\n\n' } }));
    expect(sent.some((event) => event.type === 'checklist-toggle')).toBe(false);
    expect(sent.at(-1)).toMatchObject({ type: 'checklist-stale' });
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(false);
    dom.window.close();
  });
});
