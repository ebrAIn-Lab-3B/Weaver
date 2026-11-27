const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');

exports.run = async () => {
  try {
    const extension = vscode.extensions.getExtension('ebrain-lab.weaver');
    assert(extension, 'Packaged extension is not available');
    assert.equal(path.resolve(extension.extensionPath).toLowerCase(), path.resolve(process.env.WEAVER_PACKAGED_EXTENSION_PATH).toLowerCase());
    await extension.activate();
    await vscode.commands.executeCommand('weaver.openOverview');
    assert(vscode.window.tabGroups.all.some((group) => group.tabs.some((tab) => tab.input instanceof vscode.TabInputWebview)), 'Overview webview did not open');
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'passed', vscode: vscode.version, case: 'packaged extension activation and overview opening' }));
  } catch (error) {
    await fs.writeFile(process.env.WEAVER_AUTHOR_RESULT, JSON.stringify({ status: 'failed', error: String(error.stack || error) }));
    throw error;
  }
};
