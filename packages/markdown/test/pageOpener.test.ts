import { describe, expect, it } from 'vitest';
import { BUILT_IN_BROWSER_PROBE, choosePageOpener, SIMPLE_BROWSER_COMMAND } from '../src';

describe('choosePageOpener', () => {
  it('uses the built-in browser when this VS Code has it and Simple Browser can show the page', () => {
    expect(choosePageOpener([BUILT_IN_BROWSER_PROBE, SIMPLE_BROWSER_COMMAND, 'other'])).toBe('built-in');
    expect(choosePageOpener(new Set([BUILT_IN_BROWSER_PROBE, SIMPLE_BROWSER_COMMAND]))).toBe('built-in');
  });

  it('uses the system browser when there is no built-in browser, so an old VS Code does not show a blank page', () => {
    expect(choosePageOpener([SIMPLE_BROWSER_COMMAND, 'other'])).toBe('system');
    expect(choosePageOpener(new Set([SIMPLE_BROWSER_COMMAND]))).toBe('system');
  });

  it('uses the system browser when Simple Browser is missing', () => {
    expect(choosePageOpener([BUILT_IN_BROWSER_PROBE])).toBe('system');
  });

  it('uses the system browser when nothing is known', () => {
    expect(choosePageOpener([])).toBe('system');
    expect(choosePageOpener(new Set())).toBe('system');
  });
});
