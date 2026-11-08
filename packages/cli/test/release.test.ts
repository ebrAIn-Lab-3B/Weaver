import { promises as fs } from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const ROOT = path.resolve(__dirname, '../../..');
const read = async (file: string) => (await fs.readFile(path.join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');

async function extensionVersion(): Promise<string> {
  return (JSON.parse(await read('apps/vscode-extension/package.json')) as { version: string }).version;
}

describe('the release workflow (REQ-004, DEC-021)', () => {
  it('runs on a pushed tag, checks that the tag is the extension version, and runs the checks first', async () => {
    const text = await read('.github/workflows/release.yml');
    const workflow = parse(text) as { on: { push: { tags: string[] } }; jobs: { release: { steps: { name?: string; run?: string }[] } } };
    expect(workflow.on.push.tags).toEqual(['v*']);
    const steps = workflow.jobs.release.steps;
    const index = (needle: string) => steps.findIndex((s) => (s.run ?? '').includes(needle));
    expect(index('does not match extension version')).toBeGreaterThan(-1);
    expect(index('npm run check')).toBeLessThan(index('gh release create'));
    expect(index('npm test')).toBeLessThan(index('gh release create'));
  });

  it('makes an official release, and a pre-release only for a version with a suffix', async () => {
    const text = await read('.github/workflows/release.yml');
    // The word is not on the command itself: it is added by a condition on the version.
    expect(text).not.toMatch(/gh release create[^\n]*\\\n(?:[^\n]*\\\n)*[^\n]*--prerelease/);
    expect(text).toContain('if [[ "$version" == *-* ]]; then options+=(--prerelease); else options+=(--latest); fi');
  });

  it('uses the notes file of the version when there is one, and generates notes only when there is not', async () => {
    const text = await read('.github/workflows/release.yml');
    expect(text).toContain('notes="docs/releases/${version}.md"');
    expect(text).toContain('options+=(--notes-file "$notes")');
    expect(text).toContain('options+=(--generate-notes)');
  });

  it('attaches the extension file and the tool, and names the product by its name', async () => {
    const text = await read('.github/workflows/release.yml');
    expect(text).toContain('dist/weaver-*.vsix dist/weaver.js');
    expect(text).toContain('--title "ebrAIn.lab Weaver ${version}"');
  });
});

describe('the notes of the release', () => {
  it('exist for the version of the extension, so a tag cannot make a release without them', async () => {
    const version = await extensionVersion();
    await expect(fs.access(path.join(ROOT, `docs/releases/${version}.md`)), `docs/releases/${version}.md`).resolves.toBeUndefined();
  });

  it('say the version, are in English and Korean, and name what is not there yet', async () => {
    const version = await extensionVersion();
    const text = await read(`docs/releases/${version}.md`);
    expect(text).toContain(`## ebrAIn.lab Weaver ${version}`);
    expect(text).toContain(`## ebrAIn.lab Weaver ${version} (한국어)`);
    expect(text).toContain('### Not yet');
    expect(text).toContain('### 아직 없는 것');
    expect(text).not.toMatch(/PALab/);
    expect(text).not.toContain('palab.weaver');
  });

  it('link only to files that are in the repository, through the tag of the release (relative links do not work on a release page)', async () => {
    const version = await extensionVersion();
    const text = await read(`docs/releases/${version}.md`);
    expect(text).not.toMatch(/\]\((?!https?:)/);
    const base = `https://github.com/ebrAIn-Lab-3B/Weaver/blob/v${version}/`;
    const links = [...text.matchAll(/\]\((https:\/\/github\.com\/[^)\s]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(8);
    for (const link of links) {
      expect(link.startsWith(base), `${link} goes through the tag`).toBe(true);
      await expect(fs.access(path.join(ROOT, link.slice(base.length))), `${link} is in the repository`).resolves.toBeUndefined();
    }
  });

  it('name the extension file and the tool by the version', async () => {
    const version = await extensionVersion();
    const text = await read(`docs/releases/${version}.md`);
    expect(text).toContain(`weaver-${version}.vsix`);
    expect(text).toContain('weaver.js');
  });
});
