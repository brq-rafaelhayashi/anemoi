const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/supportMatrix.ts')).href);
}

function repoWith(value) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-support-'));
  const dir = path.join(repo, 'packages', 'components');
  fs.mkdirSync(dir, {recursive: true});
  if (value !== undefined) {
    fs.writeFileSync(path.join(dir, 'browser-support.json'), JSON.stringify(value));
  }
  return repo;
}

test('loadSupportMatrix aceita a matriz versionada do Tangerina', async t => {
  const repo = repoWith({schemaVersion: 1, required: ['chromium', 'firefox', 'webkit'], optional: []});
  t.after(() => fs.rmSync(repo, {recursive: true, force: true}));
  const {loadSupportMatrix} = await subject();
  assert.deepEqual(loadSupportMatrix(repo), {
    schemaVersion: 1,
    required: ['chromium', 'firefox', 'webkit'],
    optional: [],
  });
});

test('loadSupportMatrix falha fechado quando o contrato esta ausente', async t => {
  const repo = repoWith(undefined);
  t.after(() => fs.rmSync(repo, {recursive: true, force: true}));
  const {loadSupportMatrix} = await subject();
  assert.throws(() => loadSupportMatrix(repo), /browser-support\.json ausente/);
});

test('loadSupportMatrix rejeita schema, engine e duplicata desconhecidos', async t => {
  const {loadSupportMatrix} = await subject();
  for (const value of [
    {schemaVersion: 2, required: ['chromium'], optional: []},
    {schemaVersion: 1, required: ['chrome'], optional: []},
    {schemaVersion: 1, required: ['chromium'], optional: ['chromium']},
  ]) {
    const repo = repoWith(value);
    t.after(() => fs.rmSync(repo, {recursive: true, force: true}));
    assert.throws(() => loadSupportMatrix(repo), /Matriz de Suporte invalida/);
  }
});
