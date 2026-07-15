'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const {executeRun} = require('../src/runner');
const {createRunStore} = require('../src/runStore');
const {compareStateToCells} = require('../src/stateAdapter');

// Servidor estatico fake: serve `html` para qualquer path (simula o harness servido pelo pool).
function serveEvidence(html) {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise(done => server.close(done)),
    }));
  });
}

// Host fake compativel com captureCells: recorta #evidence-root do server fake.
function fakeHost(framework) {
  return {
    framework,
    urlFor: (_cell, baseUrl) => `${baseUrl}/index.html`,
    selectorFor: () => '#evidence-root',
    verify: async (page) => { await page.waitForSelector('#evidence-root > *', {timeout: 5000}); },
  };
}

// Fixture: caixa colorida dentro de #evidence-root. Cor por framework permite (des)igualdade.
const evidenceHtml = (color) =>
  `<!doctype html><html><head><meta charset="utf-8"></head>`
  + `<body style="margin:0"><div id="evidence-root">`
  + `<div style="width:120px;height:48px;background:${color}"></div></div></body></html>`;

// Pool fake: acquire(fw) devolve host fake + url do server fake daquele framework.
function fakePool(servers) {
  return {
    async acquire(framework) { return {host: fakeHost(framework), url: servers[framework].url}; },
    async closeAll() {},
  };
}

function setup(state) {
  const dsRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-runner-'));
  const store = createRunStore();
  const run = store.create({component: state.componentKey, card: 'koba'});
  const cells = compareStateToCells(state, {viewports: ['sm']});
  return {dsRepo, store, run, cells};
}

test('run passed: harnesses identicos geram bundle com paridade zero', async () => {
  const state = {componentKey: 'tgr-fake', props: {label: 'Ola'}, slots: {}};
  const {dsRepo, store, run, cells} = setup(state);
  const react = await serveEvidence(evidenceHtml('#f60'));
  const angular = await serveEvidence(evidenceHtml('#f60'));

  await executeRun({run, store, cells, state, config: {dsRepo}, pool: fakePool({react, angular})});
  await react.close();
  await angular.close();

  const done = store.get(run.runId);
  assert.equal(done.status, 'passed');
  assert.deepEqual(done.summary, {cells: 2, mismatches: 0, maxMismatchPx: 0});
  assert.ok(done.runDir.includes(path.join('outputs', 'anemoi-web', 'koba', 'tgr-fake')));

  const manifest = JSON.parse(fs.readFileSync(path.join(done.runDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'passed');
  assert.equal(manifest.mode, 'koba-state');
  assert.equal(manifest.parityLabel, 'Paridade vs react');
  assert.deepEqual(manifest.compareState, state);
  assert.equal(manifest.cellCount, 2);
  assert.ok(fs.existsSync(path.join(done.runDir, 'index.html')));
  assert.ok(fs.existsSync(path.join(done.runDir, 'summary.md')));
});

test('run failed: harnesses divergentes acusam mismatch', async () => {
  const state = {componentKey: 'tgr-fake', props: {label: 'Ola'}, slots: {}};
  const {dsRepo, store, run, cells} = setup(state);
  const react = await serveEvidence(evidenceHtml('#f60'));
  const angular = await serveEvidence(evidenceHtml('#06f')); // cor diferente → mismatch

  await executeRun({run, store, cells, state, config: {dsRepo}, pool: fakePool({react, angular})});
  await react.close();
  await angular.close();

  const done = store.get(run.runId);
  assert.equal(done.status, 'failed');
  assert.ok(done.summary.maxMismatchPx > 0);
  const manifest = JSON.parse(fs.readFileSync(path.join(done.runDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'failed');
});

test('run ja terminal: executeRun nunca rejeita mesmo com transicao inicial invalida', async () => {
  const state = {componentKey: 'tgr-fake', props: {}, slots: {}};
  const {dsRepo, store, run, cells} = setup(state);

  // Leva o run a um estado terminal antes de reexecutar, simulando uma
  // reexecucao indevida (ou corrida) sobre um run que ja terminou.
  store.transition(run.runId, 'running', {stage: 'run-dir'});
  store.transition(run.runId, 'passed', {summary: {cells: 0, mismatches: 0, maxMismatchPx: 0}});
  assert.equal(store.get(run.runId).status, 'passed');

  // O pool nunca deve ser tocado: a transicao inicial ja falha antes da captura.
  const pool = {async acquire() { throw new Error('nao deveria buildar'); }, async closeAll() {}};
  await assert.doesNotReject(executeRun({run, store, cells, state, config: {dsRepo}, pool}));

  assert.equal(store.get(run.runId).status, 'passed');
});

test('run error: falha ao preparar o harness termina em error com failure manifest', async () => {
  const state = {componentKey: 'tgr-fake', props: {}, slots: {}};
  const {dsRepo, store, run, cells} = setup(state);

  // Simula DS nao buildado: pool.acquire lanca (como o assertReady do doctor faria).
  const pool = {async acquire() { throw new Error('DS nao buildado — rode o build do DS'); }, async closeAll() {}};
  await executeRun({run, store, cells, state, config: {dsRepo}, pool});

  const done = store.get(run.runId);
  assert.equal(done.status, 'error');
  assert.match(done.error, /DS nao buildado/);
  const manifest = JSON.parse(fs.readFileSync(path.join(done.runDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'failed');
  assert.ok(manifest.error);
});
