import { promises as fs } from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const read = async (file: string) => (await fs.readFile(path.join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');

describe('the README', () => {
  it('has no link that points to a file or folder that is not there', async () => {
    const text = await read('README.md');
    const links = [...text.matchAll(/\]\((?!https?:|#)([^)#\s]+)(#[^)]*)?\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(20);
    for (const link of links) await expect(fs.access(path.resolve(ROOT, link)), `README links to ${link}`).resolves.toBeUndefined();
  });

  it('sends each reader down their own list, with the install guide first for a person who uses Weaver', async () => {
    const text = await read('README.md');
    const start = /^## Start here\n([\s\S]*?)\n## /m.exec(text)?.[1] ?? '';
    for (const heading of ['**I want to use Weaver**', '**I run an agent on a Kanban**', '**I want to work on Weaver**']) {
      expect(start, `Start here has ${heading}`).toContain(heading);
    }
    const use = start.split('**I run an agent on a Kanban**')[0];
    expect(use.indexOf('getting-started.md')).toBeGreaterThan(-1);
    expect(use.indexOf('getting-started.md')).toBeLessThan(use.indexOf('register-your-project.md'));
    expect(use).toContain('/releases');
    expect(use).toContain('dogfooding-round-2.md');
    expect(start).toContain('agent-contract.md');
  });

  it('keeps one organization\'s procedure out of the first list, as an example (independence principle)', async () => {
    const text = await read('README.md');
    const start = /^## Start here\n([\s\S]*?)\n## /m.exec(text)?.[1] ?? '';
    const [use, rest] = [start.split('**I run an agent on a Kanban**')[0], start.split('**I want to work on Weaver**')[1] ?? ''];
    expect(use).not.toContain('palab-development-bootstrap');
    expect(rest).toContain('palab-development-bootstrap');
    expect(rest).toContain('as an example and not as a starting point');
  });

  it('says where the documents are, and every folder it names exists', async () => {
    const text = await read('README.md');
    const section = /^## Where to read the documents\n([\s\S]*?)\n## /m.exec(text)?.[1] ?? '';
    const folders = [...section.matchAll(/`((?:docs|examples)\/[^`]*)`/g)].map((m) => m[1]);
    expect(folders).toEqual(expect.arrayContaining(['docs/onboarding/', 'docs/requirements/', 'docs/decisions/', 'docs/tasks/', 'docs/product/', 'docs/architecture/', 'examples/']));
    for (const folder of folders) await expect(fs.access(path.join(ROOT, folder)), folder).resolves.toBeUndefined();
    expect(section).toContain('Files changed');
  });

  it('does not say that a license is missing, since there is one, and does not call the product a working name', async () => {
    const text = await read('README.md');
    await expect(fs.access(path.join(ROOT, 'LICENSE'))).resolves.toBeUndefined();
    expect(text).toContain('MIT License');
    expect(text).not.toContain('not finalized');
    expect(text).not.toContain('Working name');
    expect(text).not.toContain('design-stage');
  });

  it('names what is not done, with the requirements that hold it', async () => {
    const text = await read('README.md');
    const status = /^## Current status\n([\s\S]*?)\n## /m.exec(text)?.[1] ?? '';
    for (const req of ['REQ-016', 'REQ-017', 'REQ-013']) expect(status).toContain(req);
    expect(status).toContain('/releases');
  });
});
