import * as vscode from 'vscode';
import {
  configLayers,
  formatNotice,
  MessageKey,
  repositoryListIsOld,
  repositoryListTarget,
  setRepositories,
  snapshotAge,
  type ConfigLayer,
  type FoundConfigFiles,
  type RepositoryList,
} from '@ebrain-lab/weaver-markdown';
import { readProject } from '@ebrain-lab/weaver-github';
import { getGitHubToken } from './github';
import { currentLocale, message } from './locale';
import { readRegistry } from './overviewView';
import { readSavedRepositoryList, saveRepositoryList } from './repositoryStore';
import { readRootConfig } from './rootConfig';
import { readConfigFile, userConfigPath, writeConfigFile } from './userConfig';

/**
 * The configuration files that can apply here, nearest first: the workspace `fabric.yaml`, the nearest
 * root file, the personal file (DEC-018 item 4). A root file with errors still counts: it decides, and
 * its errors are told instead of quietly falling back to the personal file.
 */
export async function findConfigLayers(): Promise<ConfigLayer[]> {
  const found: FoundConfigFiles = {};
  const [workspace] = await vscode.workspace.findFiles('fabric.yaml', '**/{node_modules,.git}/**', 1);
  if (workspace) found.workspace = workspace.fsPath;
  const root = await readRootConfig();
  if (root.kind !== 'none') found.root = root.path;
  const personal = userConfigPath();
  if (await vscode.workspace.fs.stat(vscode.Uri.file(personal)).then(() => true, () => false)) found.personal = personal;
  return configLayers(found);
}

/** Opens one configuration file. */
export async function openFile(file: string): Promise<void> {
  await vscode.window.showTextDocument(vscode.Uri.file(file));
}

type ConfigurationItem = vscode.QuickPickItem & { run?: () => Promise<boolean> };

/**
 * The one entry for Weaver's configuration (TASK-110). Every change is made here: the repositories to show
 * (written to the file that applies), the contributors (the root or the personal roster), the clone folder,
 * and the setup. Below them, every configuration file that can apply, nearest first, marked as applying here
 * or not and why. Returns true when the repositories changed; the other actions refresh by themselves.
 */
export async function configure(): Promise<boolean> {
  const layers = await findConfigLayers();
  if (layers.length === 0) {
    const setUp = message('ui.sidebar.set-up');
    const choice = await vscode.window.showInformationMessage(message('ui.repos.no-config'), setUp);
    if (choice === setUp) await vscode.commands.executeCommand('weaver.setUp');
    return false;
  }
  const target = repositoryListTarget(layers);
  const items: ConfigurationItem[] = [];
  if (target) {
    items.push({
      label: `$(checklist) ${message('ui.sidebar.choose-repositories')}`,
      description: message(target.kind === 'write' ? 'ui.config.choose-writes' : 'ui.config.choose-opens', { file: target.layer.file }),
      run: () => chooseRepositories(),
    });
  }
  const command = (id: string) => async () => {
    await vscode.commands.executeCommand(id);
    return false;
  };
  items.push(
    { label: `$(organization) ${message('ui.sidebar.edit-roster')}`, description: message('ui.config.roster-detail'), run: command('weaver.editContributors') },
    { label: `$(folder) ${message('ui.sidebar.set-root')}`, run: command('weaver.setFabricRoot') },
    { label: `$(wand) ${message('ui.config.set-up-again')}`, description: message('ui.config.set-up-detail'), run: command('weaver.setUp') },
  );
  items.push({ label: message('ui.config.files'), kind: vscode.QuickPickItemKind.Separator });
  for (const layer of layers) {
    items.push({
      label: `$(${layer.applies ? 'pass-filled' : 'circle-large-outline'}) ${message(`ui.config.open.${layer.kind}` as MessageKey)}`,
      description: layer.applies
        ? message('ui.config.applies')
        : message('ui.config.overridden', { layer: message(`ui.config.name.${layer.overriddenBy}` as MessageKey) }),
      detail: layer.file,
      run: async () => {
        await openFile(layer.file);
        return false;
      },
    });
  }
  const picked = await vscode.window.showQuickPick(items, { placeHolder: message('ui.config.placeholder'), ignoreFocusOut: true });
  return picked?.run ? picked.run() : false;
}

/**
 * Reads the Project and saves the repositories it has cards of (DEC-018 item 12). With `interactive`, a person
 * who is not signed in is asked to sign in and a failure is told; in the background it stays silent.
 */
export async function refreshRepositoryList(project: { owner: string; number: number }, interactive: boolean): Promise<RepositoryList | undefined> {
  const token = await getGitHubToken(interactive, ['repo', 'project']);
  if (!token) {
    if (interactive) void vscode.window.showInformationMessage(message('ui.repos.sign-in'));
    return undefined;
  }
  const read = interactive
    ? await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: message('ui.repos.reading') }, () => readProject(token, project, undefined))
    : await readProject(token, project, undefined);
  if (!read.ok) {
    if (interactive) void vscode.window.showWarningMessage(message('ui.repos.read-failed', { detail: formatNotice(read.error, currentLocale()) }));
    return undefined;
  }
  return saveRepositoryList(project, read.read.cards.map((card) => card.repository));
}

/** The command that reads the repository list again at any time (DEC-018 item 12). */
export async function refreshRepositoryListCommand(): Promise<void> {
  const registry = await readRegistry();
  if (registry.kind !== 'ok') {
    void vscode.window.showInformationMessage(message('ui.repos.no-config'));
    return;
  }
  const list = await refreshRepositoryList(registry.registry.project, true);
  if (list) void vscode.window.showInformationMessage(message('ui.repos.list-refreshed', { count: list.repositories.length }));
}

/**
 * Lets a person choose which repositories of the Project the Overview shows. Only the `repositories`
 * list of the file that applies here changes: the nearest root file when there is one, otherwise the
 * personal file (DEC-018 item 4). The change is shown and confirmed first, and the old file is kept as
 * `config.yaml.bak` (DEC-014, DEC-018 item 10). A workspace `fabric.yaml` belongs to a repository, so it
 * is only opened.
 */
export async function chooseRepositories(): Promise<boolean> {
  const target = repositoryListTarget(await findConfigLayers());
  if (!target) {
    void vscode.window.showInformationMessage(message('ui.repos.no-config'));
    return false;
  }
  if (target.kind === 'open') {
    const open = message('ui.repos.open-fabric');
    const choice = await vscode.window.showInformationMessage(message('ui.repos.from-workspace'), open);
    if (choice === open) await openFile(target.layer.file);
    return false;
  }

  const user = await readConfigFile(target.layer.file);
  if (user.kind === 'none') {
    void vscode.window.showInformationMessage(message('ui.repos.no-config'));
    return false;
  }
  if (user.kind === 'invalid') {
    const open = message('ui.repos.open-config');
    const choice = await vscode.window.showWarningMessage(message('ui.repos.invalid-config', { path: user.path }), open);
    if (choice === open) await openFile(user.path);
    return false;
  }

  // The picker opens from the saved list at once; a list older than a day is read again in the background (DEC-018 item 12).
  const now = new Date();
  const saved = await readSavedRepositoryList(user.config.project);
  const counts = new Map<string, { name: string; cards: number }>();
  let savedNote = '';
  if (saved) {
    for (const row of saved.repositories) counts.set(row.name.toLowerCase(), { name: row.name, cards: row.cards });
    const age = snapshotAge(saved.readAt, now);
    savedNote = message('ui.repos.saved', { age: message(`ui.age.${age.unit}` as MessageKey, { count: age.count }) });
    if (repositoryListIsOld(saved.readAt, now)) void refreshRepositoryList(user.config.project, false);
  } else {
    const list = await refreshRepositoryList(user.config.project, true);
    if (!list) return false;
    for (const row of list.repositories) counts.set(row.name.toLowerCase(), { name: row.name, cards: row.cards });
  }
  // Every repository the Project has cards of, and any listed one that has none yet.
  const current = user.config.repositories?.map((r) => r.repository);
  for (const name of current ?? []) if (!counts.has(name.toLowerCase())) counts.set(name.toLowerCase(), { name, cards: 0 });
  const shown = new Set((current ?? [...counts.values()].map((c) => c.name)).map((name) => name.toLowerCase()));

  const rows = [...counts.values()].sort((a, b) => b.cards - a.cards || a.name.localeCompare(b.name));
  const picked = await vscode.window.showQuickPick(
    rows.map((row) => ({ label: row.name, description: message('ui.repos.cards', { count: row.cards }), picked: shown.has(row.name.toLowerCase()), name: row.name })),
    { canPickMany: true, placeHolder: `${message('ui.repos.placeholder')}${savedNote ? ` ${savedNote}` : ''}`, ignoreFocusOut: true },
  );
  if (!picked) return false;
  if (picked.length === 0) {
    void vscode.window.showWarningMessage(message('ui.repos.none-picked'));
    return false;
  }

  // Everything ticked means no list, so the Overview follows the Project (the same rule as the setup).
  const all = picked.length === rows.length;
  // The listed order stays; repositories that are new to the list follow.
  const kept = (current ?? []).filter((name) => picked.some((p) => p.name.toLowerCase() === name.toLowerCase()));
  const added = picked.map((p) => p.name).filter((name) => !kept.some((k) => k.toLowerCase() === name.toLowerCase()));
  const wanted = all ? undefined : [...kept, ...added];

  const same = wanted === undefined ? current === undefined : current !== undefined && wanted.length === current.length && wanted.every((name, index) => name.toLowerCase() === current[index].toLowerCase());
  if (same) {
    void vscode.window.showInformationMessage(message('ui.repos.unchanged'));
    return false;
  }

  const write = message('ui.repos.write');
  const answer = await vscode.window.showInformationMessage(
    wanted ? message('ui.repos.confirm', { count: wanted.length, path: user.path }) : message('ui.repos.confirm-all', { path: user.path }),
    { modal: true, detail: message('ui.repos.confirm-detail', { list: (wanted ?? rows.map((r) => r.name)).map((name) => `• ${name}`).join('\n') }) },
    write,
  );
  if (answer !== write) return false;

  const file = await writeConfigFile(user.path, setRepositories(user.text, wanted), user.text);
  void vscode.window.showInformationMessage(message('ui.repos.written', { path: file }));
  return true;
}
