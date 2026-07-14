const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {runLogged} = require('../src/process');

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
