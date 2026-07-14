const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {runLogged} = require('../src/process');
const {prepareCapture} = require('../src/run');

test('runLogged persiste stdout e stderr', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-process-'));
  const logPath = path.join(dir, 'build.log');
  const spawnSync = () => ({status: 0, stdout: 'ok\n', stderr: 'warn\n'});
  runLogged('pnpm', ['build:components'], {cwd: dir, logPath, spawnSync});
  assert.match(fs.readFileSync(logPath, 'utf8'), /ok[\s\S]*warn/);
});

test('runLogged inclui comando e log no erro', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-process-'));
  const logPath = path.join(dir, 'failed.log');
  const spawnSync = () => ({status: 2, stdout: '', stderr: 'boom\n'});
  assert.throws(
    () => runLogged('pnpm', ['build:react'], {cwd: dir, logPath, spawnSync}),
    error => error.message.includes('pnpm build:react') && error.logPath === logPath,
  );
});

test('runLogged preserva o erro de spawn e o log no diagnóstico', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-process-'));
  const logPath = path.join(dir, 'spawn.log');
  const spawnError = new Error('spawn ENOENT');
  const spawnSync = () => ({status: null, error: spawnError, stdout: '', stderr: ''});

  assert.throws(
    () => runLogged('pnpm', ['build:react'], {cwd: dir, logPath, spawnSync}),
    error => {
      assert.match(error.message, /pnpm build:react/);
      assert.match(error.message, /spawn ENOENT/);
      assert.equal(error.logPath, logPath);
      assert.equal(error.cause, spawnError);
      assert.match(fs.readFileSync(logPath, 'utf8'), /pnpm build:react/);
      return true;
    },
  );
});

test('runLogged diagnostica um processo encerrado por sinal', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-process-'));
  const logPath = path.join(dir, 'signal.log');
  const spawnSync = () => ({status: null, signal: 'SIGTERM', stdout: '', stderr: ''});

  assert.throws(
    () => runLogged('pnpm', ['build:components'], {cwd: dir, logPath, spawnSync}),
    error => {
      assert.match(error.message, /pnpm build:components/);
      assert.match(error.message, /SIGTERM/);
      assert.equal(error.logPath, logPath);
      assert.match(fs.readFileSync(logPath, 'utf8'), /pnpm build:components/);
      return true;
    },
  );
});

test('prepareCapture valida o Doctor mesmo com --skip-build antes de liberar Storybook ou captura', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-preflight-'));
  const events = [];

  assert.throws(
    () => prepareCapture(repo, {
      skipBuild: true,
      logDir: path.join(repo, 'logs'),
      runBuilds: (_repo, options) => {
        events.push({step: 'builds', options});
      },
      assertReady: () => {
        events.push({step: 'doctor'});
        throw new Error('artefato ausente');
      },
    }),
    /artefato ausente/,
  );
  assert.deepEqual(events, [
    {step: 'builds', options: {skipBuild: true, logDir: path.join(repo, 'logs')}},
    {step: 'doctor'},
  ]);
});
