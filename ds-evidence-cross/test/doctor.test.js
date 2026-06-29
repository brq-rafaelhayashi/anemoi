const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const {collectChecks} = require('../src/doctor');

// Usa um path que nao existe — testa apenas que os ids certos sao retornados
const FAKE_REPO = path.join(__dirname, 'nonexistent-repo-xyz');

test('collectChecks retorna checks com os ids esperados', () => {
  const checks = collectChecks(FAKE_REPO);
  const ids = checks.map(c => c.id);
  assert.ok(ids.includes('repo'), `esperava id "repo", encontrei: ${ids.join(',')}`);
  assert.ok(ids.includes('storybook'), `esperava id "storybook", encontrei: ${ids.join(',')}`);
  assert.ok(ids.includes('react-pkg'), `esperava id "react-pkg", encontrei: ${ids.join(',')}`);
  assert.ok(ids.includes('angular-pkg'), `esperava id "angular-pkg", encontrei: ${ids.join(',')}`);
  assert.ok(ids.includes('components'), `esperava id "components", encontrei: ${ids.join(',')}`);
});

test('collectChecks reporta ok=false para repo inexistente', () => {
  const checks = collectChecks(FAKE_REPO);
  const repo = checks.find(c => c.id === 'repo');
  assert.equal(repo.ok, false);
});

test('collectChecks reporta ok=true para tangerina-web-core real (se presente)', () => {
  const REAL_REPO = '/Users/user/Documents/projects/tangerina-ds/tangerina-web-core';
  const fs = require('node:fs');
  if (!fs.existsSync(REAL_REPO)) {
    // repo nao disponivel no ambiente de CI — pula
    return;
  }
  const checks = collectChecks(REAL_REPO);
  const repo = checks.find(c => c.id === 'repo');
  assert.equal(repo.ok, true, 'esperava repo ok=true para repo real');
});
