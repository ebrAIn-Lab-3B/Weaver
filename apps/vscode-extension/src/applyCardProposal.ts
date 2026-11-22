import * as vscode from 'vscode';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { applyConfirmedProposal, rootConfigCandidates, type ExecutionAttestation, type NextAssigneePlan, type ProposalAction } from '@ebrain-lab/weaver-markdown';
import { readAssignmentSnapshot, readFreshEffectiveRoster, readFreshLocalRoster, readFreshTaskHolder, writeProposalAction } from '@ebrain-lab/weaver-github';
import { workspaceStartFolder } from './rootConfig';
import { userConfigPath } from './userConfig';
import { getGitHubToken } from './github';
import { message } from './locale';

/** Apply only when the existing task owner already matches; do not silently modify the file. */
export async function applyCardProposal(input: {
  issueUrl: string; taskId: string; taskUri: vscode.Uri; project: { owner: string; number: number };
  displayed: NextAssigneePlan; auditFolder: string;
}): Promise<void> {
  const start = workspaceStartFolder();
  if (!start || input.taskUri.scheme !== 'file' || input.displayed.status !== 'proposal') {
    void vscode.window.showWarningMessage(message('ui.assignment-apply-unavailable')); return;
  }
  const token = await getGitHubToken(true, ['repo', 'project']);
  if (!token) return;
  const readHolder = async () => {
    const dirty = () => vscode.workspace.textDocuments.some((doc) => doc.uri.toString() === input.taskUri.toString() && doc.isDirty);
    if (dirty()) return undefined;
    const holder = await readFreshTaskHolder({ path: input.taskUri.fsPath, taskId: input.taskId, issueUrl: input.issueUrl });
    return dirty() ? undefined : holder;
  };
  const readFresh = () => readAssignmentSnapshot(token, input.project, input.issueUrl, {
    readRoster: async (reference) => {
      const personal = userConfigPath();
      const normalize = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
      const paths = new Set([personal, ...rootConfigCandidates(start, personal)].map(normalize));
      const dirty = () => vscode.workspace.textDocuments.some((doc) => doc.uri.scheme === 'file' && doc.isDirty && paths.has(normalize(doc.uri.fsPath)));
      if (dirty()) return undefined;
      const local = await readFreshLocalRoster(start, personal);
      if (!local || dirty()) return undefined;
      const roster = await readFreshEffectiveRoster(token, reference ?? local.reference, async () => local);
      return dirty() ? undefined : roster;
    },
    readHolder,
    // The router does not provide proof that a worker has stopped; request a human check.
    readExecution: async () => 'unknown',
  });
  const shown = await readFresh();
  if (!shown || shown.plan.status !== 'proposal' || shown.plan.candidate !== input.displayed.candidate ||
      shown.plan.column !== input.displayed.column || shown.plan.holder !== input.displayed.holder || shown.plan.decider !== input.displayed.decider || shown.plan.role !== input.displayed.role || shown.plan.taskField !== input.displayed.taskField || shown.plan.taskParticipant !== input.displayed.taskParticipant || shown.plan.kind !== input.displayed.kind ||
      shown.plan.label !== input.displayed.label || shown.plan.issueAssignee !== input.displayed.issueAssignee) {
    void vscode.window.showWarningMessage(message('ui.assignment-apply-changed')); return;
  }
  if (!shown.plan.taskField || !shown.plan.taskParticipant || shown.plan.taskParticipant.toLowerCase() !== shown.plan.candidate.toLowerCase()) {
    void vscode.window.showWarningMessage(message('ui.assignment-apply-owner-first')); return;
  }
  let check: ExecutionAttestation | undefined;
  const logPath = path.join(input.auditFolder, 'assignment-actions.jsonl');
  const id = randomUUID();
  const log = async (event: unknown) => {
    await fs.mkdir(input.auditFolder, { recursive: true });
    await fs.appendFile(logPath, `${JSON.stringify(event)}\n`, 'utf8');
  };
  const result = await applyConfirmedProposal(shown, {
    readFresh,
    confirmExecution: async (issueUrl) => {
      const actor = (await vscode.window.showInputBox({ prompt: message('ui.assignment-check-actor'), ignoreFocusOut: true }))?.trim();
      if (!actor) return undefined;
      const source = (await vscode.window.showInputBox({ prompt: message('ui.assignment-check-source'), ignoreFocusOut: true }))?.trim();
      if (!source) return undefined;
      const label = message('ui.assignment-check-confirm');
      const detail = message('ui.assignment-check-detail', { issue: issueUrl, labels: shown.labels.join(', ') || '—', source });
      const selected = await vscode.window.showWarningMessage(message('ui.assignment-check-title'), { modal: true, detail }, label);
      if (selected !== label) return undefined;
      check = { issueUrl, actor, source, checkedAt: new Date().toISOString() };
      return check;
    },
    confirm: async (action: ProposalAction) => {
      const label = message('ui.assignment-write-confirm');
      const detail = action.type === 'issue-label'
        ? message('ui.assignment-write-label', { issue: action.issueUrl, label: action.label })
        : message('ui.assignment-write-assignees', { issue: action.issueUrl, from: action.from.join(', ') || '—', to: action.to.join(', ') });
      const fields = Object.entries(shown.conditionFields ?? {}).map(([key, value]) => `${key}: ${value}`).join('\n') || '—';
      const participant = message(shown.plan.taskField === 'reviewer' ? 'ui.assignment-field-reviewer' : 'ui.assignment-field-assignee');
      const fullDetail = `${detail}\n\n${message('ui.assignment-write-participant', { field: participant, person: shown.plan.taskParticipant ?? '' })}\n${message('ui.assignment-write-fields', { fields })}`;
      return (await vscode.window.showWarningMessage(message('ui.assignment-write-title'), { modal: true, detail: fullDetail }, label)) === label;
    },
    write: async (action) => {
      // The audit entry is written before the external change. A failed response has an unknown outcome.
      await log({ id, event: 'attempt', at: new Date().toISOString(), action, executionAttestation: check, actor: 'Weaver on behalf of user' });
      try { await writeProposalAction(token, action); }
      catch (error) { await log({ id, event: 'outcome-unknown', at: new Date().toISOString() }).catch(() => undefined); throw error; }
      await log({ id, event: 'completed', at: new Date().toISOString() });
    },
  });
  if (result.status === 'applied') {
    void vscode.window.showInformationMessage(message('ui.assignment-apply-done', { path: logPath }));
  } else if (result.status === 'failed' && result.phase === 'write') {
    void vscode.window.showWarningMessage(message('ui.assignment-apply-write-unknown', { path: logPath }));
  } else if (result.status !== 'cancelled') {
    void vscode.window.showWarningMessage(message('ui.assignment-apply-stopped'));
  }
}
