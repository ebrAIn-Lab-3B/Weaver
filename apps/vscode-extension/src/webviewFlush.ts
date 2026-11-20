/** The small interface keeps the save handshake testable without a VS Code host. */
interface Disposable { dispose(): unknown }
interface FlushPanel {
  webview: {
    postMessage(message: unknown): Thenable<boolean>;
    onDidReceiveMessage(listener: (message: any) => unknown): Disposable;
  };
  onDidDispose(listener: () => unknown): Disposable;
}
interface Cancellation {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => unknown): Disposable;
}

let sequence = 0;

/**
 * Drain a panel before saving. The caller must release a successful lock after
 * the save completes or fails. A failure never authorizes the caller to save.
 */
export function flushWebview(panel: FlushPanel, cancellation: Cancellation): Promise<{ release(): void } | undefined> {
  if (cancellation.isCancellationRequested) return Promise.resolve(undefined);
  const requestId = `flush-${Date.now()}-${++sequence}`;
  return new Promise((resolve) => {
    let finished = false;
    const listeners: Disposable[] = [];
    const send = (type: string): void => {
      try { void Promise.resolve(panel.webview.postMessage({ type, requestId })).catch(() => {}); } catch { /* The panel may already be disposed. */ }
    };
    const finish = (ok: boolean): void => {
      if (finished) return;
      finished = true;
      for (const listener of listeners) listener.dispose();
      if (!ok) { send('flush-cancel'); resolve(undefined); return; }
      let released = false;
      resolve({ release: () => { if (!released) { released = true; send('flush-release'); } } });
    };
    listeners.push(panel.webview.onDidReceiveMessage((event) => {
      if (event?.type === 'flush-result' && event.requestId === requestId) finish(event.ok === true);
    }));
    listeners.push(panel.onDidDispose(() => finish(false)));
    listeners.push(cancellation.onCancellationRequested(() => finish(false)));
    if (finished) { for (const listener of listeners) listener.dispose(); return; }
    if (cancellation.isCancellationRequested) { finish(false); return; }
    try {
      void Promise.resolve(panel.webview.postMessage({ type: 'flush-request', requestId })).then((sent) => {
        if (!sent) finish(false);
      }, () => finish(false));
    } catch { finish(false); }
  });
}
