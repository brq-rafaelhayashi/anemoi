const {test} = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  assertNoOrphanStash,
  pushStash,
  popStash,
  ensureWorkingTreeDiff,
} = require('../src/git');

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitrepo-'));
  const run = (cmd, args) =>
    childProcess.spawnSync(cmd, args, {cwd: dir, encoding: 'utf8'});
  run('git', ['init']);
  run('git', ['config', 'user.email', 'test@test.com']);
  run('git', ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'v1\n');
  run('git', ['add', '.']);
  run('git', ['commit', '-m', 'init']);
  return {dir, run};
}

test('ensureWorkingTreeDiff: lanca se nao ha mudanca', () => {
  const {dir} = makeRepo();
  assert.throws(() => ensureWorkingTreeDiff(dir), /nenhuma mudanca/i);
});

test('push/pop stash: alterna HEAD vs working tree', () => {
  const {dir} = makeRepo();
  // working tree (after) = v2
  fs.writeFileSync(path.join(dir, 'a.txt'), 'v2\n');
  assert.doesNotThrow(() => ensureWorkingTreeDiff(dir));

  const stash = pushStash(dir, 'CDCOM-1', 'badge');
  // stash message usa o prefixo do motor renomeado (anemoi:)
  assert.equal(stash.message, 'anemoi:CDCOM-1:badge');
  // apos stash, conteudo volta ao HEAD (before) = v1
  assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'v1\n');

  popStash(stash);
  // apos pop, volta o after = v2
  assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'v2\n');
});

test('assertNoOrphanStash: detecta stash residual do motor', () => {
  const {dir} = makeRepo();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'v2\n');
  pushStash(dir, 'CDCOM-1', 'badge'); // deixa um stash sem pop
  assert.throws(() => assertNoOrphanStash(dir), /stash/i);
});
