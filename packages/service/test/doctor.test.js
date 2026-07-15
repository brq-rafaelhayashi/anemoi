'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {collectServiceChecks} = require('../src/doctor');
const {DS_SENTINELS} = require('../src/harnessPool');

// Cria os artefatos-sentinela do DS (dist/) que o check ds-build exige.
function seedDsBuild(dsRepo) {
  for (const rel of DS_SENTINELS) {
    const file = path.join(dsRepo, rel);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, '');
  }
}

function makeRoot({buildDs = true} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-doctor-'));
  const dsRepo = path.join(root, 'ds');
  fs.mkdirSync(dsRepo);
  if (buildDs) seedDsBuild(dsRepo);
  fs.writeFileSync(path.join(root, '.anemoi.local.json'), JSON.stringify({
    repositories: {ds: {path: dsRepo}},
    defaultRepository: 'ds',
  }));
  return root;
}

test('todos os checks ok quando config, DS buildado, Koba e porta estao saudaveis', async () => {
  const checks = await collectServiceChecks(makeRoot(), {
    fetchCatalog: async () => [{key: 'tgr-button'}],
    portProbe: async () => true,
  });
  assert.deepEqual(checks.map(check => [check.id, check.ok]), [
    ['config', true], ['ds-repo', true], ['ds-build', true], ['koba', true], ['port', true],
  ]);
});

test('DS sem build reprova o check ds-build', async () => {
  const checks = await collectServiceChecks(makeRoot({buildDs: false}), {
    fetchCatalog: async () => [{key: 'tgr-button'}],
    portProbe: async () => true,
  });
  const dsBuild = checks.find(check => check.id === 'ds-build');
  assert.equal(dsBuild.ok, false);
  assert.match(dsBuild.detail, /faltando/);
});

test('koba fora do ar reprova o check do catalogo', async () => {
  const checks = await collectServiceChecks(makeRoot(), {
    fetchCatalog: async () => { throw new Error('ECONNREFUSED'); },
    portProbe: async () => true,
  });
  const koba = checks.find(check => check.id === 'koba');
  assert.equal(koba.ok, false);
  assert.match(koba.detail, /ECONNREFUSED/);
});

test('config invalida encerra os checks no primeiro item', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-doctor-'));
  fs.writeFileSync(path.join(root, '.anemoi.local.json'), JSON.stringify({repositories: {}}));
  const checks = await collectServiceChecks(root, {
    fetchCatalog: async () => [],
    portProbe: async () => true,
  });
  assert.equal(checks.length, 1);
  assert.equal(checks[0].id, 'config');
  assert.equal(checks[0].ok, false);
});
