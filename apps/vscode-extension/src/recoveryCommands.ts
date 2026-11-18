import * as vscode from 'vscode';
import { message } from './locale';
import { RecoveryCoordinator } from './recoveryCoordinator';
import { RecoveryJournal } from './recoveryJournal';
import { RecoveryProviderJournal } from './recoveryProviderJournal';
import { reviewRecoveryDrafts } from './recoveryReview';
import { createRecoveryReviewPort } from './recoveryReviewVsCode';

/** Review all stored drafts even if their original documents no longer exist. */
export async function reviewAllRecoveryDrafts(context: vscode.ExtensionContext): Promise<void> {
  try {
    const storage = context.globalStorageUri;
    if (!storage || !['file', 'vscode-userdata'].includes(storage.scheme) || vscode.env.remoteName) {
      void vscode.window.showErrorMessage(message('ui.markdown.recovery-unavailable'));
      return;
    }
    await vscode.workspace.fs.createDirectory(storage);
    const journal = storage.scheme === 'vscode-userdata'
      ? new RecoveryProviderJournal(vscode.workspace.fs, storage, (base, ...parts) => vscode.Uri.joinPath(base, ...parts))
      : new RecoveryJournal(storage.fsPath);
    await reviewRecoveryDrafts(new RecoveryCoordinator(journal), undefined, createRecoveryReviewPort({
      chooseRecord: message('ui.markdown.recovery-choose-all'), chooseAction: message('ui.markdown.recovery-action'),
      open: message('ui.markdown.open-draft'), discard: message('ui.markdown.recovery-discard'),
      confirmDiscard: message('ui.markdown.recovery-confirm'), confirm: message('ui.markdown.recovery-discard'),
      notices: {
        empty: message('ui.markdown.recovery-empty-all'), opened: message('ui.markdown.open-draft-save'),
        discarded: message('ui.markdown.recovery-discarded'), changed: message('ui.markdown.recovery-changed'),
        missing: message('ui.markdown.recovery-missing'), diagnostics: message('ui.markdown.recovery-diagnostics'),
        error: message('ui.markdown.recovery-failed'),
      },
    }));
  } catch { void vscode.window.showErrorMessage(message('ui.markdown.recovery-failed')); }
}
