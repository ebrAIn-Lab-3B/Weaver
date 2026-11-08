import * as vscode from 'vscode';
import { describeMove, evidenceGaps, formatNotice, type MessageKey, type Notice, parseIssueUrl, planMove } from '@ebrain-lab/weaver-markdown';
import { applyMove, fetchBoardItems, fetchEvidence, fetchIssue, getGitHubToken } from './github';
import { currentLocale, message } from './locale';
import { processStore } from './processStore';

/**
 * Marks the card of a finished piece of work Verified, from the card itself (DEC-023). It does what the
 * requirement view does for a move to Verified: it reads the Issue, its evidence, and its board status,
 * plans the move with the rules of the repository, shows the plan and the evidence gaps, and writes
 * only after the person says yes (DEC-008). A card needs no requirement for it. Returns true when the
 * card was moved.
 *
 * `label` is how the card is named in the dialog: its task (`TASK-098`), or `#number` for a plain Issue.
 */
export async function markVerified(card: { url: string; label: string }, projectTitle: string | undefined): Promise<boolean> {
  const ref = parseIssueUrl(card.url);
  const locale = currentLocale();
  const token = await getGitHubToken(true, ['repo', 'project']);
  if (!ref || !token) return false;
  const repository = `${ref.owner}/${ref.repo}`;

  const [issue, evidence, board] = await Promise.all([fetchIssue(token, card.url), fetchEvidence(token, card.url), fetchBoardItems(token, card.url)]);
  if (!issue.ok) {
    void vscode.window.showWarningMessage(formatNotice(issue.error, locale));
    return false;
  }
  const rules = processStore.rulesFor(repository);
  const evidenceRules = processStore.evidenceFor(repository);
  const boardStatus = (board?.find((item) => item.project === projectTitle) ?? board?.[0])?.status;
  const column = 'Verified' as const;
  const columnLabel = message(`column.${column}` as MessageKey);

  const plan = planMove({ ...issue.issue, ...(boardStatus ? { boardStatus } : {}) }, column, rules);
  if (plan.unavailable) {
    void vscode.window.showWarningMessage(message('ui.msg.move-unavailable', { task: card.label, column: columnLabel }));
    return false;
  }
  if (plan.noop) {
    void vscode.window.showInformationMessage(message('ui.msg.mark-verified-already', { task: card.label }));
    return false;
  }

  const lines = describeMove(plan, issue.issue).map((line) => formatNotice(line, locale));
  const missing = evidenceGaps('Verified', evidence.ok ? evidence.evidence : undefined, evidenceRules).map((gap) => formatNotice(gap, locale));
  const warning = `\n\n${message('ui.dialog.verified-warning')}${missing.length ? `\n${message('ui.dialog.evidence-gaps', { gaps: missing.join('; ') })}` : ''}`;
  const detail = `${message('ui.dialog.move-detail', { number: issue.issue.number })}\n- ${lines.join('\n- ')}${warning}`;
  const moveLabel = message('ui.dialog.move-button');
  const choice = await vscode.window.showWarningMessage(message('ui.dialog.move-title', { task: card.label, column: columnLabel }), { modal: true, detail }, moveLabel);
  if (choice !== moveLabel) return false;

  const steps = await applyMove(token, card.url, plan);
  const text = (notice: Notice | undefined): string => (notice ? formatNotice(notice, locale) : '');
  const failed = steps.find((s) => !s.ok);
  if (failed) {
    const done = steps.filter((s) => s.ok).map((s) => text(s.name)).join('; ') || message('ui.msg.move-nothing');
    void vscode.window.showErrorMessage(message('ui.msg.move-stopped', { step: text(failed.name), detail: text(failed.detail), done }));
    return false;
  }
  const note = steps.filter((s) => s.skipped).map((s) => text(s.detail)).join(' ');
  void vscode.window.showInformationMessage(`${message('ui.msg.move-done', { task: card.label, column: columnLabel })}${note ? ' ' + note : ''}`);
  return true;
}
