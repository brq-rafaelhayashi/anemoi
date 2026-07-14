#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {readServiceConfig} = require('../src/config');
const {createRunStore} = require('../src/runStore');
const {createQueue} = require('../src/queue');
const {createService} = require('../src/server');
const {executeRun} = require('../src/runner');
const {fetchKobaCatalog} = require('../src/kobaCatalog');
const {runServiceDoctor} = require('../src/doctor');

const rootDir = path.join(__dirname, '..', '..', '..');

async function main() {
  if (process.argv.includes('--doctor')) {
    const healthy = await runServiceDoctor(rootDir);
    process.exitCode = healthy ? 0 : 1;
    return;
  }

  const config = readServiceConfig(rootDir);
  const store = createRunStore();
  const queue = createQueue();
  const service = createService({config, store, queue, deps: {executeRun, fetchCatalog: fetchKobaCatalog}});
  service.listen(config.port, '127.0.0.1', () => {
    console.log(`Anemoi Service ouvindo em http://127.0.0.1:${config.port}`);
    console.log(`Koba esperado em ${config.kobaBaseUrl} · bundles em ${config.dsRepo}/outputs/anemoi-web/`);
  });
}

main().catch((error) => {
  console.error(`Erro: ${error.message}`);
  process.exitCode = 1;
});
