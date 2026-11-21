const assert = require('node:assert/strict');
const Module = require('node:module');
const original = Module._load;
let calls = [];
let sessions = {};
Module._load = function (request, parent, main) {
  if (request === 'vscode') return { authentication: { getSession: async (_provider, scopes, options) => {
    calls.push({ scopes, options });
    return sessions[scopes.join(',')];
  } } };
  return original.call(this, request, parent, main);
};
const { getStatusToken, getGitHubToken, getGitHubSession } = require('../apps/vscode-extension/dist/github');
(async () => {
  sessions = { 'repo,project': { accessToken: 'project-session' } };
  assert.equal(await getStatusToken(false), 'project-session');
  assert.deepEqual(calls, [{ scopes: ['repo', 'project'], options: { silent: true } }]);
  calls = [];
  assert.equal(await getGitHubToken(true, ['repo']), 'project-session');
  assert.equal((await getGitHubSession(false)).accessToken, 'project-session');
  assert.equal(calls.length, 2);
  calls = [];
  sessions = { repo: { accessToken: 'repo-session' } };
  assert.equal(await getStatusToken(false), 'repo-session');
  assert.deepEqual(calls[1], { scopes: ['repo'], options: { silent: true } });
  calls = [];
  sessions = {};
  assert.equal(await getStatusToken(true), undefined);
  assert.deepEqual(calls[1], { scopes: ['repo'], options: { createIfNone: true } });
  console.log('Status authentication tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
