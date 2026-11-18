/** Client-side interaction runs inside the isolated webview. */
export const markdownClient = String.raw`
const vscode = acquireVsCodeApi();
const main = document.querySelector('main');
const choices = ['heading', 'bullet', 'checklist', 'code'];
let session;
let menu;
let selected = 0;
let filtered = [];
const pending = [];
let deferredAction;
let checklistPending;
let locationsStale = false;
let movingToSplit = false;
const extraSplits = [];
const provisionalSplit = node => [session?.split, ...extraSplits].find(split => split?.right === node);
const nodeValue = node => node instanceof HTMLTextAreaElement ? node.value : (node.textContent || '');

function showDraftConflict(current, detail) {
  if (current.conflictShown) return;
  current.conflictShown = true;
  current.failed = true; current.inflight = false;
  const note = document.createElement('p'); note.setAttribute('role', 'alert');
  note.textContent = detail || editorConfig.labels.conflict;
  const button = document.createElement('button'); button.type = 'button';
  button.textContent = editorConfig.labels.copyDraft;
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('click', () => vscode.postMessage({ type: 'copy-draft', value: nodeValue(current.node) }));
  const recover = document.createElement('button'); recover.type = 'button';
  recover.textContent = editorConfig.labels.openDraft;
  recover.addEventListener('mousedown', event => event.preventDefault());
  recover.addEventListener('click', () => vscode.postMessage({ type: 'open-draft', value: nodeValue(current.node) }));
  note.append(' ', button, ' ', recover); current.node.insertAdjacentElement('afterend', note);
}

function clearInvalid() {
  if (!session?.invalid) return;
  session.invalid = false;
  session.node.removeAttribute('aria-invalid');
  if (session.invalidNote) session.invalidNote.remove();
  session.invalidNote = undefined;
}

function hideMenu() { if (menu) menu.remove(); menu = undefined; filtered = []; }
function showMenu(node) {
  const value = node.textContent || '';
  if (!session || session.type !== 'slot' || session.kind !== 'paragraph' || !value.startsWith('/')) { hideMenu(); return; }
  const query = value.slice(1).toLocaleLowerCase();
  filtered = choices.filter(k => k.includes(query) || editorConfig.labels[k].toLocaleLowerCase().includes(query));
  if (!filtered.length) { hideMenu(); return; }
  selected = Math.min(selected, filtered.length - 1);
  if (!menu) { menu = document.createElement('div'); menu.className = 'slash-menu'; menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', editorConfig.labels.menu); node.parentElement.append(menu); }
  menu.textContent = '';
  filtered.forEach((kind, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(index === selected)); button.textContent = editorConfig.labels[kind];
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => choose(kind)); menu.append(button);
  });
}
function choose(kind) {
  if (!session) return;
  session.kind = kind; session.node.textContent = ''; session.node.parentElement.dataset.kind = kind;
  hideMenu(); session.dirty = true; pump(); session.node.focus();
}
function activateQueued(next) {
  start(next.node);
  if (next.dirty && session) {
    if (session.type === 'slot' && session.node.textContent.startsWith('/')) showMenu(session.node);
    else { session.dirty = true; pump(); }
  }
  if ((next.finish || deferredAction) && session) { session.finish = true; pump(); }
}
function pump() {
  if (!session || session.inflight || session.failed || session.invalid || session.composing) return;
  if (session.dirty) {
    session.dirty = false; session.inflight = true;
    const value = session.split ? session.split.original : nodeValue(session.node);
    session.sentValue = value;
    const payload = { type: session.type === 'slot' ? 'slot-change' : session.type === 'fence' ? 'fence-change' : 'inline-change', line: session.line,
      value, version: session.version, kind: session.kind, endLine: session.endLine,
      blockType: session.blockType, expected: session.expected };
    vscode.postMessage(payload); return;
  }
  if (session.split && !session.split.sent) {
    session.inflight = true; session.split.sent = true;
    vscode.postMessage({ type: session.type === 'slot' ? 'split-slot' : 'split', line: session.line, blockType: session.blockType, value: session.split.original,
      version: session.version, expected: session.expected,
      caret: session.split.caret, selectionEnd: session.split.selectionEnd });
    return;
  }
  if (session.finish) {
    const finished = session; session = undefined; hideMenu();
    const next = pending.shift();
    vscode.postMessage({ type: 'finish', line: finished.line, next: finished.next, preserve: !!next || deferredAction === 'checklist-toggle', caret: finished.caret, selectionEnd: finished.selectionEnd, blockType: finished.blockType, version: finished.version, expected: finished.expected });
    if (next) activateQueued(next);
    else if (deferredAction) {
      const action = deferredAction; deferredAction = undefined;
      sendAction(action);
    }
  }
}
function start(node) {
  if (session) return;
  const slot = node.classList.contains('insert-field');
  const fence = node.classList.contains('fence-input');
  session = { node, type: slot ? 'slot' : fence ? 'fence' : 'inline', line: Number(slot ? node.parentElement.dataset.insertLine : node.dataset.sourceLine),
    endLine: fence ? Number(node.dataset.sourceEnd) : undefined,
    kind: 'paragraph', blockType: node.dataset.sourceType, expected: fence ? node.value : node.dataset.inlineOriginal,
    version: editorConfig.version, inflight: false, dirty: false, finish: false, next: false, failed: false };
  vscode.postMessage({ type: 'focus' });
}
function selectionOffsets(node) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return undefined;
  const selected = selection.getRangeAt(0);
  if (!node.contains(selected.startContainer) || !node.contains(selected.endContainer)) return undefined;
  const before = selected.cloneRange(); before.selectNodeContents(node); before.setEnd(selected.startContainer, selected.startOffset);
  const through = selected.cloneRange(); through.selectNodeContents(node); through.setEnd(selected.endContainer, selected.endOffset);
  return { caret: before.toString().length, selectionEnd: through.toString().length };
}
function beginSplit(offsets, node = session?.node) {
  const owner = provisionalSplit(node);
  const blockType = owner?.rightBlockType || (session?.type === 'slot' ? 'paragraph_open' : session?.blockType);
  if (!session || !['inline', 'slot'].includes(session.type) || (session.type === 'slot' && !owner && (session.kind !== 'paragraph' || !nodeValue(node).trim())) || !['paragraph_open', 'heading_open', 'list_item_inline'].includes(blockType) || pending.length || (session.split && !owner) || (owner && owner !== (extraSplits.at(-1) || session.split))) return false;
  const original = nodeValue(node);
  if (!offsets || offsets.caret < 0 || offsets.selectionEnd < offsets.caret || offsets.selectionEnd > original.length) return false;
  const breaksSurrogate = offset => offset > 0 && offset < original.length && /[\uD800-\uDBFF]/.test(original[offset - 1]) && /[\uDC00-\uDFFF]/.test(original[offset]);
  if (breaksSurrogate(offsets.caret) || breaksSurrogate(offsets.selectionEnd)) return false;
  if (blockType === 'heading_open' && (offsets.caret !== original.length || offsets.selectionEnd !== original.length)) return false;
  let right;
  if (blockType === 'list_item_inline') {
    const item = node.closest('li');
    if (!item || !item.parentElement || item.querySelector('ul,ol') || item.querySelectorAll('[data-inline-original]').length !== 1) return false;
    const clone = item.cloneNode(true);
    right = clone.querySelector('[data-inline-original]');
    if (!right) return false;
    const box = clone.querySelector('input[type=checkbox]'); if (box) box.checked = false;
    item.after(clone);
  } else {
    right = blockType === 'heading_open' || (session.type === 'slot' && !owner) ? document.createElement('p') : node.cloneNode(false);
    if (blockType === 'heading_open' || (session.type === 'slot' && !owner)) { right.setAttribute('contenteditable', 'plaintext-only'); right.dataset.inlineOriginal = ''; right.dataset.sourceType = 'paragraph_open'; }
    if (session.type === 'slot' && !owner) node.parentElement.after(right); else node.after(right);
  }
  const left = original.slice(0, offsets.caret), suffix = original.slice(offsets.selectionEnd);
  right.textContent = suffix;
  node.textContent = left;
  const split = { original, rightBlockType: blockType === 'heading_open' ? 'paragraph_open' : blockType, caret: offsets.caret, selectionEnd: offsets.selectionEnd, right, rightDirty: false, rightFinish: false, composing: false, sent: false };
  if (owner) { owner.rightDirty = true; extraSplits.push(split); }
  else { session.split = split; session.dirty = true; }
  movingToSplit = true; right.focus();
  const range = document.createRange(); range.selectNodeContents(right); range.collapse(true);
  const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
  movingToSplit = false; pump(); return true;
}
main.addEventListener('focusin', event => {
  const node = event.target.closest('.insert-field,[data-inline-original],textarea[data-fence-input]');
  if (!node) return;
  if (movingToSplit || provisionalSplit(node)) return;
  if (!session && checklistPending) { pending.push({ node, dirty: false }); return; }
  if (session && (node !== session.node || pending.length)) { pending.push({ node, dirty: false }); return; }
  if (session && node === session.node) { session.finish = false; return; }
  start(node);
});
function changedSupersededSplit(node) {
  const split = provisionalSplit(node);
  if (!session?.split || (node !== session.node && (!split || split === (extraSplits.at(-1) || session.split)))) return false;
  showDraftConflict(session);
  showDraftConflict({ node:session.split.right });
  for (const queued of extraSplits) showDraftConflict({ node:queued.right });
  return true;
}
main.addEventListener('input', event => {
  if (changedSupersededSplit(event.target)) return;
  if (provisionalSplit(event.target)) { provisionalSplit(event.target).rightDirty = true; return; }
  const queued = [...pending].reverse().find(item => event.target === item.node);
  if (queued) { queued.dirty = true; if (session?.failed) showDraftConflict(queued); return; }
  if (!session || event.target !== session.node || event.isComposing || session.composing) return;
  clearInvalid();
  // If Enter was pressed over a selection and a new edit arrives before the
  // split is acknowledged, the browser has already replaced that selection.
  if (session.type === 'inline' && session.finish && session.next && session.selectionEnd > session.caret) session.selectionEnd = session.caret;
  if (session.type === 'slot' && session.kind === 'paragraph' && !session.slashDismissed && session.node.textContent.startsWith('/')) { selected = 0; showMenu(session.node); return; }
  hideMenu(); session.dirty = true; pump();
});
main.addEventListener('compositionstart', event => {
  if (provisionalSplit(event.target)) provisionalSplit(event.target).composing = true;
  else if (session && event.target === session.node) session.composing = true;
});
main.addEventListener('compositionend', event => {
  if (changedSupersededSplit(event.target)) return;
  if (provisionalSplit(event.target)) { provisionalSplit(event.target).composing = false; provisionalSplit(event.target).rightDirty = true; return; }
  const queued = [...pending].reverse().find(item => event.target === item.node);
  if (queued) { queued.dirty = true; if (session?.failed) showDraftConflict(queued); return; }
  if (!session || event.target !== session.node) return;
  session.composing = false;
  clearInvalid();
  if (session.type === 'inline' && session.finish && session.next && session.selectionEnd > session.caret) session.selectionEnd = session.caret;
  if (session.type === 'slot' && session.kind === 'paragraph' && !session.slashDismissed && session.node.textContent.startsWith('/')) showMenu(session.node);
  else { session.dirty = true; pump(); }
});
main.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's') {
    event.preventDefault(); queueAction('save'); return;
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')) {
    event.preventDefault();
    queueAction(event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo');
    return;
  }
  if (provisionalSplit(event.target)) {
    if (event.key === 'Enter' && !event.isComposing && !provisionalSplit(event.target).composing) { event.preventDefault(); if (!beginSplit(selectionOffsets(event.target), event.target)) vscode.postMessage({ type: 'split-unavailable' }); }
    return;
  }
  if (!session || event.target !== session.node || event.isComposing || session.composing) return;
  if (session.type === 'fence' && event.key === 'Enter') return;
  if (menu && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault(); selected = (selected + (event.key === 'ArrowDown' ? 1 : filtered.length - 1)) % filtered.length; showMenu(session.node); return;
  }
  if (menu && event.key === 'Escape') { event.preventDefault(); hideMenu(); session.slashDismissed = true; session.dirty = true; pump(); return; }
  if (event.key === 'Enter') {
    event.preventDefault();
    if (menu) { choose(filtered[selected]); return; }
    if (!beginSplit(selectionOffsets(session.node))) vscode.postMessage({ type: 'split-unavailable' });
  }
});
main.addEventListener('paste', event => {
  if (event.target.closest('textarea[data-fence-input]')) return;
  if (!event.target.closest('.insert-field,[data-inline-original]')) return;
  const text = event.clipboardData?.getData('text/plain');
  if (typeof text === 'string' && /[\r\n]/.test(text)) {
    event.preventDefault();
    vscode.postMessage({ type: 'multiline-paste' });
  }
});
main.addEventListener('focusout', event => {
  if (movingToSplit) return;
  if (provisionalSplit(event.target)) { provisionalSplit(event.target).rightFinish = true; return; }
  const queued = [...pending].reverse().find(item => event.target === item.node);
  if (queued) { queued.finish = true; return; }
  if (!session || event.target !== session.node) return;
  if (session.type === 'slot' && session.kind === 'paragraph' && session.node.textContent.startsWith('/') && !session.slashDismissed) session.dirty = true;
  hideMenu(); session.finish = true; setTimeout(pump, 0);
});
window.addEventListener('message', event => {
  if (event.data?.type === 'checklist-result' && checklistPending) {
    const checkbox = checklistPending.node;
    if (event.data.ok) {
      editorConfig.version = event.data.version;
      checkbox.checked = event.data.checked;
      checkbox.dataset.checklistExpected = event.data.expected;
      const item = checkbox.closest('li');
      const editable = item?.querySelector('[data-inline-original]');
      if (editable && editable.dataset.sourceLine === checkbox.dataset.checklistLine) editable.dataset.inlineOriginal = event.data.expected;
    } else {
      checkbox.checked = checklistPending.previous;
      const note = document.createElement('p'); note.setAttribute('role', 'alert'); note.textContent = event.data.detail || editorConfig.labels.conflict;
      checkbox.insertAdjacentElement('afterend', note);
    }
    checkbox.disabled = false; checklistPending = undefined;
    const next = pending.shift();
    if (next && event.data.ok) activateQueued(next);
    else if (next) {
      start(next.node);
      if (session) {
        showDraftConflict(session, event.data.detail);
        for (const queued of pending) if (queued.dirty) showDraftConflict(queued, event.data.detail);
      }
    }
    return;
  }
  if (!session) return;
  if (session.failed) return;
  if (event.data?.type === 'split-applied' && session.split) {
    const previous = session, split = previous.split, right = split.right;
    const oldLine = previous.line, nextLine = event.data.nextLine, delta = event.data.slot ? event.data.shift : nextLine - oldLine;
    if (event.data.line !== oldLine || !Number.isInteger(nextLine) || delta < 1 || typeof event.data.rightExpected !== 'string') {
      showDraftConflict(previous); showDraftConflict({node:right}); return;
    }
    const provisionalContainers = [split, ...extraSplits].map(item => item.rightBlockType === 'list_item_inline' ? item.right.closest('li') : item.right);
    for (const node of main.querySelectorAll('[data-source-line],[data-source-end],[data-insert-line],[data-checklist-line]')) {
      if (provisionalContainers.some(container => container?.contains(node) || node === container)) continue;
      for (const [key, threshold] of [['sourceLine', oldLine], ['sourceEnd', oldLine], ['insertLine', oldLine], ['checklistLine', oldLine]]) {
        if (node.dataset[key] !== undefined && (event.data.slot ? Number(node.dataset[key]) >= threshold : Number(node.dataset[key]) > threshold)) node.dataset[key] = String(Number(node.dataset[key]) + delta);
      }
    }
    if (event.data.slot) {
      const field = previous.node; const paragraph = document.createElement('p'); paragraph.setAttribute('contenteditable', 'plaintext-only');
      paragraph.textContent = field.textContent; paragraph.dataset.sourceType = 'paragraph_open';
      field.parentElement.replaceWith(paragraph); previous.node = paragraph;
      previous.node.dataset.sourceLine = String(event.data.leftLine);
    }
    previous.node.dataset.inlineOriginal = event.data.leftExpected;
    previous.node.dataset.sourceEnd = String((event.data.slot ? event.data.leftLine : oldLine) + 1);
    const oldCheckbox = previous.node.closest('li')?.querySelector('input[data-checklist-line]');
    if (oldCheckbox) oldCheckbox.dataset.checklistExpected = event.data.leftExpected;
    right.dataset.sourceLine = String(nextLine); right.dataset.sourceEnd = String(nextLine + 1); right.dataset.inlineOriginal = event.data.rightExpected;
    const checkbox = right.closest('li')?.querySelector('input[data-checklist-line]');
    if (checkbox) { checkbox.dataset.checklistLine = String(nextLine); checkbox.dataset.checklistExpected = event.data.rightExpected; }
    editorConfig.version = event.data.version;
    const nextSplit = extraSplits.shift();
    session = { node:right, type:'inline', line:nextLine, kind:'paragraph', blockType:split.rightBlockType, split:nextSplit,
      expected:event.data.rightExpected, version:event.data.version, inflight:false, dirty:split.rightDirty || !!nextSplit,
      finish:split.rightFinish || pending.length > 0 || !!deferredAction, next:false, failed:false, composing:split.composing };
    pump();
  } else if (event.data?.type === 'edit-applied') {
    // Slot and fence edits may change the line numbers of every later block.
    // Never send a checkbox action using the old DOM after such an edit.
    if (session.type === 'slot' || session.type === 'fence') locationsStale = true;
    editorConfig.version = event.data.version;
    session.version = event.data.version; session.expected = event.data.expected; session.inflight = false;
    if (session.type === 'inline') {
      session.node.dataset.inlineOriginal = event.data.expected;
      const checkbox = session.node.closest('li')?.querySelector('input[data-checklist-line]');
      if (checkbox && checkbox.dataset.checklistLine === String(session.line)) checkbox.dataset.checklistExpected = event.data.expected;
    }
    pump();
  } else if (event.data?.type === 'edit-invalid') {
    session.inflight = false; session.invalid = true;
    session.node.setAttribute('aria-invalid', 'true');
    if (!session.invalidNote) { session.invalidNote = document.createElement('p'); session.invalidNote.setAttribute('role', 'alert'); session.node.insertAdjacentElement('afterend', session.invalidNote); }
    session.invalidNote.textContent = event.data.detail || editorConfig.labels.fenceInvalid;
    if (session.dirty && nodeValue(session.node) !== session.sentValue) { clearInvalid(); pump(); }
  } else if (event.data?.type === 'edit-failed' || event.data?.type === 'conflict') {
    showDraftConflict(session, event.data.detail);
    if (session.split) showDraftConflict({ node:session.split.right }, event.data.detail);
    for (const split of extraSplits) showDraftConflict({ node:split.right }, event.data.detail);
    for (const queued of pending) if (queued.dirty) showDraftConflict(queued, event.data.detail);
  }
});
function sendAction(type) {
  if (type === 'checklist-toggle' && checklistPending) {
    const checkbox = checklistPending.node;
    if (locationsStale) {
      checkbox.checked = checklistPending.previous; checkbox.disabled = false; checklistPending = undefined;
      vscode.postMessage({ type: 'checklist-stale' }); return;
    }
    vscode.postMessage({ type, line: Number(checkbox.dataset.checklistLine), expected: checkbox.dataset.checklistExpected, checked: checkbox.checked, version: editorConfig.version });
  } else vscode.postMessage({ type });
}
function queueAction(type) {
  if (!session) { sendAction(type); return true; }
  if (session.failed || session.invalid || deferredAction || (type === 'checklist-toggle' && session.next)) { session.node.focus(); return false; }
  deferredAction = type;
  session.finish = true; session.next = false; pump();
  return true;
}
document.getElementById('source').addEventListener('click', () => queueAction('source'));
document.getElementById('requirement')?.addEventListener('click', () => queueAction('requirement'));
main.addEventListener('dblclick', event => {
  // An editable list-item span is nested inside the list's source-marked <ul>.
  // Double-click selects its text; it must not open the enclosing list's source.
  if (event.target.closest('[data-inline-original]')) return;
  const block = event.target.closest('[data-source-line]:not([data-inline-original])');
  if (block && !session) vscode.postMessage({type:'edit', line:Number(block.dataset.sourceLine)});
});
main.addEventListener('click', event => {
  const code = event.target.closest('code[data-fence-editable]');
  if (code) {
    const textarea = document.createElement('textarea');
    textarea.className = 'fence-input'; textarea.dataset.fenceInput = 'true';
    textarea.dataset.sourceLine = code.dataset.sourceLine; textarea.dataset.sourceEnd = code.dataset.sourceEnd;
    textarea.dataset.sourceType = 'fence_code'; textarea.setAttribute('aria-label', editorConfig.labels.codeEdit);
    textarea.value = code.textContent || ''; textarea.rows = Math.min(20, Math.max(3, textarea.value.split('\n').length));
    code.replaceWith(textarea); textarea.focus(); return;
  }
  const link = event.target.closest('a'); if (link) { event.preventDefault(); vscode.postMessage({type:'link', href:link.getAttribute('href')}); }
});
main.addEventListener('change', event => {
  const checkbox = event.target.closest('input[data-checklist-line]');
  if (!checkbox) return;
  const previous = !checkbox.checked;
  if (checklistPending) { checkbox.checked = previous; return; }
  checklistPending = { node: checkbox, previous };
  checkbox.disabled = true;
  if (!queueAction('checklist-toggle')) { checkbox.checked = previous; checkbox.disabled = false; checklistPending = undefined; }
});
const focusText = Number.isInteger(editorConfig.focusTextLine) ? main.querySelector('[data-inline-original][data-source-line="' + editorConfig.focusTextLine + '"]') : undefined;
if (focusText) {
  focusText.focus();
  const range = document.createRange(); range.selectNodeContents(focusText); range.collapse(true);
  const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
} else if (Number.isInteger(editorConfig.focusAfter)) {
  const slots = [...main.querySelectorAll('.insert-slot')];
  const target = slots.find(slot => Number(slot.dataset.insertLine) >= editorConfig.focusAfter) || slots.at(-1);
  target?.querySelector('.insert-field')?.focus();
}
`;
