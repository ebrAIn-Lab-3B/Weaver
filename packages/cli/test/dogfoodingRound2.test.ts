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

  it('does not talk about an extension of an earlier name: nobody else has it (DEC-021)', async () => {
    for (const file of [GUIDE, GUIDE_KO]) expect(await read(file)).not.toContain('palab.weaver');
  });

  it('marks what is specific to agentic-base, in both languages', async () => {
    const english = await read(GUIDE);
    const korean = await read(GUIDE_KO);
    const count = (text: string, mark: string) => text.split(mark).length - 1;
    expect(count(english, '(agentic-base specific)')).toBeGreaterThan(5);
    expect(count(korean, '(agentic-base 특화)')).toBe(count(english, '(agentic-base specific)'));
    // Every line that tells the reader to edit fix_plan.md carries the mark, or sits under a heading that does.
    for (const [text, mark] of [[english, '(agentic-base specific)'], [korean, '(agentic-base 특화)']] as const) {
      let flagged = false;
      for (const lineText of text.split('\n')) {
        if (lineText.startsWith('## ')) flagged = lineText.includes(mark);
        if (lineText.includes('fix_plan.md') && !lineText.startsWith('#')) {
          expect(flagged || lineText.includes(mark), `a line about fix_plan.md without the mark: ${lineText.slice(0, 80)}`).toBe(true);
        }
      }
    }
  });

  it('marks the steps that one person does for the team, and says where to jump if it is done', async () => {
    const english = await read(GUIDE);
    const korean = await read(GUIDE_KO);
    for (const [text, marker, jumps] of [
      [english, '**One person does this.**', ['Skip to step 5', 'Skip to step 6', 'Skip to step 7']],
      [korean, '**한 사람만 합니다.**', ['5번으로 건너뜁니다', '6번으로 건너뜁니다', '7번으로 건너뛰고']],
    ] as const) {
      expect(text.split(marker).length - 1, `${marker} appears at steps 4, 5, and 6`).toBe(3);
      for (const jump of jumps) expect(text, `says "${jump}"`).toContain(jump);
    }
  });

  it('explains how to run the terminal tool, and that is how it was run', async () => {
    for (const file of [GUIDE, GUIDE_KO]) {
      const text = await read(file);
      expect(text).toContain('node weaver.js --help');
      expect(text).toContain('--root');
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
      expect(result.config?.guideline).toMatchObject({ repository: 'ebrAIn-Lab-3B/agentic-base', path: '.weaver/process.yaml' });
      expect(result.config?.guideline?.ref).toBeUndefined();
    }
  });

  it('has a table of where the documents are, and every path of this repository in it exists', async () => {
    for (const file of [GUIDE, GUIDE_KO]) {
      const text = await read(file);
      const section = /^## (?:Where to read the documents|문서는 어디서 보나)\n([\s\S]*?)\n## /m.exec(text)?.[1];
      expect(section, `${file} has the section`).toBeDefined();
      // The paths of this repository: those under docs/. The rows about other repositories name files that are not here.
      const rows = (section as string).split('\n').filter((line) => line.startsWith('|') && !line.includes('agentic-browser') && !line.includes('agentic-base'));
      const paths = rows.flatMap((row) => [...row.matchAll(/`(docs\/[^`]+)`/g)].map((m) => m[1]));
      expect(paths.length, `${file} names some paths`).toBeGreaterThan(4);
      for (const found of paths) {
        await expect(fs.access(path.join(ROOT, found)), `${file} names ${found}`).resolves.toBeUndefined();
      }
    }
  });

  it('reads the guideline from main, and tells a reader of the earlier version to drop the old branch', async () => {
    for (const file of [GUIDE, GUIDE_KO]) {
      const text = await read(file);
      // The setup file of step 2 has no ref: the branch of agentic-base PR #2 is gone (TASK-111).
      const setup = text.match(/```yaml\n([\s\S]*?)```/)?.[1] ?? '';
      expect(setup).toContain('repository: ebrAIn-Lab-3B/agentic-base');
      expect(setup).not.toContain('ref:');
      expect(text).not.toContain('pull/2');
      expect(text).toContain('development-flow.md');
      // Only as a line to remove, never as one to add.
      expect(text).not.toContain('process.yaml@weaver-process-file');
    }
  });
});
