import { describe, expect, it } from 'vitest';
import { SerialMessageQueue } from '../../../apps/vscode-extension/src/serialMessageQueue';

describe('editor host message ordering', () => {
  it('waits for the first asynchronous edit before starting the next', async () => {
    const queue = new SerialMessageQueue();
    const events: string[] = [];
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const first = queue.run(async () => { events.push('first start'); await waiting; events.push('first end'); });
    const second = queue.run(() => { events.push('second'); });
    await Promise.resolve();
    expect(events).toEqual(['first start']);
    release(); await Promise.all([first, second]);
    expect(events).toEqual(['first start', 'first end', 'second']);
  });

  it('reports failures without preventing later messages', async () => {
    const queue = new SerialMessageQueue(); const events: string[] = [];
    const first = queue.run(() => { throw new Error('rejected'); });
    const second = queue.run(() => { events.push('second'); });
    await expect(first).rejects.toThrow('rejected'); await second;
    expect(events).toEqual(['second']);
  });

  it('does not start queued edits after panel disposal', async () => {
    const queue = new SerialMessageQueue(); let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const first = queue.run(() => waiting); let called = false;
    const second = queue.run(() => { called = true; });
    await Promise.resolve(); queue.dispose(); release(); await Promise.all([first, second]);
    expect(called).toBe(false);
  });
});
