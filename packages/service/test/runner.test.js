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

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'compare-page.html'), 'utf8');

// Servidor fake do Koba: qualquer GET /compare/* devolve a fixture.
function serveComparePage() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if ((req.url || '').startsWith('/compare/')) {
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
        res.end(FIXTURE);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise(done => server.close(done)),
    }));
  });
}

function setup(state) {
  const dsRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-runner-'));
  const store = createRunStore();
  const run = store.create({component: state.componentKey, card: 'koba'});
  const cells = compareStateToCells(state, {viewports: ['sm']});
  return {dsRepo, store, run, cells};
}

test('run passed: panes identicos geram bundle com paridade zero', async () => {
  const state = {componentKey: 'tgr-fake', props: {label: 'Ola'}, slots: {}};
  const {dsRepo, store, run, cells} = setup(state);
  const koba = await serveComparePage();

  await executeRun({run, store, cells, state, config: {dsRepo, kobaBaseUrl: koba.url}});
  await koba.close();

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

test('run failed: panes divergentes acusam mismatch', async () => {
  const state = {componentKey: 'tgr-fake', props: {label: 'Ola', divergir: true}, slots: {}};
  const {dsRepo, store, run, cells} = setup(state);
  const koba = await serveComparePage();

  await executeRun({run, store, cells, state, config: {dsRepo, kobaBaseUrl: koba.url}});
  await koba.close();

  const done = store.get(run.runId);
  assert.equal(done.status, 'failed');
  assert.ok(done.summary.maxMismatchPx > 0);
  const manifest = JSON.parse(fs.readFileSync(path.join(done.runDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'failed');
});

test('run error: Koba fora do ar termina em error com failure manifest', async () => {
  const state = {componentKey: 'tgr-fake', props: {}, slots: {}};
  const {dsRepo, store, run, cells} = setup(state);

  await executeRun({run, store, cells, state, config: {dsRepo, kobaBaseUrl: 'http://127.0.0.1:1'}});

  const done = store.get(run.runId);
  assert.equal(done.status, 'error');
  assert.ok(done.error);
  const manifest = JSON.parse(fs.readFileSync(path.join(done.runDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'failed');
  assert.ok(manifest.error);
});
