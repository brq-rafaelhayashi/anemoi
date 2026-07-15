'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {fetchKobaCatalog} = require('../src/kobaCatalog');

function serve(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise(done => server.close(done)),
    }));
  });
}

test('retorna o catalogo quando o Koba responde 200 com lista', async () => {
  const server = await serve((req, res) => {
    assert.equal(req.url, '/catalog.json');
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify([{key: 'tgr-button', initialArgs: {}, slots: []}]));
  });
  const catalog = await fetchKobaCatalog(server.url);
  await server.close();
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].key, 'tgr-button');
});

test('KOBA_UNAVAILABLE quando o servidor nao responde', async () => {
  await assert.rejects(
    fetchKobaCatalog('http://127.0.0.1:1', {timeoutMs: 500}),
    (error) => error.code === 'KOBA_UNAVAILABLE' && /Suba o Koba/.test(error.message),
  );
});

test('KOBA_UNAVAILABLE quando responde 503 (DS sem build)', async () => {
  const server = await serve((_req, res) => {
    res.writeHead(503, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Manifesto do DS ausente'}));
  });
  await assert.rejects(
    fetchKobaCatalog(server.url),
    (error) => error.code === 'KOBA_UNAVAILABLE' && /503/.test(error.message),
  );
  await server.close();
});

test('KOBA_UNAVAILABLE quando o corpo nao e uma lista', async () => {
  const server = await serve((_req, res) => {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'algo'}));
  });
  await assert.rejects(fetchKobaCatalog(server.url), (error) => error.code === 'KOBA_UNAVAILABLE');
  await server.close();
});

test('KOBA_UNAVAILABLE quando responde 200 mas o corpo nao e JSON valido', async () => {
  const server = await serve((_req, res) => {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end('nao e json');
  });
  await assert.rejects(
    fetchKobaCatalog(server.url),
    (error) => error.code === 'KOBA_UNAVAILABLE' && /nao e JSON valido/.test(error.message),
  );
  await server.close();
});
