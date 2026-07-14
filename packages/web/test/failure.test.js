const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {writeFailureManifest} = require('../src/failure');

test('falha grava manifesto e nao publica index.html', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-failure-'));
  writeFailureManifest(runDir, {stage: 'build:react', card: 'CDCOM-1', component: 'tgr-button'}, new Error('boom'));
  const manifest = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'failed');
  assert.equal(manifest.stage, 'build:react');
  assert.equal(manifest.error, 'boom');
  assert.equal(fs.existsSync(path.join(runDir, manifest.logPath)), true);
  assert.equal(fs.existsSync(path.join(runDir, 'index.html')), false);
});

test('falha copia log externo para dentro do runDir', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-failure-'));
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-external-log-'));
  const externalLog = path.join(externalDir, 'build.log');
  fs.writeFileSync(externalLog, 'diagnostico externo\n');

  const manifest = writeFailureManifest(
    runDir,
    {stage: 'build:react', card: 'CDCOM-1', component: 'tgr-button'},
    Object.assign(new Error('boom'), {logPath: externalLog}),
  );

  assert.equal(manifest.logPath.startsWith('..'), false);
  assert.equal(path.isAbsolute(manifest.logPath), false);
  assert.equal(fs.readFileSync(path.join(runDir, manifest.logPath), 'utf8'), 'diagnostico externo\n');
});

test('falha preserva o manifesto quando logPath externo nao pode ser copiado', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-failure-'));
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-external-log-'));

  const manifest = writeFailureManifest(
    runDir,
    {stage: 'build:react', card: 'CDCOM-1', component: 'tgr-button'},
    Object.assign(new Error('boom'), {logPath: externalDir}),
  );

  assert.equal(manifest.logPath.startsWith('..'), false);
  assert.equal(path.isAbsolute(manifest.logPath), false);
  assert.match(fs.readFileSync(path.join(runDir, manifest.logPath), 'utf8'), /boom/);
});
