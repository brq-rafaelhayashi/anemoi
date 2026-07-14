'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {readServiceConfig} = require('../src/config');

function makeRoot(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-config-'));
  const dsRepo = path.join(root, 'ds');
  fs.mkdirSync(dsRepo);
  fs.writeFileSync(path.join(root, '.anemoi.local.json'), JSON.stringify({
    repositories: {ds: {path: dsRepo}},
    defaultRepository: 'ds',
    ...config,
  }));
  return {root, dsRepo};
}

test('usa defaults quando a secao service esta ausente', () => {
  const {root, dsRepo} = makeRoot({});
  const config = readServiceConfig(root);
  assert.equal(config.port, 9200);
  assert.equal(config.kobaBaseUrl, 'http://localhost:9000');
  assert.equal(config.dsRepo, dsRepo);
});

test('aceita overrides e normaliza kobaBaseUrl para origin', () => {
  const {root} = makeRoot({service: {port: 9300, kobaBaseUrl: 'http://localhost:9000/algum/path'}});
  const config = readServiceConfig(root);
  assert.equal(config.port, 9300);
  assert.equal(config.kobaBaseUrl, 'http://localhost:9000');
});

test('rejeita porta invalida', () => {
  const {root} = makeRoot({service: {port: 'abc'}});
  assert.throws(() => readServiceConfig(root), /porta/i);
});

test('rejeita kobaBaseUrl invalida', () => {
  const {root} = makeRoot({service: {kobaBaseUrl: 'nao-e-url'}});
  assert.throws(() => readServiceConfig(root), /kobaBaseUrl/);
});
