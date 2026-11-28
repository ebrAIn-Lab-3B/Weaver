import { promises as fs } from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { EXIT, run } from '../src';
import { setup } from './helpers';

const root = path.resolve(__dirname, '../../..');

describe('registration guidance discovery and dry-run workflow', () => {
  it('finds the agent entry point and runs the documented read and planning commands without a write', async () => {
    const agents = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
    const match = /\]\((docs\/onboarding\/agent-contract\.md)#register-verify-and-recover-a-task\)/.exec(agents);
    expect(match).not.toBeNull();
    const guide = await fs.readFile(path.join(root, match![1]), 'utf8');
    expect(guide).toContain('## Register, verify, and recover a task');
    expect(guide).toContain('`weaver process --repository <owner/name>`');
    expect(guide).toContain('`weaver reconcile`');
    expect(guide).toContain('`--resume-issue <issue-url>`');
    expect(guide).toContain('pending');
    expect(guide).toContain('incomplete');
    const s = setup();
    expect(await run(['process', '--repository', 'me/Weaver'], s.deps)).toBe(EXIT.ok);
    s.out.length = 0;
    expect(await run(['task', 'create', '--title', 'Add the export button', '--requirement', 'REQ-001', '--criteria', 'AC-001'], s.deps)).toBe(EXIT.unconfirmed);
    const plan = JSON.parse(s.out.join(''));
    expect(plan.actions.map((action: { kind: string }) => action.kind)).toEqual(['issue.create', 'project.add', 'files.pull-request']);
    expect(plan.actions.every((action: { outcome: string }) => action.outcome === 'unconfirmed')).toBe(true);
    s.out.length = 0;
    expect(await run(['reconcile'], s.deps)).toBe(EXIT.ok);
    expect(JSON.parse(s.out.join('')).context.project).toEqual({ owner: 'me', number: 1 });
    expect(s.writes.filter((entry) => /mutation|^RESERVE|^REST .*\/issues$/.test(entry))).toEqual([]);
  });
});
