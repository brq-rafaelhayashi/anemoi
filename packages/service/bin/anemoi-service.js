#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {readServiceConfig} = require('../src/config');
const {createRunStore} = require('../src/runStore');
const {createQueue} = require('../src/queue');
const {createService} = require('../src/server');
const {executeRun} = require('../src/runner');
const {createHarnessPool} = require('../src/harnessPool');
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
  // Pool de harnesses do motor proprio (build 1x + cache + serve). Injetado no
  // executeRun; o 1o run por framework paga o build, os seguintes reusam.
  const pool = createHarnessPool({onLog: message => console.log(`⬛ ${message}`)});
  const service = createService({config, store, queue, deps: {
    executeRun: (opts) => executeRun({...opts, pool}),
    fetchCatalog: fetchKobaCatalog,
  }});
  service.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE'
      ? `Erro: porta ${config.port} em uso — o servico ja esta rodando? Rode: npm run service -- --doctor.`
      : `Erro: ${error.message}`);
    process.exitCode = 1;
  });

  // Shutdown limpo: fecha os servers estaticos dos harnesses.
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    pool.closeAll().finally(() => {
      service.close(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  service.listen(config.port, '127.0.0.1', () => {
    console.log(`Anemoi Service ouvindo em http://127.0.0.1:${config.port}`);
    console.log(`Koba esperado em ${config.kobaBaseUrl} · render via motor proprio · bundles em ${config.dsRepo}/outputs/anemoi-web/`);
  });
}

main().catch((error) => {
  console.error(`Erro: ${error.message}`);
  process.exitCode = 1;
});
