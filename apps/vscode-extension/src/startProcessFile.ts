import * as vscode from 'vscode';
import { type DeclaredGuideline, formatNotice, t } from '@ebrain-lab/weaver-markdown';
import { errorNotice, openFilePullRequest, prepareProcessStart, processStartPullRequest } from '@ebrain-lab/weaver-github';
import { getGitHubToken } from './github';
import { openGuidelineCopies } from './guidelineStore';
import { currentLocale, message } from './locale';
import { openPage } from './openPage';

/**
 * Offers a starting process file to a repository that has none, from the Overview (DEC-019 item 6).
 * It shows the exact file first, in a dialog, and opens a pull request only after a yes (DEC-008);
 * the default branch is never written to. Returns true when the pull request was opened.
 */
export async function startProcessFile(
  repository: string,
  cards: readonly { labels: readonly string[] }[],
  guideline: DeclaredGuideline | undefined,
): Promise<boolean> {
  const locale = currentLocale();
  const token = await getGitHubToken(true, ['repo', 'project']);
  if (!token) return false;

  const kept = await openGuidelineCopies();
  const prepared = await prepareProcessStart({ token, repository, guideline, cards, copies: kept.store });
  await kept.save();
  if (!prepared.ok) {
    void vscode.window.showInformationMessage(formatNotice(prepared.refusal, locale));
    return false;
  }

  const notes = prepared.notes.map((note) => formatNotice(note, locale));
  const detail = message('ui.process-start.confirm-detail', {
    source: formatNotice(prepared.source, locale),
    notes: notes.length ? `${notes.join('\n')}\n` : '',
    text: prepared.text,
  });
  const open = message('ui.process-start.button');
  const choice = await vscode.window.showInformationMessage(message('ui.process-start.title', { repository }), { modal: true, detail }, open);
  if (choice !== open) return false;

  const session = await vscode.authentication.getSession('github', ['repo', 'project'], { silent: true });
  const login = session?.account.label;
  const attribution = login ? t('steward.attribution', locale, { login }) : t('steward.attribution-anonymous', locale);
  try {
    const pull = await openFilePullRequest(token, repository, processStartPullRequest(prepared.text, attribution));
    const view = message('ui.process-start.view');
    const next = await vscode.window.showInformationMessage(message('ui.process-start.done', { repository, number: pull.number }), view);
    if (next === view) await openPage(pull.url);
    return true;
  } catch (error) {
    void vscode.window.showErrorMessage(message('ui.process-start.failed', { detail: formatNotice(errorNotice(error), locale) }));
    return false;
  }
}
