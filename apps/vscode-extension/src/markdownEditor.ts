import * as vscode from 'vscode';
import * as path from 'path';
import { renderMarkdown } from './renderMarkdown';
import { message } from './locale';
import { escapeHtml } from './requirementHtml';
import { planInsertion, type InsertKind } from './slashInsertion';
import { inlinePrefix } from './inlineEditing';
import { markdownClient } from './markdownWebview';
import { matchesOwnDocumentChange, type ExpectedDocumentChange } from './ownDocumentChange';
import { splitParagraph } from './splitParagraph';
import { fenceBody, planFenceBodyEdit } from './fenceEditing';
import { planChecklistToggle } from './checklistEditing';
import { markdownSlotStyles } from './markdownSlotStyles';
import { submitDocumentEdit } from './submitDocumentEdit';

/** Edits are targeted VS Code document changes; unsupported Markdown stays in source mode. */
export function attachMarkdownEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel, context: vscode.ExtensionContext, task = false): void {
  const localRoots = [context.extensionUri, vscode.Uri.joinPath(document.uri, '..'), ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri)];
  panel.webview.options = { enableScripts: true, localResourceRoots: localRoots };
  let editing = false;
  let focusAfter: number | undefined;
  let focusTextLine: number | undefined;
  let slot: { base: string; line: number; offset: number; inserted: string } | undefined;
  let inline: { line: number; prefix: string; expected: string } | undefined;
  let fence: { base: string; line: number; endLine: number; start: number; inserted: string } | undefined;
  let ownChanges: ExpectedDocumentChange[] = [];
  let staleProjection = false;
  const applyEdit = (edit: vscode.WorkspaceEdit, version: number): Promise<boolean> =>
    submitDocumentEdit(document, version, () => vscode.workspace.applyEdit(edit)).then((ok) => {
      if (!ok) ownChanges = ownChanges.filter((change) => change.version !== version + 1);
      return ok;
    });
  const render = (): void => {
    staleProjection = false;
    const script = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist', 'markdownPreview.js'));
    const nonce = `${Date.now()}${Math.random().toString(36).slice(2)}`;
    const body = renderMarkdown(document.getText(), (src) => {
      const uri = vscode.Uri.joinPath(document.uri, '..', decodeURIComponent(src.split(/[?#]/)[0]));
      return panel.webview.asWebviewUri(uri).toString();
    }, message('ui.markdown.insert-placeholder'), message('ui.markdown.checklist'), message('ui.markdown.nested-source-hint'));
    const config = JSON.stringify({ version: document.version, focusAfter, focusTextLine, labels: {
      menu: message('ui.markdown.slash-menu'), heading: message('ui.markdown.heading'), bullet: message('ui.markdown.bullet'),
      checklist: message('ui.markdown.checklist'), code: message('ui.markdown.code'), conflict: message('ui.markdown.edit-conflict'),
      nestedHint: message('ui.markdown.nested-source-hint'), source: message('ui.markdown.source'),
      codeEdit: message('ui.markdown.code-edit'), fenceInvalid: message('ui.markdown.fence-invalid'), copyDraft: message('ui.markdown.copy-draft'), openDraft: message('ui.markdown.open-draft'),
    } }).replace(/</g, '\\u003c');
    focusAfter = undefined;
    focusTextLine = undefined;
    panel.webview.html = `<!doctype html><html><head><meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} https: data:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${panel.webview.cspSource} data:;">
      <style>body{padding:20px 32px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family);line-height:1.6}button{color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;padding:6px 12px;cursor:pointer}img,svg{max-width:100%}main p{margin:.4em 0}main h1,main h2,main h3,main h4,main h5,main h6{margin:.8em 0 .3em}main ul,main ol{margin:.4em 0}pre{overflow:auto;padding:12px;background:var(--vscode-textCodeBlock-background);margin:.5em 0}table{border-collapse:collapse}th,td{border:1px solid var(--vscode-panel-border);padding:6px}a{color:var(--vscode-textLink-foreground)}[data-inline-original]:focus,.insert-field:focus{outline:none}[data-inline-original]:hover{background:var(--vscode-editor-hoverHighlightBackground)}.insert-slot{position:relative;height:4px}.insert-slot:last-child,.insert-slot:focus-within,.insert-slot.empty-paragraph{height:auto;min-height:1.6em}.insert-field{min-height:4px;outline:none;white-space:pre-wrap}.insert-slot:last-child .insert-field,.insert-slot:focus-within .insert-field{min-height:1.6em}.insert-field:focus:empty:before,.insert-slot:last-child .insert-field:empty:before{content:attr(data-placeholder);color:var(--vscode-descriptionForeground);opacity:.7}.slash-menu{position:absolute;z-index:5;left:0;top:100%;min-width:190px;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-editorWidget-border,var(--vscode-panel-border));box-shadow:0 4px 12px #0005;padding:4px}.slash-menu button{display:block;width:100%;text-align:left;background:transparent;color:var(--vscode-editorWidget-foreground);padding:5px 9px}.slash-menu button[aria-selected=true],.slash-menu button:hover{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}.insert-slot[data-kind=heading] .insert-field{font-size:1.5em;font-weight:600}.insert-slot[data-kind=bullet] .insert-field:before{content:'• ';color:inherit}.insert-slot[data-kind=checklist] .insert-field:before{content:'☐ ';color:inherit}.insert-slot[data-kind=code] .insert-field{font-family:var(--vscode-editor-font-family);background:var(--vscode-textCodeBlock-background);padding:6px}.fence-input{display:block;box-sizing:border-box;width:100%;min-height:4em;resize:vertical;border:1px solid var(--vscode-focusBorder);background:transparent;color:var(--vscode-editor-foreground);font:inherit;font-family:var(--vscode-editor-font-family);line-height:inherit;white-space:pre;tab-size:4}</style>
      <style>pre code[data-fence-editable]{display:block;min-height:1.4em;cursor:text}</style>
      <style>${markdownSlotStyles}</style>
      </head><body><button id="source">${escapeHtml(message('ui.markdown.source'))}</button> ${task ? `<button id="requirement">${escapeHtml(message('ui.markdown.requirement'))}</button>` : ''}<main>${body}</main>
      <script nonce="${nonce}" src="${script}"></script><script nonce="${nonce}">const editorConfig=${config};${markdownClient}</script></body></html>`;
  };
  const change = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.uri.toString() !== document.uri.toString() || event.contentChanges.length === 0) return;
    const matched = ownChanges.findIndex((expected) => matchesOwnDocumentChange(expected, event.document.version, event.contentChanges));
    if (matched >= 0) { ownChanges.splice(matched, 1); return; }
    ownChanges = ownChanges.filter((expected) => expected.version > event.document.version);
    if (editing || staleProjection) void panel.webview.postMessage({ type: 'conflict', detail: message('ui.markdown.stale-draft') });
    else render();
  });
  const receive = panel.webview.onDidReceiveMessage(async (event: { type?: string; line?: number; endLine?: number; blockType?: string; expected?: string; value?: string; version?: number; checked?: boolean; kind?: InsertKind; next?: boolean; preserve?: boolean; history?: boolean; caret?: number; selectionEnd?: number; href?: string }) => {
    if (event.type === 'focus') { editing = true; slot = undefined; inline = undefined; fence = undefined; return; }
    if (event.type === 'copy-draft' && typeof event.value === 'string' && event.value.length <= 1_000_000) {
      try {
        await vscode.env.clipboard.writeText(event.value);
        void vscode.window.showInformationMessage(message('ui.markdown.draft-copied'));
      } catch {
        void vscode.window.showErrorMessage(message('ui.markdown.copy-failed'));
      }
      return;
    }
    if (event.type === 'open-draft' && typeof event.value === 'string' && event.value.length <= 1_000_000) {
      try {
        const recovery = await vscode.workspace.openTextDocument({ language: 'markdown', content: event.value });
        await vscode.window.showTextDocument(recovery, { preview: false });
        void vscode.window.showInformationMessage(message('ui.markdown.open-draft-save'));
      } catch {
        void vscode.window.showErrorMessage(message('ui.markdown.open-draft-failed'));
      }
      return;
    }
    let slotSplit: { line: number; shift: number } | undefined;
    if (event.type === 'split-slot') {
      const fail = (): void => { void panel.webview.postMessage({ type: 'edit-failed', detail: message('ui.markdown.stale-draft') }); };
      if (!slot || !event.kind || !['paragraph', 'heading', 'bullet', 'checklist'].includes(event.kind) || event.line !== slot.line || event.version !== document.version || event.expected !== slot.inserted || typeof event.value !== 'string' || !event.value.trim() || /[\r\n]/.test(event.value) || document.getText().slice(slot.offset, slot.offset + slot.inserted.length) !== slot.inserted) { fail(); return; }
      const index = slot.inserted.indexOf(event.value);
      if (index < 0) { fail(); return; }
      const actualLine = document.positionAt(slot.offset + index).line;
      const blockType = event.kind === 'heading' ? 'heading_open' : event.kind === 'bullet' || event.kind === 'checklist' ? 'list_item_inline' : 'paragraph_open';
      const sourceLine = document.lineAt(actualLine).text, prefix = inlinePrefix(sourceLine, blockType);
      if (prefix === undefined || sourceLine.slice(prefix.length) !== event.value) { fail(); return; }
      slotSplit = { line: slot.line, shift: (slot.inserted.match(/\n/g) || []).length + (blockType === 'list_item_inline' ? 1 : 2) };
      event.type = 'split'; event.line = actualLine; event.blockType = blockType; event.expected = sourceLine;
    }
    if (event.type === 'split') {
      const fail = (): void => { void panel.webview.postMessage({ type: 'edit-failed', detail: message('ui.markdown.stale-draft') }); };
      if (staleProjection || !editing || !Number.isInteger(event.line) || event.line! < 0 || event.line! >= document.lineCount ||
          !Number.isInteger(event.caret) || !Number.isInteger(event.selectionEnd) || typeof event.expected !== 'string' ||
          !['paragraph_open', 'heading_open', 'list_item_inline'].includes(event.blockType ?? '') || event.version !== document.version) { fail(); return; }
      const before = document.getText();
      const original = document.lineAt(event.line!);
      if (original.text !== event.expected || (inline && (inline.line !== event.line || inline.expected !== event.expected))) { fail(); return; }
      const start = document.offsetAt(original.range.start), end = document.offsetAt(original.range.end);
      const after = before.slice(end);
      const eol = after.startsWith('\r\n') ? '\r\n' : after.startsWith('\n') ? '\n' : document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
      const headingPrefix = event.blockType === 'heading_open' ? inlinePrefix(original.text, event.blockType) : undefined;
      const headingText = headingPrefix === undefined ? undefined : original.text.slice(headingPrefix.length);
      const split = event.blockType === 'heading_open'
        ? headingText !== undefined && event.caret === headingText.length && event.selectionEnd === headingText.length ? original.text + eol + eol : undefined
        : splitParagraph(original.text, event.blockType!, event.caret!, event.selectionEnd!, eol);
      if (split === undefined) { fail(); return; }
      const nextLine = event.line! + (event.blockType === 'list_item_inline' ? 1 : 2);
      const nextSource = before.slice(0, start) + split + before.slice(end);
      const expectedVersion = document.version + 1;
      const edit = new vscode.WorkspaceEdit(); edit.replace(document.uri, original.range, split);
      const own: ExpectedDocumentChange = { version: expectedVersion, offset: start, length: original.text.length, text: split };
      ownChanges.push(own);
      try {
        if (!await applyEdit(edit, event.version!) || document.version !== expectedVersion || document.getText() !== nextSource) { ownChanges = ownChanges.filter(item => item !== own); fail(); return; }
        const right = document.lineAt(nextLine).text;
        const prefix = inlinePrefix(right, event.blockType === 'heading_open' ? 'paragraph_open' : event.blockType!);
        if (prefix === undefined) { fail(); return; }
        inline = { line: nextLine, prefix, expected: right }; slot = undefined; fence = undefined;
        void panel.webview.postMessage({ type: 'split-applied', version: document.version, line: event.line, nextLine,
          leftExpected: document.lineAt(event.line!).text, rightExpected: right,
          ...(slotSplit ? { slot: true, line: slotSplit.line, leftLine: event.line, shift: slotSplit.shift } : {}) });
      } catch { ownChanges = ownChanges.filter(item => item !== own); fail(); }
      return;
    }
    if (event.type === 'finish') {
      if (event.history) {
        // The history command refreshes the document on completion. Avoid an
        // intermediate projection that steals focus before the command runs.
        editing = false; staleProjection = false; slot = undefined; inline = undefined; fence = undefined;
        if (Number.isInteger(event.line)) { focusAfter = event.line; focusTextLine = event.line; }
        return;
      }
      if (event.next && (event.blockType === 'paragraph_open' || event.blockType === 'list_item_inline') && Number.isInteger(event.line) && Number.isInteger(event.caret) && Number.isInteger(event.selectionEnd) && event.line! >= 0 && event.line! < document.lineCount) {
        // A queued editor still points into the old projection. Do not split and
        // re-render behind it: that would discard its unacknowledged draft.
        if (event.preserve) { staleProjection = true; editing = false; slot = undefined; inline = undefined; fence = undefined; return; }
        if (staleProjection) { void panel.webview.postMessage({ type: 'edit-failed', detail: message('ui.markdown.stale-draft') }); return; }
        const original = document.lineAt(event.line!);
        const afterLine = document.getText().slice(document.offsetAt(original.range.end));
        const eol = afterLine.startsWith('\r\n') ? '\r\n' : afterLine.startsWith('\n') ? '\n' : document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
        const split = splitParagraph(original.text, event.blockType, event.caret!, event.selectionEnd!, eol);
        if (event.version !== document.version || event.expected !== original.text || split === undefined) {
          void panel.webview.postMessage({ type: 'edit-failed', detail: message('ui.markdown.edit-conflict') });
          return;
        }
        const edit = new vscode.WorkspaceEdit();
        const offset = document.offsetAt(original.range.start);
        edit.replace(document.uri, original.range, split);
        ownChanges.push({ version: document.version + 1, offset, length: original.text.length, text: split });
        if (!await applyEdit(edit, event.version!)) { void panel.webview.postMessage({ type: 'edit-failed', detail: message('ui.markdown.edit-failed') }); return; }
        const nextLine = event.line! + (event.blockType === 'list_item_inline' ? 1 : 2);
        focusAfter = nextLine;
        if (event.blockType === 'list_item_inline' || event.selectionEnd! < original.text.length) focusTextLine = nextLine;
        editing = false; slot = undefined; inline = undefined; fence = undefined; render(); return;
      }
      editing = false;
      // Insertions and fence edits may shift every subsequent source line, even
      // when a stale line contains identical text. Refuse queued writes until
      // a fresh projection can be shown without destroying a draft.
      if (event.preserve && (slot || fence)) staleProjection = true;
      if (event.next && Number.isInteger(event.line)) focusAfter = slot ? document.positionAt(slot.offset + slot.inserted.length).line : event.line! + 1;
      slot = undefined; inline = undefined; fence = undefined; if (!event.preserve) render(); return;
    }
    if (event.type === 'undo' || event.type === 'redo') {
      editing = false; slot = undefined; inline = undefined; fence = undefined;
      const version = document.version;
      try { await vscode.commands.executeCommand(event.type); }
      finally {
        // No document event is emitted when there is no history entry or the
        // command fails; release the busy view in either case.
        if (document.version === version) render();
      }
      return;
    }
    if (event.type === 'save') { await document.save(); return; }
    if (event.type === 'multiline-paste') {
      void vscode.window.showInformationMessage(message('ui.markdown.multiline-paste'));
      return;
    }
    if (event.type === 'split-unavailable') {
      void vscode.window.showInformationMessage(message('ui.markdown.split-unavailable'));
      return;
    }
    if (event.type === 'checklist-stale') {
      void vscode.window.showInformationMessage(message('ui.markdown.edit-conflict'));
      if (!editing && !staleProjection) render();
      return;
    }
    if (event.type === 'checklist-toggle') {
      const fail = (): void => { void panel.webview.postMessage({ type: 'checklist-result', ok: false, detail: message('ui.markdown.edit-conflict') }); };
      if (staleProjection || editing || event.version !== document.version || !Number.isInteger(event.line) || typeof event.expected !== 'string' || typeof event.checked !== 'boolean') { fail(); return; }
      const plan = planChecklistToggle(document.getText(), event.line!, event.expected, event.checked);
      if (!plan || document.getText().slice(plan.offset, plan.offset + plan.length) !== plan.expected) { fail(); return; }
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, new vscode.Range(document.positionAt(plan.offset), document.positionAt(plan.offset + plan.length)), plan.text);
      const own: ExpectedDocumentChange = { version: document.version + 1, offset: plan.offset, length: plan.length, text: plan.text };
      ownChanges.push(own);
      try {
        if (!await applyEdit(edit, event.version!)) { ownChanges = ownChanges.filter((change) => change !== own); fail(); return; }
        void panel.webview.postMessage({ type: 'checklist-result', ok: true, version: document.version, expected: document.lineAt(event.line!).text, checked: event.checked });
      } catch { ownChanges = ownChanges.filter((change) => change !== own); fail(); }
      return;
    }
    if (event.type === 'slot-change' || event.type === 'inline-change' || event.type === 'fence-change') {
      const fail = (): void => { void panel.webview.postMessage({ type: 'edit-failed', detail: message('ui.markdown.edit-conflict') }); };
      if (staleProjection) { void panel.webview.postMessage({ type: 'edit-failed', detail: message('ui.markdown.stale-draft') }); return; }
      if (event.version !== document.version || !Number.isInteger(event.line) || typeof event.value !== 'string' || (event.type !== 'fence-change' && (/[\r\n]/.test(event.value) || event.value.length > 10000))) { fail(); return; }
      const edit = new vscode.WorkspaceEdit();
      let expected = '';
      let changeDetails: Omit<ExpectedDocumentChange, 'version'> | undefined;
      if (event.type === 'fence-change' && Number.isInteger(event.endLine) && typeof event.expected === 'string') {
        const base = fence?.base ?? document.getText();
        const current = fenceBody(base, event.line!, event.endLine!);
        if (!current || (fence && (fence.line !== event.line || fence.endLine !== event.endLine || fence.inserted !== event.expected)) ||
            (!fence && current.body.replace(/\r\n/g, '\n') !== event.expected.replace(/\r\n/g, '\n'))) { fail(); return; }
        const plan = planFenceBodyEdit(base, event.line!, event.endLine!, event.value);
        if (!plan) { void panel.webview.postMessage({ type: 'edit-invalid', detail: message('ui.markdown.fence-invalid') }); return; }
        if (fence) {
          if (document.getText().slice(fence.start, fence.start + fence.inserted.length) !== fence.inserted) { fail(); return; }
          edit.replace(document.uri, new vscode.Range(document.positionAt(fence.start), document.positionAt(fence.start + fence.inserted.length)), plan.text);
          changeDetails = { offset: fence.start, length: fence.inserted.length, text: plan.text };
        } else {
          fence = { base, line: event.line!, endLine: event.endLine!, start: plan.start, inserted: current.body };
          edit.replace(document.uri, new vscode.Range(document.positionAt(plan.start), document.positionAt(plan.end)), plan.text);
          changeDetails = { offset: plan.start, length: plan.end - plan.start, text: plan.text };
        }
        expected = plan.text;
      } else if (event.type === 'slot-change' && event.kind) {
        const base = slot?.base ?? document.getText();
        const line = slot?.line ?? event.line!;
        if (line !== event.line) { fail(); return; }
        if (event.kind === 'paragraph' && !event.value.trim()) {
          if (!slot) { void panel.webview.postMessage({ type: 'edit-applied', version: document.version, expected: '' }); return; }
          edit.replace(document.uri, new vscode.Range(document.positionAt(slot.offset), document.positionAt(slot.offset + slot.inserted.length)), '');
          ownChanges.push({ version: document.version + 1, offset: slot.offset, length: slot.inserted.length, text: '' });
          if (!await applyEdit(edit, event.version!)) { fail(); return; }
          slot = undefined; void panel.webview.postMessage({ type: 'edit-applied', version: document.version, expected: '' });
          return;
        }
        const plan = planInsertion(base, line, event.kind, event.value);
        if (!plan) { fail(); return; }
        if (slot) {
          if (document.getText().slice(slot.offset, slot.offset + slot.inserted.length) !== slot.inserted) { fail(); return; }
          edit.replace(document.uri, new vscode.Range(document.positionAt(slot.offset), document.positionAt(slot.offset + slot.inserted.length)), plan.text);
          changeDetails = { offset: slot.offset, length: slot.inserted.length, text: plan.text };
        } else {
          slot = { base, line, offset: plan.offset, inserted: '' };
          edit.insert(document.uri, document.positionAt(plan.offset), plan.text);
          changeDetails = { offset: plan.offset, length: 0, text: plan.text };
        }
        expected = plan.text;
      } else if (event.type === 'inline-change' && typeof event.expected === 'string' && typeof event.blockType === 'string' && event.line! >= 0 && event.line! < document.lineCount) {
        const original = document.lineAt(event.line!);
        const prefix = inline?.prefix ?? inlinePrefix(original.text, event.blockType);
        if (prefix === undefined || original.text !== event.expected || (inline && (inline.line !== event.line || inline.expected !== event.expected))) { fail(); return; }
        expected = prefix + event.value;
        inline = { line: event.line!, prefix, expected };
        edit.replace(document.uri, original.range, expected);
        changeDetails = { offset: document.offsetAt(original.range.start), length: original.text.length, text: expected };
      } else { fail(); return; }
      if (changeDetails && document.getText().slice(changeDetails.offset, changeDetails.offset + changeDetails.length) === changeDetails.text) {
        if (event.type === 'slot-change' && slot) slot.inserted = expected;
        if (event.type === 'fence-change' && fence) fence.inserted = expected;
        void panel.webview.postMessage({ type: 'edit-applied', version: document.version, expected });
        return;
      }
      if (changeDetails) ownChanges.push({ version: document.version + 1, ...changeDetails });
      if (!await applyEdit(edit, event.version!)) { fail(); return; }
      if (event.type === 'slot-change' && slot) slot.inserted = expected;
      if (event.type === 'fence-change' && fence) fence.inserted = expected;
      void panel.webview.postMessage({ type: 'edit-applied', version: document.version, expected });
      return;
    }
    if (event.type === 'requirement' && task) await vscode.commands.executeCommand('weaver.openRequirementView', document.uri);
    else if (event.type === 'source' || event.type === 'edit') {
      await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default', { viewColumn: panel.viewColumn });
      if (Number.isInteger(event.line) && event.line! >= 0) {
        const editor = vscode.window.visibleTextEditors.find((item) => item.document.uri.toString() === document.uri.toString());
        if (editor) { const pos = new vscode.Position(Math.min(event.line!, document.lineCount - 1), 0); editor.selection = new vscode.Selection(pos, pos); editor.revealRange(new vscode.Range(pos, pos)); }
      }
    } else if (event.type === 'link' && typeof event.href === 'string') {
      try {
        if (/^https?:/i.test(event.href) || /^mailto:/i.test(event.href)) await vscode.env.openExternal(vscode.Uri.parse(event.href));
        else if (!/^[a-z][a-z0-9+.-]*:/i.test(event.href) && !event.href.startsWith('#')) {
          const target = decodeURIComponent(event.href.split('#')[0].split('?')[0]);
          await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.resolve(path.dirname(document.uri.fsPath), target)));
        }
      } catch { void vscode.window.showErrorMessage(message('ui.markdown.link-error')); }
    }
  });
  panel.onDidDispose(() => { change.dispose(); receive.dispose(); });
  render();
}
