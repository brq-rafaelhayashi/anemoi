'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {collectServiceChecks} = require('../src/doctor');

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-doctor-'));
  const dsRepo = path.join(root, 'ds');
  fs.mkdirSync(dsRepo);
  fs.writeFileSync(path.join(root, '.anemoi.local.json'), JSON.stringify({
    repositories: {ds: {path: dsRepo}},
    defaultRepository: 'ds',
  }));
  return root;
}

test('todos os checks ok quando config, DS, Koba e porta estao saudaveis', async () => {
  const checks = await collectServiceChecks(makeRoot(), {
    fetchCatalog: async () => [{key: 'tgr-button'}],
    portProbe: async () => true,
  });
  assert.deepEqual(checks.map(check => [check.id, check.ok]), [
    ['config', true], ['ds-repo', true], ['koba', true], ['port', true],
  ]);
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
