const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  validateAlias,
  configureRepository,
  resolveRepository,
} = require('../src/config');

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-config-'));
}

test('configureRepository grava alias e primeiro default', () => {
  const rootDir = tempRoot();
  const repoPath = path.join(rootDir, 'tangerina-web-core');
  fs.mkdirSync(repoPath);

  configureRepository({rootDir, cwd: rootDir, alias: 'tangerina', repoPath});

  const config = JSON.parse(fs.readFileSync(path.join(rootDir, '.anemoi.local.json'), 'utf8'));
  assert.equal(config.defaultRepository, 'tangerina');
  assert.equal(config.repositories.tangerina.path, repoPath);
});

test('resolveRepository aceita alias, default e caminho direto', () => {
  const rootDir = tempRoot();
  const repoPath = path.join(rootDir, 'repo-a');
  const directPath = path.join(rootDir, 'repo-b');
  fs.mkdirSync(repoPath);
  fs.mkdirSync(directPath);
  configureRepository({rootDir, cwd: rootDir, alias: 'tangerina', repoPath});

  assert.equal(resolveRepository({rootDir, cwd: rootDir, repoArg: 'tangerina'}), repoPath);
  assert.equal(resolveRepository({rootDir, cwd: rootDir}), repoPath);
  assert.equal(resolveRepository({rootDir, cwd: rootDir, repoArg: directPath}), directPath);
});

test('alias desconhecido lista aliases configurados', () => {
  const rootDir = tempRoot();
  const repoPath = path.join(rootDir, 'repo');
  fs.mkdirSync(repoPath);
  configureRepository({rootDir, cwd: rootDir, alias: 'tangerina', repoPath});

  assert.throws(
    () => resolveRepository({rootDir, cwd: rootDir, repoArg: 'inexistente'}),
    /Alias desconhecido.*tangerina/s,
  );
});

test('validateAlias rejeita maiusculas e hifens consecutivos', () => {
  assert.throws(() => validateAlias('Tangerina'), /Alias invalido/);
  assert.throws(() => validateAlias('tangerina--main'), /Alias invalido/);
});
