import { describe, expect, it } from 'vitest';
import { flushWebview } from '../../../apps/vscode-extension/src/webviewFlush';

function harness() {
  const messages: any[] = [];
  let receive: (message: any) => unknown = () => {};
  let cancel: () => unknown = () => {};
  let dispose: () => unknown = () => {};
  const disposable = () => ({ dispose() {} });
  const panel = {
    webview: {
      postMessage: async (message: any) => { messages.push(message); return true; },
      onDidReceiveMessage: (listener: typeof receive) => { receive = listener; return disposable(); },
    },
    onDidDispose: (listener: typeof dispose) => { dispose = listener; return disposable(); },
  };
  const token = { isCancellationRequested: false, onCancellationRequested: (listener: typeof cancel) => { cancel = listener; return disposable(); } };
  return { panel, token, messages, receive: (message: any) => receive(message), cancel: () => cancel(), dispose: () => dispose() };
}

describe('host flush handshake', () => {
  it('accepts only the matching response and releases a successful lock once', async () => {
    const h = harness(); const result = flushWebview(h.panel, h.token);
    const requestId = h.messages[0].requestId;
    h.receive({ type: 'flush-result', requestId: 'other', ok: true });
    h.receive({ type: 'flush-result', requestId, ok: true });
    const lock = await result; expect(lock).toBeDefined();
    lock!.release(); lock!.release();
    expect(h.messages).toEqual([{ type: 'flush-request', requestId }, { type: 'flush-release', requestId }]);
  });
  it('cancels a pending request and ignores a late response', async () => {
    const h = harness(); const result = flushWebview(h.panel, h.token);
    const requestId = h.messages[0].requestId;
    h.cancel(); h.receive({ type: 'flush-result', requestId, ok: true });
    expect(await result).toBeUndefined();
    expect(h.messages).toEqual([{ type: 'flush-request', requestId }, { type: 'flush-cancel', requestId }]);
  });
  it('does not authorize a save when the panel is disposed or the flush fails', async () => {
    const h = harness(); const result = flushWebview(h.panel, h.token); h.dispose();
    expect(await result).toBeUndefined();
    const failed = harness(); const result2 = flushWebview(failed.panel, failed.token);
    failed.receive({ type: 'flush-result', requestId: failed.messages[0].requestId, ok: false });
    expect(await result2).toBeUndefined();
  });
});
