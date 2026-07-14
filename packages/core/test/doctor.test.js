const {test} = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {collectChecks} = require('../src/doctor');

function makeWebRepo({withGit, withNodeModules, withStorybook} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webrepo-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({scripts: withStorybook ? {'build:storybook': 'x'} : {}}),
  );
  if (withGit) fs.mkdirSync(path.join(dir, '.git'));
  if (withNodeModules) fs.mkdirSync(path.join(dir, 'node_modules'));
  if (withStorybook) fs.mkdirSync(path.join(dir, '.storybook'));
  return dir;
}

test('collectChecks: repo completo passa nos checks principais', () => {
  const dir = makeWebRepo({withGit: true, withNodeModules: true, withStorybook: true});
  const checks = collectChecks(dir, {beforeAfter: false});
  const byId = Object.fromEntries(checks.map(c => [c.id, c]));
  assert.equal(byId['node_modules'].ok, true);
  assert.equal(byId['storybook'].ok, true);
});

test('collectChecks: node_modules ausente reporta falha', () => {
  const dir = makeWebRepo({withNodeModules: false, withStorybook: true});
  const checks = collectChecks(dir, {beforeAfter: false});
  const nm = checks.find(c => c.id === 'node_modules');
  assert.equal(nm.ok, false);
});

test('collectChecks: .git so e exigido no modo before/after', () => {
  const dir = makeWebRepo({withGit: false, withNodeModules: true, withStorybook: true});
  const current = collectChecks(dir, {beforeAfter: false});
  assert.equal(current.find(c => c.id === 'git').ok, true); // dispensavel => ok

  const ba = collectChecks(dir, {beforeAfter: true});
  assert.equal(ba.find(c => c.id === 'git').ok, false); // exigido => falha
});
