// Run the application-boundary test in a separate local VS Code instance.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (process.platform !== 'win32') throw new Error('This runner currently supports Windows only.');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'weaver-vscode-race-'));
const workspace = path.join(temp, 'workspace');
fs.mkdirSync(workspace);
const result = path.join(temp, 'result.json');
const output = fs.openSync(path.join(temp, 'stdout.log'), 'w');
const errors = fs.openSync(path.join(temp, 'stderr.log'), 'w');
const executable = process.env.WEAVER_VSCODE_EXECUTABLE || path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe');
const env = { ...process.env, WEAVER_RACE_RESULT: result };
delete env.ELECTRON_RUN_AS_NODE;
for (const name of Object.keys(env)) if (name.startsWith('VSCODE_')) delete env[name];
const child = spawn(executable, [workspace, '--user-data-dir', path.join(temp, 'profile'), '--extensions-dir', path.join(temp, 'extensions'),
  '--disable-extensions', '--skip-welcome', '--skip-release-notes', '--extensionDevelopmentPath', path.join(root, 'apps/vscode-extension'),
  '--extensionTestsPath', path.join(root, 'apps/vscode-extension/test/documentEditRace.cjs')],
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
