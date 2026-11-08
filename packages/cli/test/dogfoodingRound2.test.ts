import { promises as fs } from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '@ebrain-lab/weaver-markdown';

const ROOT = path.resolve(__dirname, '../../..');
const GUIDE = 'docs/onboarding/dogfooding-round-2.md';
const GUIDE_KO = 'docs/onboarding/dogfooding-round-2.ko.md';
const read = async (file: string) => (await fs.readFile(path.join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');

/** The tool commands a guide tells the reader to run: `node weaver.js <command>` in a code block, or `weaver <command>` in the text. */
function commandsOf(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/(?:node weaver.js|weaver) ([a-z]+)(?: (create|move|start|attach|add))?/g)) {
    // "weaver" alone, as the name of the tool in a sentence, is followed by a word that is not a command.
    if (!['process', 'task', 'card', 'project', 'evidence', 'reconcile', 'list', 'show', 'init'].includes(match[1])) continue;
    found.add(match[2] ? `${match[1]} ${match[2]}` : match[1]);
  }
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
    expect(english).toEqual(['card move', 'process', 'process start', 'project add', 'reconcile', 'task create']);
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

  it('has a setup file in step 2 that Weaver reads, with the guideline and the repository', async () => {
    for (const file of [GUIDE, GUIDE_KO]) {
      const text = await read(file);
      const block = /```yaml\n([\s\S]*?)\n```/.exec(text)?.[1];
      expect(block, `${file} has a yaml example`).toBeDefined();
      const result = parseConfig('config.yaml', block as string);
      expect(result.issues, `${file}: the example has no problem`).toEqual([]);
      expect(result.config?.repositories?.map((r) => r.repository)).toEqual(['ebrAIn-Lab-3B/agentic-browser']);
      expect(result.config?.guideline).toMatchObject({ repository: 'ebrAIn-Lab-3B/agentic-base', path: '.weaver/process.yaml', ref: 'weaver-process-file' });
    }
  });
});
