import { promises as fs } from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { t, WATCH_FOCUS_SECONDS, WATCH_INTERVAL_SECONDS, WATCH_MINUTES } from '@ebrain-lab/weaver-markdown';

const say = (key: Parameters<typeof t>[0], locale: 'en' | 'ko') => t(key, locale, { repository: 'o/r', number: 7, checks: 'x' });
const ROOT = path.resolve(__dirname, '../../..');
const GUIDE = 'docs/onboarding/finish-in-vs-code.md';
const GUIDE_KO = 'docs/onboarding/finish-in-vs-code.ko.md';
const read = async (file: string) => (await fs.readFile(path.join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');

describe('the guide to finishing work on GitHub\'s page inside VS Code', () => {
  it('links to a file that exists, in both languages', async () => {
    for (const file of [GUIDE, GUIDE_KO]) {
      const text = await read(file);
      for (const match of text.matchAll(/\]\((?!https?:|#)([^)#\s]+)(#[^)]*)?\)/g)) {
        await expect(fs.access(path.resolve(ROOT, path.dirname(file), match[1])), `${file} links to ${match[1]}`).resolves.toBeUndefined();
      }
    }
  });

  it('has the same sections in both languages', async () => {
    const headings = (text: string) => text.split('\n').filter((line) => line.startsWith('## ')).length;
    expect(headings(await read(GUIDE_KO))).toBe(headings(await read(GUIDE)));
    expect(headings(await read(GUIDE))).toBe(8);
  });

  it('says the numbers that the watching really uses, so a change of them shows up here', async () => {
    // The guide says ten minutes, a minute, and ten seconds. If the constants change, so must the guide.
    expect(WATCH_MINUTES).toBe(10);
    expect(WATCH_INTERVAL_SECONDS).toBe(60);
    expect(WATCH_FOCUS_SECONDS).toBe(10);
    const english = await read(GUIDE);
    expect(english).toContain('ten minutes');
    expect(english).toContain('every minute');
    expect(english).toContain('every ten seconds');
    const korean = await read(GUIDE_KO);
    expect(korean).toContain('10분');
    expect(korean).toContain('1분');
    expect(korean).toContain('10초');
  });

  it('quotes the notices as the extension says them', async () => {
    // The static words of each notice, taken from the catalog, appear in the guide in that language.
    const english = await read(GUIDE);
    expect(say('ui.watch.merged', 'en')).toContain('was merged');
    expect(english).toContain('was merged.');
    expect(say('ui.watch.closed.pull', 'en')).toContain('was closed without a merge');
    expect(english).toContain('was closed without a merge.');
    expect(say('ui.watch.closed.issue', 'en')).toContain('was closed');
    expect(english).toContain('Issue #number in … was closed.');
    expect(say('ui.watch.checks', 'en')).toContain('Checks of pull request');
    const korean = await read(GUIDE_KO);
    expect(say('ui.watch.merged', 'ko')).toContain('병합됐습니다');
    expect(korean).toContain('병합됐습니다');
    expect(say('ui.watch.closed.pull', 'ko')).toContain('병합 없이 닫혔습니다');
    expect(korean).toContain('병합 없이 닫혔습니다');
    expect(korean).toContain('검사');
  });

  it('names the two VS Code settings and every value of them', async () => {
    for (const file of [GUIDE, GUIDE_KO]) {
      const text = await read(file);
      for (const word of ['workbench.browser.dataStorage', 'workbench.browser.newTabPlacement', 'activeGroup', 'sideGroup', 'window', 'ephemeral', 'global', 'workspace', 'agent']) {
        expect(text, `${file} names ${word}`).toContain(`\`${word}\``);
      }
    }
  });

  it('warns about the setting that lets an agent see what the person signs in with', async () => {
    expect(await read(GUIDE)).toContain('**Do not use.**');
    expect(await read(GUIDE_KO)).toContain('**쓰지 마세요.**');
  });

  it('shows a log line in the form the extension writes', async () => {
    for (const file of [GUIDE, GUIDE_KO]) {
      expect(await read(file), file).toMatch(/page [^\s|]+\|pull\|\d+: open\/passing -> merged\/-/);
    }
  });

  it('is linked from the second round and its table of documents, and links the decision', async () => {
    const round2 = await read('docs/onboarding/dogfooding-round-2.md');
    const round2Ko = await read('docs/onboarding/dogfooding-round-2.ko.md');
    expect(round2).toContain('finish-in-vs-code.md');
    expect(round2Ko).toContain('finish-in-vs-code.ko.md');
    for (const file of [GUIDE, GUIDE_KO]) expect(await read(file)).toContain('DEC-020');
  });
});
