'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {createService, validatePayload} = require('../src/server');
const {createRunStore} = require('../src/runStore');
const {createQueue} = require('../src/queue');

const CATALOG = [{key: 'tgr-button', initialArgs: {label: 'Comprar'}, slots: []}];
const CONFIG = {port: 0, kobaBaseUrl: 'http://localhost:9000', dsRepo: '/tmp/nao-usado'};

function startService({fetchCatalog, executeRun} = {}) {
  const store = createRunStore();
  const queue = createQueue();
  const calls = [];
  const service = createService({
    config: CONFIG,
    store,
    queue,
    deps: {
      fetchCatalog: fetchCatalog || (async () => CATALOG),
      executeRun: executeRun || (async (job) => { calls.push(job); }),
    },
  });
  return new Promise((resolve) => {
    service.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${service.address().port}`,
      store, calls,
      close: () => new Promise(done => service.close(done)),
    }));
  });
}

const VALID_BODY = {
  mode: 'state',
  compareState: {componentKey: 'tgr-button', props: {label: 'Pagar'}, slots: {}},
};

test('validatePayload cobre os casos 422', () => {
  assert.equal(validatePayload(VALID_BODY), null);
  assert.match(validatePayload({...VALID_BODY, mode: 'stories'}), /mode/);
  assert.match(validatePayload({mode: 'state'}), /componentKey/);
  assert.match(validatePayload({...VALID_BODY, axes: {viewports: ['xxl']}}), /viewports/);
  assert.match(validatePayload({...VALID_BODY, axes: {themes: ['dark']}}), /themes/);
});

test('POST /runs valido responde 202 e enfileira o run', async () => {
  const svc = await startService();
  const response = await fetch(`${svc.url}/runs`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(VALID_BODY),
  });
  assert.equal(response.status, 202);
  const {runId} = await response.json();
  assert.ok(svc.store.get(runId));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(svc.calls.length, 1);
  assert.equal(svc.calls[0].run.runId, runId);
  // estado normalizado: merge sobre initialArgs do catalogo
  assert.deepEqual(svc.calls[0].state.props, {label: 'Pagar'});
  await svc.close();
});

test('POST /runs com componentKey desconhecido responde 422', async () => {
  const svc = await startService();
  const response = await fetch(`${svc.url}/runs`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({...VALID_BODY, compareState: {componentKey: 'tgr-x', props: {}, slots: {}}}),
  });
  assert.equal(response.status, 422);
  await svc.close();
});

test('POST /runs com Koba fora do ar responde 503', async () => {
  const svc = await startService({
    fetchCatalog: async () => {
      const error = new Error('Koba indisponivel');
      error.code = 'KOBA_UNAVAILABLE';
      throw error;
    },
  });
  const response = await fetch(`${svc.url}/runs`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(VALID_BODY),
  });
  assert.equal(response.status, 503);
  await svc.close();
});

test('POST /runs com JSON invalido responde 400', async () => {
  const svc = await startService();
  const response = await fetch(`${svc.url}/runs`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: '{nao e json',
  });
  assert.equal(response.status, 400);
  await svc.close();
});

test('GET /runs/:id retorna o status e URLs quando terminou', async () => {
  const svc = await startService();
  const run = svc.store.create({component: 'tgr-button', card: 'koba'});

  let response = await fetch(`${svc.url}/runs/${run.runId}`);
  assert.equal(response.status, 200);
  let body = await response.json();
  assert.equal(body.status, 'queued');
  assert.equal(body.galleryUrl, undefined);

  svc.store.transition(run.runId, 'running');
  svc.store.transition(run.runId, 'passed', {summary: {cells: 2, mismatches: 0, maxMismatchPx: 0}});
  response = await fetch(`${svc.url}/runs/${run.runId}`);
  body = await response.json();
  assert.equal(body.status, 'passed');
  assert.deepEqual(body.summary, {cells: 2, mismatches: 0, maxMismatchPx: 0});
  assert.equal(body.galleryUrl, `/runs/${run.runId}/gallery/`);
  assert.equal(body.manifestUrl, `/runs/${run.runId}/gallery/manifest.json`);
  await svc.close();
});

test('GET /runs/desconhecido responde 404', async () => {
  const svc = await startService();
  const response = await fetch(`${svc.url}/runs/00000000-0000-0000-0000-000000000000`);
  assert.equal(response.status, 404);
  await svc.close();
});

test('galeria serve o bundle e bloqueia path traversal', async () => {
  const svc = await startService();
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-gallery-'));
  fs.writeFileSync(path.join(runDir, 'index.html'), '<h1>galeria</h1>');
  fs.writeFileSync(path.join(runDir, 'manifest.json'), '{"status":"passed"}');
  const run = svc.store.create({component: 'tgr-button', card: 'koba'});
  svc.store.patch(run.runId, {runDir});

  let response = await fetch(`${svc.url}/runs/${run.runId}/gallery/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /galeria/);
  assert.match(response.headers.get('content-type'), /text\/html/);

  response = await fetch(`${svc.url}/runs/${run.runId}/gallery/manifest.json`);
  assert.equal(response.status, 200);

  response = await fetch(`${svc.url}/runs/${run.runId}/gallery/..%2F..%2Fetc%2Fpasswd`);
  assert.equal(response.status, 403);
  await svc.close();
});

test('CORS: preflight e headers apontam para a origem do Koba', async () => {
  const svc = await startService();
  const preflight = await fetch(`${svc.url}/runs`, {method: 'OPTIONS'});
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), CONFIG.kobaBaseUrl);
  assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);

  const run = svc.store.create({component: 'tgr-button', card: 'koba'});
  const response = await fetch(`${svc.url}/runs/${run.runId}`);
  assert.equal(response.headers.get('access-control-allow-origin'), CONFIG.kobaBaseUrl);
  await svc.close();
});
