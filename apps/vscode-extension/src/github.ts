import * as vscode from 'vscode';

export {
  applyMove,
  fetchBoardItems,
  fetchEvidence,
  fetchIssue,
  type EvidenceResult,
  type IssueResult,
  type MoveStep,
} from '@ebrain-lab/weaver-github';

/**
 * Uses VS Code's built-in GitHub sign-in. Reading needs `repo`; moving a card also needs `project`.
 * `interactive: false` returns a token only when the user is already signed in.
 */
export async function getGitHubToken(interactive: boolean, scopes: string[] = ['repo']): Promise<string | undefined> {
  return (await getGitHubSession(interactive, scopes))?.accessToken;
}

/** Reuse the existing project session for repo-only operations before requesting a new session. */
export async function getGitHubSession(interactive: boolean, scopes: string[] = ['repo']): Promise<vscode.AuthenticationSession | undefined> {
  if (scopes.length === 1 && scopes[0] === 'repo') {
    const projectSession = await vscode.authentication.getSession('github', ['repo', 'project'], { silent: true });
    if (projectSession) return projectSession;
  }
  const session = await vscode.authentication.getSession(
    'github',
    scopes,
    interactive ? { createIfNone: true } : { silent: true },
  );
  return session;
}

/** Prefer the existing Overview session, while supporting repo-only sign-ins. */
export async function getStatusToken(interactive: boolean): Promise<string | undefined> {
  return getGitHubToken(interactive);
}
