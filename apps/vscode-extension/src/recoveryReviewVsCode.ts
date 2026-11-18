import * as vscode from 'vscode';
import type { RecoveryRecord } from './recoveryJournal';
import type { RecoveryNotice, RecoveryReviewPort } from './recoveryReview';

/** All displayed wording comes from the calling extension's message catalog. */
export interface RecoveryReviewLabels {
  chooseRecord: string;
  chooseAction: string;
  open: string;
  discard: string;
  confirmDiscard: string;
  confirm: string;
  notices: Record<RecoveryNotice, string>;
}

/** Construct an explicit recovery UI that only opens an untitled document. */
export function createRecoveryReviewPort(labels: RecoveryReviewLabels): RecoveryReviewPort {
  return {
    async chooseRecord(records) {
      const items = records.map((record) => ({
        label: record.updatedAt,
        description: `${vscode.Uri.parse(record.documentUri).fsPath} · ${record.sessionId.slice(0, 8)} · ${record.sequence}`,
        record,
      }));
      return (await vscode.window.showQuickPick(items, { placeHolder: labels.chooseRecord }))?.record;
    },
    async chooseAction(_record: RecoveryRecord) {
      const items: Array<vscode.QuickPickItem & { action: 'open' | 'discard' }> = [
        { label: labels.open, action: 'open' },
        { label: labels.discard, action: 'discard' },
      ];
      return (await vscode.window.showQuickPick(items, { placeHolder: labels.chooseAction }))?.action;
    },
    async confirmDiscard() {
      return (await vscode.window.showWarningMessage(labels.confirmDiscard, { modal: true }, labels.confirm)) === labels.confirm;
    },
    async openDraft(text) {
      const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: text });
      await vscode.window.showTextDocument(document, { preview: false });
    },
    async notify(notice) {
      if (notice === 'error') await vscode.window.showErrorMessage(labels.notices[notice]);
      else await vscode.window.showInformationMessage(labels.notices[notice]);
    },
  };
}
