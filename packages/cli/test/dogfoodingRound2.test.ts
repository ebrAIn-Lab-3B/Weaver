import { promises as fs } from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const GUIDE = 'docs/onboarding/dogfooding-round-2.md';
const GUIDE_KO = 'docs/onboarding/dogfooding-round-2.ko.md';
const read = async (file: string) => (await fs.readFile(path.join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');

/** The tool commands a guide tells the reader to run: `weaver <command> [<subcommand>]`. */
function commandsOf(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/^weaver ([a-z]+)(?: (create|move|start|attach))?/gm)) found.add(match[2] ? `${match[1]} ${match[2]}` : match[1]);
  for (const match of text.matchAll(/`weaver ([a-z]+)(?: (create|move|start|attach))?/g)) found.add(match[2] ? `${match[1]} ${match[2]}` : match[1]);
  return [...found].sort();
}

describe('the guide to the second round of using Weaver', () => {
  it('links to a file that exists, in both languages', async () => {
    for (const file of [GUIDE, GUIDE_KO]) {
      const text = await read(file);
      for (const match of text.matchAll(/\]\((?!https?:|#)([^)#\s]+)(#[^)]*)?\)/g)) {
        await expect(fs.access(path.resolve(ROOT, path.dirname(file), match[1])), `${file} links to ${match[1]}`).resolves.toBeUndefined();
      }
    }
  });

  it('teaches the same commands in English and in Korean', async () => {
    const english = commandsOf(await read(GUIDE));
    const korean = commandsOf(await read(GUIDE_KO));
    expect(english.length).toBeGreaterThan(3);
    expect(korean).toEqual(english);
  });

  it('only teaches commands that the agent contract documents', async () => {
    const contract = await read('docs/onboarding/agent-contract.md');
    for (const command of commandsOf(await read(GUIDE))) {
      expect(contract, `the contract does not document "weaver ${command}"`).toContain(`weaver ${command}`);
    }
  });

  it('has the same steps in both languages', async () => {
    const steps = (text: string) => text.split('\n').filter((line) => /^## \d\./.test(line)).length;
    expect(steps(await read(GUIDE_KO))).toBe(steps(await read(GUIDE)));
    expect(steps(await read(GUIDE))).toBe(8);
  });

  it('links the feedback form of the first round, and is linked from it', async () => {
    for (const file of [GUIDE, GUIDE_KO]) expect(await read(file)).toContain('template=dogfooding-feedback.yml');
    expect(await read('docs/onboarding/dogfooding-round-1.md')).toContain('dogfooding-round-2.md');
  });

  it('names the extension by its new id and tells the reader to remove the old one', async () => {
    for (const file of [GUIDE, GUIDE_KO]) {
      const text = await read(file);
      expect(text).toContain('ebrain-lab.weaver');
      expect(text).toContain('palab.weaver');
    }
  });
});
