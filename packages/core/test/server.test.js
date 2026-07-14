const {test} = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {serveStatic} = require('../src/server');

test('serveStatic: serve um arquivo do diretorio', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srv-'));
  fs.writeFileSync(path.join(dir, 'iframe.html'), '<html>ok</html>');

  const server = await serveStatic(dir);
  try {
    const res = await fetch(`${server.url}/iframe.html`);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.match(body, /ok/);
  } finally {
    await server.close();
  }
});

test('serveStatic: 404 para arquivo ausente', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srv-'));
  const server = await serveStatic(dir);
  try {
    const res = await fetch(`${server.url}/nope.html`);
    assert.equal(res.status, 404);
  } finally {
    await server.close();
  }
});

test('serveStatic: 400 para URL percent-encoded malformada', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srv-'));
  const server = await serveStatic(dir);
  try {
    const res = await fetch(`${server.url}/%E0%A4%A`);
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test('exporta o mapa MIME', () => {
  const {MIME} = require('../src/server');
  assert.equal(MIME['.html'], 'text/html; charset=utf-8');
  assert.equal(MIME['.png'], 'image/png');
});
