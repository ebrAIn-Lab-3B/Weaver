import { describe, expect, it, vi } from 'vitest';
import { whilePanelAlive } from '../../../apps/vscode-extension/src/panelLifecycle';

describe('requirement panel loading', () => {
  it('does not attach a result to a panel closed while it was loading', async () => {
    let close = () => {};
    let finish!: (value: string) => void;
    const disposeListener = vi.fn();
    const panel = { onDidDispose: (listener: () => void) => { close = listener; return { dispose: disposeListener }; } };
    const apply = vi.fn();
    const result = whilePanelAlive(panel, () => new Promise<string>((resolve) => { finish = resolve; }), apply);
    close();
    finish('loaded');
    await result;
    expect(apply).not.toHaveBeenCalled();
    expect(disposeListener).toHaveBeenCalledOnce();
  });

  it('attaches the result while open and removes the temporary listener', async () => {
    const disposeListener = vi.fn();
    const panel = { onDidDispose: () => ({ dispose: disposeListener }) };
    const apply = vi.fn();
    await whilePanelAlive(panel, async () => 'loaded', apply);
    expect(apply).toHaveBeenCalledWith('loaded');
    expect(disposeListener).toHaveBeenCalledOnce();
  });
});
