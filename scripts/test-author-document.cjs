// Exercise the compiled creation command against real local files with a simulated VS Code UI.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weaver-author-test-'));
  const previousTemp = { TMP: process.env.TMP, TEMP: process.env.TEMP, TMPDIR: process.env.TMPDIR };
  Object.assign(process.env, { TMP: root, TEMP: root, TMPDIR: root });
  const uri = file => ({ fsPath: file, scheme: 'file', toString: () => file });
  const workspace = { uri: uri(root) };
  let selectedWorkspace = workspace;
  let inputs, target, confirm, errors, opened, scanHook = async () => {};
  let scanRoot = root;
  const vscode = {
    env: { language: 'en' },
    Uri: { file: uri, joinPath: (base, name) => uri(path.join(base.fsPath, name)) },
    workspace: {
      workspaceFolders: [workspace], textDocuments: [],
      getConfiguration: () => ({ get: () => 'en' }),
      findFiles: async () => { await scanHook(); return (await fs.readdir(scanRoot)).filter(f => f.endsWith('.md')).map(f => uri(path.join(scanRoot, f))); },
      fs: { readFile: async file => fs.readFile(file.fsPath) },
    },
    window: {
      showWorkspaceFolderPick: async () => selectedWorkspace,
      showInputBox: async () => inputs.shift(),
      showSaveDialog: async () => target && uri(path.join(root, target)),
      showInformationMessage: async (_text, options, choice) => confirm(options, choice),
      showErrorMessage: async text => { errors.push(text); },
    },
    commands: { executeCommand: async (...args) => { opened.push(args); } },
  };
  const originalLoad = Module._load;
  // Fail if the command attempts network access; VS Code APIs below are still simulated.
  const net = require('node:net');
  const http = require('node:http');
  const https = require('node:https');
  const dns = require('node:dns');
  const originalNetwork = { connect: net.connect, createConnection: net.createConnection, http: http.request, httpGet: http.get, https: https.request, httpsGet: https.get, lookup: dns.lookup, fetch: global.fetch };
  const denyNetwork = () => { throw new Error('Network access is disabled in this test'); };
  net.connect = net.createConnection = http.request = http.get = https.request = https.get = dns.lookup = global.fetch = denyNetwork;
  Module._load = function(request, parent, isMain) {
    if (request === 'vscode') return vscode;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { createDocument } = require('../apps/vscode-extension/dist/authorDocument');
    const draft = require('../packages/markdown/dist').requirementDraft;
    const reset = (destination, review = async (_options, choice) => choice) => {
      inputs = ['A title', 'An outcome', 'A criterion'];
      target = destination; confirm = review; errors = []; opened = [];
    };

    reset('created.md');
    await createDocument('requirement');
    const content = await fs.readFile(path.join(root, 'created.md'), 'utf8');
    assert.match(content, /id: REQ-001/);
    assert.equal(opened.length, 1);
    assert.deepEqual(errors, []);

    reset('cancelled.md', async () => undefined);
    await createDocument('requirement');
    await assert.rejects(fs.stat(path.join(root, 'cancelled.md')), { code: 'ENOENT' });
    assert.equal(await fs.readFile(path.join(root, '.weaver', 'requirement-ids.txt'), 'utf8'), 'REQ-001\n');

    reset('created.md');
    await createDocument('requirement');
    assert.equal(await fs.readFile(path.join(root, 'created.md'), 'utf8'), content);
    assert.equal(errors.length, 1);
    assert.equal(await fs.readFile(path.join(root, '.weaver', 'requirement-ids.txt'), 'utf8'), 'REQ-001\nREQ-002\n');

    reset('stale.md', async (_options, choice) => {
      await fs.writeFile(path.join(root, 'concurrent.md'), draft('REQ-004', 'Other', 'Outcome', 'Criterion'));
      return choice;
    });
    await createDocument('requirement');
    await assert.rejects(fs.stat(path.join(root, 'stale.md')), { code: 'ENOENT' });
    assert.match(errors[0], /IDs changed/);

    reset('idea.md', async (options, choice) => {
      assert.ok(options.detail.replace(/\n/g, '').includes(path.join(root, 'idea.md')));
      assert.match(options.detail, /# A title/);
      return choice;
    });
    await createDocument('ideation');
    assert.equal(await fs.readFile(path.join(root, 'idea.md'), 'utf8'), '# A title\n\n');

    let scans = 0, release, entered;
    const paused = new Promise(resolve => { entered = resolve; });
    const resume = new Promise(resolve => { release = resolve; });
    scanHook = async () => { if (++scans === 2) { entered(); await resume; } };
    reset('first-concurrent.md');
    const first = createDocument('requirement');
    await paused; // The first command holds the lock while rechecking IDs.
    reset('second-concurrent.md');
    await createDocument('requirement');
    assert.match(errors[0], /Another Weaver requirement creation/);
    await assert.rejects(fs.stat(path.join(root, 'second-concurrent.md')), { code: 'ENOENT' });
    release();
    await first;
    assert.match(await fs.readFile(path.join(root, 'first-concurrent.md'), 'utf8'), /id: REQ-005/);

    // The same checkout is opened once at its root and once in a nested folder.
    scanHook = async () => {};
    const repository = path.join(root, 'repository');
    const nested = path.join(repository, 'nested');
    await fs.mkdir(path.join(repository, '.git'), { recursive: true });
    await fs.mkdir(nested);
    workspace.uri = uri(repository); scanRoot = repository;
    reset('repository/parent.md');
    await createDocument('requirement');
    assert.match(await fs.readFile(path.join(repository, 'parent.md'), 'utf8'), /id: REQ-001/);
    workspace.uri = uri(nested); scanRoot = nested;
    reset('repository/nested/child.md');
    await createDocument('requirement');
    assert.match(await fs.readFile(path.join(nested, 'child.md'), 'utf8'), /id: REQ-002/);
    assert.deepEqual(errors, []);
    reset('repository/nested/stale.md', async (_options, choice) => {
      await fs.writeFile(path.join(repository, 'other.md'), draft('REQ-003', 'Other', 'Outcome', 'Criterion'));
      return choice;
    });
    await createDocument('requirement');
    await assert.rejects(fs.stat(path.join(nested, 'stale.md')), { code: 'ENOENT' });
    assert.match(errors[0], /IDs changed/);
    await fs.unlink(path.join(nested, 'child.md'));
    await fs.unlink(path.join(repository, 'other.md'));
    const history = path.join(repository, '.weaver', 'requirement-ids.txt');
    await fs.writeFile(history, (await fs.readFile(history, 'utf8')).replace(/\n/g, '\r\n'));
    reset('repository/nested/after-delete.md');
    await createDocument('requirement');
    assert.match(await fs.readFile(path.join(nested, 'after-delete.md'), 'utf8'), /id: REQ-003/);
    await fs.appendFile(history, 'REQ-00');
    reset('repository/nested/bad-history.md');
    await createDocument('requirement');
    await assert.rejects(fs.stat(path.join(nested, 'bad-history.md')), { code: 'ENOENT' });
    assert.match(errors[0], /allocation history is incomplete or invalid/);
    await fs.writeFile(history, '');
    reset('repository/nested/empty-history.md');
    await createDocument('requirement');
    await assert.rejects(fs.stat(path.join(nested, 'empty-history.md')), { code: 'ENOENT' });
    assert.match(errors[0], /allocation history is incomplete or invalid/);
    await fs.writeFile(history, 'REQ-001\nREQ-002\nREQ-003\n');
    const secondRepository = path.join(root, 'second-repository');
    await fs.mkdir(path.join(secondRepository, '.git'), { recursive: true });
    selectedWorkspace = { uri: uri(secondRepository) };
    vscode.workspace.workspaceFolders.push(selectedWorkspace);
    scanRoot = secondRepository;
    reset('second-repository/other.md');
    await createDocument('requirement');
    assert.match(await fs.readFile(path.join(secondRepository, 'other.md'), 'utf8'), /id: REQ-001/);
    reset('second-repository/stale-history.md', async (_options, choice) => {
      await fs.appendFile(history, 'REQ-005\n');
      return choice;
    });
    await createDocument('requirement');
    assert.match(await fs.readFile(path.join(secondRepository, 'stale-history.md'), 'utf8'), /id: REQ-002/);
    assert.deepEqual(errors, []);
    const largeRepository = path.join(root, 'large-repository');
    await fs.mkdir(path.join(largeRepository, '.git'), { recursive: true });
    await fs.writeFile(path.join(largeRepository, 'existing.md'), draft('REQ-9007199254740993', 'Large', 'Outcome', 'Criterion'));
    workspace.uri = uri(largeRepository);
    vscode.workspace.workspaceFolders.splice(0, vscode.workspace.workspaceFolders.length, workspace);
    scanRoot = largeRepository;
    reset('large-repository/next.md');
    await createDocument('requirement');
    assert.match(await fs.readFile(path.join(largeRepository, 'next.md'), 'utf8'), /id: REQ-9007199254740994/);
    reset('large-repository/after-large.md');
    await createDocument('requirement');
    assert.match(await fs.readFile(path.join(largeRepository, 'after-large.md'), 'utf8'), /id: REQ-9007199254740995/);
    console.log('Author command integration: creation, cancellation, collisions, stale ID, ideation, concurrent creators, and nested repository workspaces passed.');
  } finally {
    Module._load = originalLoad;
    net.connect = originalNetwork.connect; net.createConnection = originalNetwork.createConnection;
    http.request = originalNetwork.http; http.get = originalNetwork.httpGet;
    https.request = originalNetwork.https; https.get = originalNetwork.httpsGet;
    dns.lookup = originalNetwork.lookup; global.fetch = originalNetwork.fetch;
    for (const [key, value] of Object.entries(previousTemp)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
