// Explicit opt-in, read-only live probe. The GitHub token and webview HTML stay in memory.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const vscode = require('vscode');

const escapeHtml = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

exports.run = async () => {
  const originalLoad = Module._load;
  try {
    assert.equal(process.env.WEAVER_LIVE_CONFIRM_READ, '1');
    const extensionPath = path.resolve(process.env.WEAVER_PACKAGED_EXTENSION_PATH).toLowerCase();
    const expectedTitle = escapeHtml(process.env.WEAVER_LIVE_PROJECT_TITLE);
    const expectedOptions = escapeHtml(process.env.WEAVER_LIVE_STATUS_OPTIONS);
    const expectedDiagnostic = process.env.WEAVER_LIVE_EXPECTED_DIAGNOSTIC ? escapeHtml(process.env.WEAVER_LIVE_EXPECTED_DIAGNOSTIC) : undefined;
    const token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', timeout: 15000, windowsHide: true }).trim();
    assert(token, 'GitHub authentication is unavailable');
    let panel;
    let intercepted = false;
    Module._load = function(request, parent, ...args) {
      const api = originalLoad.call(this, request, parent, ...args);
      if (request !== 'vscode' || !parent?.filename || !path.resolve(parent.filename).toLowerCase().startsWith(`${extensionPath}${path.sep}`)) return api;
      intercepted = true;
      return new Proxy(api, { get(target, key) {
        if (key === 'window') return new Proxy(target.window, { get(window, property) {
          return property === 'createWebviewPanel' ? (...params) => {
            const created = window.createWebviewPanel(...params);
            if (params[0] === 'weaver.overview') panel = created;
            return created;
          } : window[property];
        } });
        if (key === 'authentication') return new Proxy(target.authentication, { get(authentication, property) {
          return property === 'getSession' ? async (provider, scopes, options) => provider === 'github'
            ? { id: 'isolated-read-only-test', accessToken: token, account: { id: 'test', label: 'test' }, scopes }
            : authentication.getSession(provider, scopes, options) : authentication[property];
        } });
        return target[key];
      } });
    };
    const extension = vscode.extensions.getExtension('ebrain-lab.weaver');
    assert(extension, 'Packaged extension is unavailable');
    assert.equal(path.resolve(extension.extensionPath).toLowerCase(), extensionPath);
    await extension.activate();
    await vscode.commands.executeCommand('weaver.openOverview');
    let html = '';
    for (let attempt = 0; attempt < 40; attempt += 1) {
      html = panel?.webview.html || '';
      if (html.includes(expectedTitle) && html.includes('Project Status options:') && html.includes(expectedOptions) && html.includes('Status rules') && (!expectedDiagnostic || html.includes(expectedDiagnostic))) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert(intercepted && panel, 'Packaged Overview webview was not intercepted');
    assert(html.includes(expectedTitle), 'Expected Project title was not present');
    assert(html.includes('Project Status options:') && html.includes(expectedOptions), 'Expected Project Status options were not present');
    assert(html.includes('Status rules'), 'Status rules section was not present');
    if (expectedDiagnostic) assert(html.includes(expectedDiagnostic), 'Expected diagnostic was not present');
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'passed', vscode: vscode.version, case: 'packaged Overview HTML with live read-only GitHub data', diagnosticChecked: Boolean(expectedDiagnostic) }));
  } catch (error) {
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'failed', error: String(error.stack || error) }));
    throw error;
  } finally {
    Module._load = originalLoad;
  }
};
