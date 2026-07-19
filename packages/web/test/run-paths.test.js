const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {createRunDir} = require('../src/run-legacy');

test('createRunDir fica contido em outputs/anemoi-web', () => {
  const repo = '/tmp/tangerina';
  const runDir = createRunDir(repo, 'CDCOM-1', 'tgr-button', {
    now: new Date('2026-07-14T12:34:56.789Z'),
    nonce: 'abcdef12',
  });
  assert.equal(
    runDir,
    path.join(repo, 'outputs', 'anemoi-web', 'CDCOM-1', 'tgr-button', '2026-07-14T12-34-56-789Z-abcdef12'),
  );
});

test('createRunDir rejeita card e componente com traversal', () => {
  assert.throws(() => createRunDir('/tmp/repo', '../../outside', 'tgr-button'), /card/);
  assert.throws(() => createRunDir('/tmp/repo', 'CDCOM-1', '../outside'), /component/);
});

test('createRunDir diferencia execucoes no mesmo milissegundo', () => {
  const now = new Date('2026-07-14T12:34:56.789Z');
  const first = createRunDir('/tmp/repo', 'CDCOM-1', 'tgr-button', {now, nonce: 'aaaaaaaa'});
  const second = createRunDir('/tmp/repo', 'CDCOM-1', 'tgr-button', {now, nonce: 'bbbbbbbb'});
  assert.notEqual(first, second);
});
