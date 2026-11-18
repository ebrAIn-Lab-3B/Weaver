import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { markdownClient } from '../../../apps/vscode-extension/src/markdownWebview';
import { matchesOwnDocumentChange } from '../../../apps/vscode-extension/src/ownDocumentChange';

function webview(focusTextLine?: number, recoveryEnabled = false) {
  const dom = new JSDOM('<button id="source"></button><button id="recovery"></button><span id="recovery-status"></span><main><p contenteditable="plaintext-only" data-inline-original="First" data-source-line="0" data-source-type="paragraph_open">First</p><p contenteditable="plaintext-only" data-inline-original="Second" data-source-line="2" data-source-type="paragraph_open">Second</p></main>', { runScripts: 'outside-only' });
  const sent: Record<string, unknown>[] = [];
  Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (event: Record<string, unknown>) => sent.push(event) }), editorConfig: { version: 1, focusTextLine, recoveryEnabled, recoveryGeneration: 'test', labels: { conflict: 'Conflict', recoveryPending: 'Pending', recoveryCheckpointed: 'Local checkpoint', recoveryFailed: 'Recovery failed', copyDraft: 'Copy', openDraft: 'Open' } } });
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
  it('checkpoints composition and queued blocks independently, without claiming the file is saved', () => {
    const { dom, sent, first, second } = webview(undefined, true);
    first.focus(); first.textContent = '한'; first.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, isComposing: true }));
    expect(sent.at(-1)).toMatchObject({ type: 'recovery-checkpoint', draftId: 'test-1', revision: 1, value: '한', line: 0 });
    expect(sent.some((event) => event.type === 'inline-change')).toBe(false);
    first.textContent = '한글'; first.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true, data: '한글' }));
    second.focus(); second.textContent = 'Queued'; second.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(sent.find((event) => event.draftId === 'test-2')).toMatchObject({ type: 'recovery-checkpoint', revision: 1, value: 'Queued', line: 2 });
    const status = dom.window.document.getElementById('recovery-status')!;
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'recovery-checkpointed', draftId: 'test-1', revision: 1 } }));
    expect(status.textContent).toBe('Pending');
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'recovery-checkpointed', draftId: 'test-1', revision: 2 } }));
    expect(status.textContent).toBe('Pending');
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'recovery-checkpointed', draftId: 'test-2', revision: 1 } }));
    expect(status.textContent).toBe('Local checkpoint');
    expect(sent.some((event) => event.type === 'save')).toBe(false);
    dom.window.close();
  });
  it('reports the newest checkpoint failure and keeps its draft available for opening', () => {
    const { dom, sent, first } = webview(undefined, true);
    first.focus(); first.textContent = 'first'; first.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    first.textContent = 'latest'; first.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'recovery-failed', draftId: 'test-1', revision: 1 } }));
    expect(dom.window.document.getElementById('recovery-status')!.textContent).toBe('Pending');
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'recovery-failed', draftId: 'test-1', revision: 2 } }));
    expect(dom.window.document.getElementById('recovery-status')!.textContent).toBe('Recovery failed');
    dom.window.document.querySelectorAll<HTMLButtonElement>('[role=alert] button')[1].click();
    expect(sent.at(-1)).toMatchObject({ type: 'open-draft', value: 'latest' });
    first.textContent = 'retry'; first.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'recovery-checkpointed', draftId: 'test-1', revision: 3 } }));
    expect(dom.window.document.getElementById('recovery-status')!.textContent).toBe('Local checkpoint');
    expect(dom.window.document.querySelector('[role=alert]')).toBeNull();
    dom.window.document.getElementById('recovery')!.click();
    expect(sent.at(-1)).toMatchObject({ type: 'review-recovery' });
    dom.window.close();
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
      expect(sent.slice(-2).map((e) => e.type)).toEqual(['finish', action]);
      dom.window.close();
    }
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
  it('keeps immediate typing in the current paragraph, list item, and insertion slot after Enter', () => {
    for (const kind of ['paragraph', 'list', 'slot']) {
      const { dom, sent, first } = webview();
      let node: HTMLElement = first;
      if (kind === 'list') { node.dataset.sourceType = 'list_item_inline'; node.dataset.inlineOriginal = '- First'; }
      if (kind === 'slot') {
        const slot = dom.window.document.createElement('div'); slot.className = 'insert-slot'; slot.dataset.insertLine = '0';
        node = dom.window.document.createElement('div'); node.className = 'insert-field'; node.setAttribute('contenteditable', 'plaintext-only'); slot.append(node);
        first.before(slot);
      }
      node.focus();
      const enter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      node.dispatchEvent(enter);
      expect(enter.defaultPrevented).toBe(true);
      expect(sent.at(-1)).toMatchObject({ type: 'split-unavailable' });
      node.textContent = 'Typed immediately'; node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      expect(sent.some((event) => event.type === 'finish')).toBe(false);
      expect(sent.at(-1)).toMatchObject({ type: kind === 'slot' ? 'slot-change' : 'inline-change', value: 'Typed immediately' });
      expect(node.textContent).toBe('Typed immediately');
      dom.window.close();
    }
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
