'use strict';
// Doctor do Anemoi Service: config, checkout do DS, DS buildado (render), Koba vivo e porta.

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {readServiceConfig} = require('./config');
const {fetchKobaCatalog} = require('./kobaCatalog');
const {DS_SENTINELS} = require('./harnessPool');

function checkPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

async function collectServiceChecks(rootDir, {fetchCatalog = fetchKobaCatalog, portProbe = checkPortFree} = {}) {
  const checks = [];
  let config;
  try {
    config = readServiceConfig(rootDir);
    checks.push({
      id: 'config', label: 'secao service do .anemoi.local.json', ok: true,
      detail: `porta ${config.port} · Koba ${config.kobaBaseUrl} · DS ${config.dsRepo}`,
    });
  } catch (error) {
    checks.push({id: 'config', label: 'secao service do .anemoi.local.json', ok: false, detail: error.message});
    return checks;
  }

  checks.push({
    id: 'ds-repo', label: 'checkout do DS acessivel',
    ok: fs.existsSync(config.dsRepo), detail: config.dsRepo,
  });

  // O render usa o motor proprio (harnesses buildam sobre o dist/ do DS), entao
  // o DS precisa estar buildado. Sem isso o build do harness falha no 1o run.
  const missing = DS_SENTINELS.filter(rel => !fs.existsSync(path.join(config.dsRepo, rel)));
  checks.push({
    id: 'ds-build', label: 'DS buildado (dist/ p/ render)',
    ok: missing.length === 0,
    detail: missing.length === 0 ? 'tokens/fonts/components/react/angular presentes' : `faltando: ${missing.join(', ')} — rode o build do DS`,
  });

  try {
    const catalog = await fetchCatalog(config.kobaBaseUrl);
    checks.push({id: 'koba', label: 'Koba respondendo GET /catalog.json', ok: true, detail: `${catalog.length} componente(s)`});
  } catch (error) {
    checks.push({id: 'koba', label: 'Koba respondendo GET /catalog.json', ok: false, detail: error.message});
  }

  const free = await portProbe(config.port);
  checks.push({
    id: 'port', label: `porta ${config.port} livre`, ok: free,
    detail: free ? 'disponivel' : 'em uso — o servico ja esta rodando?',
  });
  return checks;
}

async function runServiceDoctor(rootDir, options = {}) {
  const checks = await collectServiceChecks(rootDir, options);
  for (const check of checks) {
    console.log(`${check.ok ? '✓' : '✗'} ${check.label} — ${check.detail}`);
  }
  return checks.every(check => check.ok);
}

module.exports = {collectServiceChecks, runServiceDoctor, checkPortFree};
