const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const {collectChecks} = require('../src/doctor');
const {BUILD_SCRIPTS} = require('../src/tangerina');

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

test('collectChecks exige package.json#name e todos os scripts da cadeia Tangerina', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-doctor-'));
  const scripts = Object.fromEntries(BUILD_SCRIPTS.map(name => [name, 'true']));
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({name: 'tangerina-web-core', scripts}));

  const checks = collectChecks(repo);
  const repoCheck = checks.find(check => check.id === 'repo');
  assert.equal(repoCheck.ok, true);
  for (const script of BUILD_SCRIPTS) {
    const check = checks.find(item => item.id === `script-${script.replace(':', '-')}`);
    assert.equal(check.ok, true, `esperava check ok para ${script}`);
  }

  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({name: 'outro-repo', scripts: {}}));
  const invalidChecks = collectChecks(repo);
  assert.equal(invalidChecks.find(check => check.id === 'repo').ok, false);
  assert.equal(invalidChecks.find(check => check.id === 'script-build-tokens').ok, false);
});
