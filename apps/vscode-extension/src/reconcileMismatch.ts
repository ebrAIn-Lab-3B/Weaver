import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { defaultLogPath, fileActionLog, readMarkdownFiles, run, type Deps } from '@ebrain-lab/weaver-cli';
import type { Mismatch } from '@ebrain-lab/weaver-markdown';
import { getGitHubSession } from './github';
import { currentLocale, message } from './locale';

const exec = promisify(execFile);
type Finding = Pick<Mismatch, 'kind' | 'subject' | 'path' | 'url'>;
type Action = { id: string; summary: string; reason: string; outcome: 'done' | 'failed' | 'declined' | 'unconfirmed' | 'skipped'; message?: string; finding?: Finding };
type Result = { error?: { message: string }; actions?: Action[]; report?: Array<Finding & { message: string }>; context?: { project?: { owner: string; number: number } }; recheck?: unknown; status?: string };

function sameFinding(a: Finding, b: Finding): boolean {
  return a.kind === b.kind && a.subject === b.subject && (a.path ?? '') === (b.path ?? '') && (a.url ?? '') === (b.url ?? '');
}

/** Runs the same planner and executors as the CLI, without invoking a shell or storing a token. */
export async function reconcileMismatch(finding: Mismatch, project: { owner: string; number: number }): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length !== 1 || folders[0].uri.scheme !== 'file') {
    void vscode.window.showWarningMessage(message('ui.reconcile.unavailable')); return;
  }
  const session = await getGitHubSession(true, ['repo', 'project']);
  if (!session) { void vscode.window.showWarningMessage(message('ui.overview.na.sign-in')); return; }
  const root = folders[0].uri.fsPath;
  const command = async (args: string[]): Promise<Result> => {
    let output = '';
    const readText = (file: string) => fs.readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return undefined; throw error; });
    const deps: Deps = {
      expectedProject: project, cwd: root, env: process.env, out: (s) => { output += s; }, err: () => {},
      token: async () => session.accessToken, login: async () => session.account.label,
      files: readMarkdownFiles, readText, now: () => new Date(), interactive: false,
      ask: async () => false, prompt: async () => '', log: fileActionLog(defaultLogPath(process.env)),
      system: {
        run: async (program, argv, options) => (await exec(program, argv, { cwd: options?.cwd, timeout: 120000, maxBuffer: 16 * 1024 * 1024, windowsHide: true, env: { ...process.env, GH_TOKEN: session.accessToken, GIT_TERMINAL_PROMPT: '0' } })).stdout,
        tempDir: async () => path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'weaver-')), 'work'),
        readText, writeFile: async (file, content) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, content, 'utf8'); },
      },
    };
    await run(['reconcile', '--root', root, '--lang', currentLocale(), ...args], deps);
    return JSON.parse(output) as Result;
  };
  const plan = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: message('ui.reconcile.running') }, () => command([]));
  if (plan.error) { void vscode.window.showErrorMessage(plan.error.message); return; }
  const selectedProject = plan.context?.project;
  if (!selectedProject || selectedProject.owner.toLowerCase() !== project.owner.toLowerCase() || selectedProject.number !== project.number) {
    void vscode.window.showWarningMessage(message('ui.reconcile.unavailable')); return;
  }
  const actions = (plan.actions ?? []).filter((action) => action.finding && sameFinding(action.finding, finding));
  if (!actions.length) {
    const reports = (plan.report ?? []).filter((report) => sameFinding(report, finding));
    void vscode.window.showInformationMessage(message('ui.reconcile.no-action', { detail: reports.map((r) => r.message).join(' ') || message('ui.reconcile.changed') }));
    return;
  }
  const choice = actions.length === 1 ? actions[0] : (await vscode.window.showQuickPick(actions.map((action) => ({ label: action.summary, detail: action.reason, action }))))?.action;
  if (!choice) return;
  const approve = message('ui.reconcile.apply');
  const confirmed = await vscode.window.showWarningMessage(message('ui.reconcile.confirm'), { modal: true, detail: `${choice.summary}\n\n${choice.reason}` }, approve);
  if (confirmed !== approve) return;
  const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: message('ui.reconcile.running') }, () => command(['--approve', choice.id]));
  const executed = result.actions?.find((action) => action.id === choice.id);
  const outcome = executed ? message(`cli.outcome.${executed.outcome}`) : message('ui.reconcile.changed');
  const content = [message('ui.reconcile.result'), '', choice.summary, outcome, executed?.message ?? '', '', message('cli.reconcile.recheck'), JSON.stringify(result.recheck ?? null, null, 2), '', ...(result.report ?? []).map((report) => report.message), result.error?.message ?? ''].join('\n');
  const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content });
  await vscode.window.showTextDocument(doc, { preview: true });
}
