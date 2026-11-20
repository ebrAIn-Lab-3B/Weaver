// Run creation integration against an isolated local VS Code extension host.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
if (process.platform !== 'win32') throw new Error('This runner currently supports Windows only.');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'weaver-author-host-'));
const nestedRepository = process.argv[2] === 'nested-repository';
const multiRepository = ['multi-repository', 'multi-repository-root'].includes(process.argv[2]);
const repository = path.join(temp, 'repository');
const workspace = nestedRepository ? path.join(repository, 'nested') : path.join(temp, 'workspace');
fs.mkdirSync(workspace, { recursive: true });
if (nestedRepository) {
  fs.mkdirSync(path.join(repository, '.git'));
  fs.writeFileSync(path.join(repository, 'parent.md'), '---\nid: REQ-001\ntype: requirement\ntitle: Parent\nstatus: draft\n---\n');
}
let workspaceArg = workspace;
if (multiRepository) {
  const first = path.join(temp, 'first');
  const second = path.join(temp, 'second');
  fs.mkdirSync(path.join(first, '.git'), { recursive: true });
  fs.mkdirSync(path.join(first, '.weaver'));
  fs.writeFileSync(path.join(first, '.weaver', 'requirement-ids.txt'), 'REQ-007\n');
  fs.mkdirSync(path.join(first, 'examples'));
  fs.writeFileSync(path.join(first, 'examples', 'sample.md'), '---\nid: REQ-999\ntype: requirement\ntitle: Sample\nstatus: draft\n---\n');
  fs.mkdirSync(path.join(first, '.claude', 'worktrees', 'copy'), { recursive: true });
  fs.writeFileSync(path.join(first, '.claude', 'worktrees', 'copy', 'copied.md'), '---\nid: REQ-998\ntype: requirement\ntitle: Copy\nstatus: draft\n---\n');
  fs.mkdirSync(path.join(first, 'nested'));
  fs.mkdirSync(path.join(second, '.git'), { recursive: true });
  workspaceArg = path.join(temp, 'multi.code-workspace');
  const firstFolder = process.argv[2] === 'multi-repository-root' ? first : path.join(first, 'nested');
  fs.writeFileSync(workspaceArg, JSON.stringify({ folders: [{ path: firstFolder }, { path: second }] }));
}
const result = path.join(temp, 'result.json');
const testFile = process.argv[2] === 'save-conflict' ? 'saveConflictHost.cjs' : nestedRepository ? 'nestedRepositoryHost.cjs' : multiRepository ? 'multiRepositoryHost.cjs' : 'authorDocumentHost.cjs';
const output = fs.openSync(path.join(temp, 'stdout.log'), 'w');
const errors = fs.openSync(path.join(temp, 'stderr.log'), 'w');
const executable = process.env.WEAVER_VSCODE_EXECUTABLE || path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe');
const env = { ...process.env, WEAVER_AUTHOR_RESULT: result, TMP: temp, TEMP: temp };
delete env.ELECTRON_RUN_AS_NODE;
for (const name of Object.keys(env)) if (name.startsWith('VSCODE_')) delete env[name];
const child = spawn(executable, [workspaceArg, '--user-data-dir', path.join(temp, 'profile'), '--extensions-dir', path.join(temp, 'extensions'),
  '--disable-extensions', '--skip-welcome', '--skip-release-notes', '--extensionDevelopmentPath', path.join(root, 'apps/vscode-extension'),
  '--extensionTestsPath', path.join(root, 'apps/vscode-extension/test', testFile)],
{ env, windowsHide: true, stdio: ['ignore', output, errors] });
const timeout = setTimeout(() => { child.kill(); console.error(`VS Code test timed out; logs: ${temp}`); process.exitCode = 1; }, 50000);
child.on('error', error => { clearTimeout(timeout); console.error(error); process.exitCode = 1; });
child.on('exit', code => {
  clearTimeout(timeout);
  if (code !== 0 || !fs.existsSync(result)) { console.error(`VS Code test did not pass (exit ${code}); logs: ${temp}`); process.exitCode = 1; return; }
  const outcome = JSON.parse(fs.readFileSync(result, 'utf8'));
  console.log(JSON.stringify(outcome));
  if (outcome.status !== 'passed') process.exitCode = 1;
});
