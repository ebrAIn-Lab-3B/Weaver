import { describe, expect, it } from 'vitest';
import { BUILT_IN_BROWSER_PROBE, choosePageOpener, SIMPLE_BROWSER_COMMAND } from '../src';

describe('choosePageOpener', () => {
  it('uses the built-in browser when this VS Code has it', () => {
    expect(choosePageOpener([BUILT_IN_BROWSER_PROBE, 'other'])).toBe('built-in');
    expect(choosePageOpener(new Set([BUILT_IN_BROWSER_PROBE]))).toBe('built-in');
  });

  it('does not wait for Simple Browser to be listed: it starts when its command is first run, so it is missing from the list until then', () => {
    // The first link of a session was sent to the system browser because this was asked for (seen on VS Code 1.145.2).
    expect(choosePageOpener([BUILT_IN_BROWSER_PROBE])).toBe('built-in');
    expect(choosePageOpener([BUILT_IN_BROWSER_PROBE, 'something.else'])).toBe('built-in');
  });

  it('is the same whether or not Simple Browser has already started', () => {
    expect(choosePageOpener([BUILT_IN_BROWSER_PROBE, SIMPLE_BROWSER_COMMAND])).toBe('built-in');
    expect(choosePageOpener([BUILT_IN_BROWSER_PROBE])).toBe(choosePageOpener([BUILT_IN_BROWSER_PROBE, SIMPLE_BROWSER_COMMAND]));
  });

  it('uses the system browser when there is no built-in browser, so an old VS Code does not show a blank page', () => {
    expect(choosePageOpener([SIMPLE_BROWSER_COMMAND, 'other'])).toBe('system');
    expect(choosePageOpener(new Set([SIMPLE_BROWSER_COMMAND]))).toBe('system');
  });

  it('uses the system browser when nothing is known', () => {
    expect(choosePageOpener([])).toBe('system');
    expect(choosePageOpener(new Set())).toBe('system');
  });
});
