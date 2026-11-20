// Two independent Node processes exercise the compiled command and shared lock.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { fork } = require('node:child_process');

async function worker() {
  const root = process.env.WEAVER_TEST_ROOT;
  const name = process.env.WEAVER_TEST_WORKER;
  const uri = file => ({ fsPath: file, scheme: 'file', toString: () => file });
  let scans = 0;
  const fields = [name, 'Outcome', 'Criterion'];
  const vscode = {
    env: { language: 'en' },
    Uri: { file: uri, joinPath: (base, name) => uri(path.join(base.fsPath, name)) },
    workspace: {
      workspaceFolders: [{ uri: uri(root) }], textDocuments: [],
      getConfiguration: () => ({ get: () => 'en' }),
      findFiles: async () => {
        if (name === 'first' && ++scans === 2) {
          process.send({ event: 'locked' });
          await new Promise(resolve => process.once('message', resolve));
        }
        return (await fs.readdir(root)).filter(file => file.endsWith('.md')).map(file => uri(path.join(root, file)));
      },
      fs: { readFile: file => fs.readFile(file.fsPath) },
    },
    window: {
      showInputBox: async () => fields.shift(),
      showSaveDialog: async () => uri(path.join(root, `${name}.md`)),
      showInformationMessage: async (_message, _options, choice) => choice,
      showErrorMessage: async message => process.send({ event: 'error-message', message }),
    },
    commands: { executeCommand: async () => {} },
  };
  const Module = require('node:module');
  const original = Module._load;
  Module._load = function(request, parent, main) { return request === 'vscode' ? vscode : original.call(this, request, parent, main); };
  await require('../apps/vscode-extension/dist/authorDocument').createDocument('requirement');
  process.send({ event: 'done' });
  process.disconnect();
}

async function parent() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weaver-process-test-'));
  const workers = [];
  const launch = (name, workspace = root) => {
    const child = fork(__filename, [], { env: { ...process.env, WEAVER_TEST_ROOT: workspace, WEAVER_TEST_WORKER: name, TEMP: root, TMP: root, TMPDIR: root }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    workers.push(child);
    const events = [];
    child.on('message', message => events.push(message));
    return { child, events };
  };
  const until = async (item, event) => {
    const deadline = Date.now() + 15000;
    while (!item.events.some(message => message.event === event)) {
      if (item.child.exitCode !== null) throw new Error(`Worker exited before ${event}: ${item.child.exitCode}`);
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${event}`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  try {
    const first = launch('first');
    await until(first, 'locked');
    const second = launch('second');
    await until(second, 'done');
    assert.match(second.events.find(event => event.event === 'error-message').message, /Another Weaver requirement creation/);
    await assert.rejects(fs.stat(path.join(root, 'second.md')), { code: 'ENOENT' });
    first.child.send('continue');
    await until(first, 'done');
    assert.match(await fs.readFile(path.join(root, 'first.md'), 'utf8'), /id: REQ-001/);

    // Independent processes with different but overlapping workspaces in one checkout.
    const repository = path.join(root, 'repository');
    const nested = path.join(repository, 'nested');
    await fs.mkdir(path.join(repository, '.git'), { recursive: true });
    await fs.mkdir(nested);
    const parent = launch('first', repository);
    await until(parent, 'locked');
    const child = launch('second', nested);
    await until(child, 'done');
    assert.match(child.events.find(event => event.event === 'error-message').message, /Another Weaver requirement creation/);
    await assert.rejects(fs.stat(path.join(nested, 'second.md')), { code: 'ENOENT' });
    parent.child.send('continue');
    await until(parent, 'done');
    assert.match(await fs.readFile(path.join(repository, 'first.md'), 'utf8'), /id: REQ-001/);
    const retry = launch('second', nested);
    await until(retry, 'done');
    assert.equal(retry.events.some(event => event.event === 'error-message'), false);
    assert.match(await fs.readFile(path.join(nested, 'second.md'), 'utf8'), /id: REQ-002/);
    console.log('Independent creation processes: shared lock and nested-repository retry passed.');
  } finally {
    for (const child of workers) if (child.exitCode === null) child.kill();
    await fs.rm(root, { recursive: true, force: true });
  }
}
(process.env.WEAVER_TEST_WORKER ? worker() : parent()).catch(error => { console.error(error); process.exitCode = 1; if (process.connected) process.disconnect(); });
