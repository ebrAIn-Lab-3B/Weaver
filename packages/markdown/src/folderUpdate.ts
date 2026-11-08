/** What VS Code's Git tells of one repository of a folder (the parts that matter here). */
export interface FolderGitState {
  /** The name of the branch that is checked out; none when HEAD is detached. */
  branch?: string;
  /** The branch of the remote that it follows, such as `origin/main`; none when it follows nothing. */
  upstream?: string;
  /** Commits of its own that the remote does not have. */
  ahead: number;
  /** Commits of the remote that it does not have. */
  behind: number;
  /** Files with a change that is not committed, staged or not, or in the middle of a merge. */
  changed: number;
  /** The default branch of the repository on GitHub, when known. The task file is on it, so the folder must be on it too. */
  defaultBranch?: string;
}

/** Why the folder is not updated (DEC-024 item 3). */
export type FolderUpdateRefusal = 'detached' | 'not-default' | 'no-upstream' | 'changed' | 'ahead' | 'up-to-date';

export type FolderUpdateCheck = { ok: true; behind: number; branch: string; upstream: string } | { ok: false; reason: FolderUpdateRefusal };

/**
 * Whether the folder may be brought up to date by a fast-forward (DEC-024 item 3). It may only when the
 * branch is checked out and follows a branch of the remote, the working tree has no change, the branch
 * has no commit of its own (so there is nothing to merge), and it is behind. The order of the checks is
 * the order of what the person can do about it.
 */
export function checkFolderUpdate(state: FolderGitState): FolderUpdateCheck {
  if (!state.branch) return { ok: false, reason: 'detached' };
  if (state.defaultBranch && state.branch !== state.defaultBranch) return { ok: false, reason: 'not-default' };
  if (!state.upstream) return { ok: false, reason: 'no-upstream' };
  if (state.changed > 0) return { ok: false, reason: 'changed' };
  if (state.ahead > 0) return { ok: false, reason: 'ahead' };
  if (state.behind <= 0) return { ok: false, reason: 'up-to-date' };
  return { ok: true, behind: state.behind, branch: state.branch, upstream: state.upstream };
}
