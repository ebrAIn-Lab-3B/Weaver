import { describe, expect, it, vi } from 'vitest';
import { submitDocumentEdit } from '../../../apps/vscode-extension/src/submitDocumentEdit';

describe('submitting a document edit', () => {
  it('refuses a stale or closed document without submitting', async () => {
    const apply = vi.fn(() => Promise.resolve(true));
    expect(await submitDocumentEdit({ version: 2 }, 1, apply)).toBe(false);
    expect(await submitDocumentEdit({ version: 1, isClosed: true }, 1, apply)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it('submits synchronously after the version check', async () => {
    const document = { version: 1 };
    let observed = 0;
    const result = submitDocumentEdit(document, 1, () => {
      observed = document.version;
      return Promise.resolve(true);
    });
    document.version = 2;
    expect(observed).toBe(1);
    expect(await result).toBe(true);
  });

  it('turns refused, rejected and synchronously thrown edits into failure', async () => {
    for (const apply of [() => Promise.resolve(false), () => Promise.reject(new Error('changed')), () => { throw new Error('closed'); }]) {
      expect(await submitDocumentEdit({ version: 1 }, 1, apply)).toBe(false);
    }
  });
});
