import * as vscode from 'vscode';
import { message } from './locale';
import { escapeHtml } from './requirementHtml';
import { RequirementView } from './requirementView';
import { Loaded, requirementsOf } from './workspace';
import { markdownEditorTarget } from '@ebrain-lab/weaver-markdown';
import { attachMarkdownEditor } from './markdownEditor';
import { whilePanelAlive } from './panelLifecycle';

export const REQUIREMENT_EDITOR = 'weaver.requirementEditor';
export const MARKDOWN_AUTHOR_EDITOR = 'weaver.markdownAuthor';

/** Explicit writing surface; the standard requirement view remains the default. */
export class MarkdownAuthorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}
  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    attachMarkdownEditor(document, panel, this.context, true);
  }
}

/** Opens a requirement file as its Weaver view instead of raw Markdown (TASK-017). */
export class RequirementEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(
    private readonly view: RequirementView,
    private readonly load: () => Promise<Loaded>,
    private readonly context: vscode.ExtensionContext,
  ) {}

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const target = markdownEditorTarget(document.uri.fsPath, document.getText());
    if (target === 'markdown' || target === 'task') {
      attachMarkdownEditor(document, panel, this.context, target === 'task');
      return;
    }
    panel.webview.options = { enableScripts: true };
    await whilePanelAlive(panel, this.load, (loaded) => {
      const path = vscode.workspace.asRelativePath(document.uri);
      const requirement = requirementsOf(loaded).find((r) => r.path === path);
      if (!requirement) {
        panel.webview.html = `<body style="padding:24px;font-family:var(--vscode-font-family);color:var(--vscode-foreground)">${escapeHtml(message('ui.msg.not-requirement'))}</body>`;
        return;
      }
      this.view.attach(panel, loaded, requirement);
    });
  }
}
