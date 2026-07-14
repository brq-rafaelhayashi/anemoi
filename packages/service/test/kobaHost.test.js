'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');

const {makeKobaHost} = require('../src/kobaHost');

const CELL = {
  framework: 'react', brand: 'gol', storyId: 'koba-state-abc12345', storyName: 'estado abc12345',
  viewport: 'sm', width: 360, theme: 'light',
  component: 'tgr-button',
  state: {componentKey: 'tgr-button', props: {label: 'Pagar'}, slots: {}},
};

test('urlFor monta a URL do /compare com state serializado como no Koba', () => {
  const host = makeKobaHost();
  const url = host.urlFor(CELL, 'http://localhost:9000');
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'http://localhost:9000');
  assert.equal(parsed.pathname, '/compare/tgr-button');
  assert.deepEqual(JSON.parse(parsed.searchParams.get('state')), CELL.state);
});

test('selectorFor aponta para o pane do framework da celula', () => {
  const host = makeKobaHost();
  assert.equal(host.selectorFor(CELL), '.koba-compare__pane--react');
  assert.equal(host.selectorFor({...CELL, framework: 'angular'}), '.koba-compare__pane--angular');
});

function serveHtml(html) {
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

test('verify resolve quando o pane contem custom element tgr-* definido', async () => {
  const server = await serveHtml(`<!doctype html><html><body>
    <div class="koba-compare__pane koba-compare__pane--react"><tgr-fake></tgr-fake></div>
    <script>customElements.define('tgr-fake', class extends HTMLElement {});</script>
  </body></html>`);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(server.url);
  const host = makeKobaHost();
  await host.verify(page, CELL);
  await browser.close();
  await server.close();
});

test('verify falha com timeout e grava screenshot de diagnostico', async () => {
  const server = await serveHtml('<!doctype html><html><body><p>sem pane</p></body></html>');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(server.url);
  const diagnosticsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-diag-'));
  const host = makeKobaHost({verifyTimeoutMs: 1000});
  await assert.rejects(host.verify(page, {...CELL, diagnosticsDir}));
  const shots = fs.readdirSync(diagnosticsDir);
  assert.equal(shots.length, 1);
  assert.match(shots[0], /^verify-react-sm-light\.png$/);
  await browser.close();
  await server.close();
});
