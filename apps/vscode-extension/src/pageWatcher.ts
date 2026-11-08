import * as vscode from 'vscode';
import {
  parsePageUrl,
  shouldRead,
  stateChanged,
  watchIsOver,
  WATCH_INTERVAL_SECONDS,
  type PageChecksState,
  type PageRef,
  type PageState,
  type ReadReason,
  type Watch,
} from '@palab/weaver-markdown';
import { fetchPageState } from '@palab/weaver-github';
import { getGitHubToken } from './github';
import { log } from './log';
import { message } from './locale';

const keyOf = (ref: PageRef): string => `${ref.repository.toLowerCase()}|${ref.kind}|${ref.number}`;

/**
 * Follows the pull requests and Issues that Weaver opened a page for (DEC-020 item 6). It reads only
 * those, only while a VS Code window is in front, once at the start, when the window comes back to
 * the front, and about every minute for ten minutes, and it stops when the page is merged or closed.
 * When something changes it tells the person in the status bar and has the Overview read again, so
 * the Overview is up to date when the person comes back from the page.
 */
export class PageWatcher implements vscode.Disposable {
  private watches = new Map<string, Watch>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private busy = false;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly changed: (ref: PageRef, state: PageState) => void) {
    this.subscription = vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) void this.poll('focus');
    });
  }

  /** Starts following the page that an address names. An address that is not a pull request or an Issue is left alone. */
  watch(url: string): void {
    const ref = parsePageUrl(url);
    if (!ref) return;
    this.watches.set(keyOf(ref), { ref, openedAt: Date.now() });
    // A check every quarter minute, so the minute between two reads is kept without a drifting timer.
    this.timer ??= setInterval(() => void this.poll('tick'), (WATCH_INTERVAL_SECONDS * 1000) / 4);
    void this.poll('tick');
  }

  /** How many pages are being followed, for tests of the wiring and for the log. */
  get size(): number {
    return this.watches.size;
  }

  private async poll(reason: ReadReason): Promise<void> {
    if (this.busy || this.watches.size === 0 || !vscode.window.state.focused) return;
    this.busy = true;
    try {
      const token = await getGitHubToken(false, ['repo', 'project']);
      if (token) {
        for (const watch of [...this.watches.values()]) {
          const now = Date.now();
          if (!shouldRead(watch, now, reason)) continue;
          const result = await fetchPageState(token, watch.ref);
          watch.readAt = now;
          if (!result.ok) {
            log(`page ${keyOf(watch.ref)} could not be read: ${result.error.code}`);
            continue;
          }
          const before = watch.last;
          watch.last = result.state;
          if (stateChanged(before, result.state)) {
            log(`page ${keyOf(watch.ref)}: ${before?.state}/${before?.checks ?? '-'} -> ${result.state.state}/${result.state.checks ?? '-'}`);
            this.changed(watch.ref, result.state);
          }
        }
      }
    } finally {
      this.busy = false;
      this.prune();
    }
  }

  /** Forgets the pages that are merged, closed, or followed long enough, and stops the timer when none is left. */
  private prune(): void {
    const now = Date.now();
    for (const [key, watch] of this.watches) if (watchIsOver(watch, now)) this.watches.delete(key);
    if (this.watches.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  dispose(): void {
    this.subscription.dispose();
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.watches.clear();
  }
}

/** The sentence for a change, for the status bar. */
export function describeChange(ref: PageRef, state: PageState): string {
  const args = { number: ref.number, repository: ref.repository };
  if (state.state === 'merged') return message('ui.watch.merged', args);
  if (state.state === 'closed') return message(ref.kind === 'pull' ? 'ui.watch.closed.pull' : 'ui.watch.closed.issue', args);
  const checks: PageChecksState = state.checks ?? 'none';
  return message('ui.watch.checks', { ...args, checks: message(`ui.watch.checks-state.${checks}` as const) });
}
