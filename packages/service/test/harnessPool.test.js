'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {createHarnessPool} = require('../src/harnessPool');

function cacheRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-pool-'));
}

// Fabrica de host fake: registra cada build em `builds`.
function fakeFactories(builds) {
  const make = (framework) => () => ({
    framework,
    build: (repo) => { builds.push([framework, repo]); },
  });
  return {react: make('react'), angular: make('angular')};
}

function fakeServe(closes) {
  return async (dir) => ({
    url: `http://fake/${path.basename(dir)}`,
    close: async () => { closes.push(dir); },
  });
}

test('acquire builda uma vez e reusa o server vivo', async () => {
  const builds = [];
  const pool = createHarnessPool({
    cacheRoot: cacheRoot(),
    assertReady: () => {},
    serveStatic: fakeServe([]),
    hostFactories: fakeFactories(builds),
    now: () => 1000,
    sentinelMtime: () => 100,
  });

  const first = await pool.acquire('react', '/ds');
  const second = await pool.acquire('react', '/ds');

  assert.equal(builds.length, 1); // buildou so uma vez
  assert.equal(first.url, second.url);
  await pool.closeAll();
});

test('acquire rebuilda quando o dist/ do DS fica mais novo que o build', async () => {
  const builds = [];
  const closes = [];
  let mtime = 100;
  let clock = 200;
  const pool = createHarnessPool({
    cacheRoot: cacheRoot(),
    assertReady: () => {},
    serveStatic: fakeServe(closes),
    hostFactories: fakeFactories(builds),
    now: () => clock,
    sentinelMtime: () => mtime,
  });

  await pool.acquire('react', '/ds'); // build #1 (builtAt=200, mtime=100 → fresh)
  await pool.acquire('react', '/ds'); // reuse (100 <= 200)
  assert.equal(builds.length, 1);

  mtime = 300; clock = 400;           // DS mudou → build stale
  await pool.acquire('react', '/ds'); // rebuild #2 (300 > 200)
  assert.equal(builds.length, 2);
  assert.equal(closes.length, 1);     // fechou o server stale antes de rebuildar

  await pool.acquire('react', '/ds'); // reuse de novo (300 <= 400)
  assert.equal(builds.length, 2);
  await pool.closeAll();
});

test('acquire propaga erro do doctor quando o DS nao esta buildado', async () => {
  const pool = createHarnessPool({
    cacheRoot: cacheRoot(),
    assertReady: () => { throw new Error('DS nao buildado'); },
    serveStatic: fakeServe([]),
    hostFactories: fakeFactories([]),
  });
  await assert.rejects(pool.acquire('react', '/ds'), /DS nao buildado/);
});

test('acquire rejeita framework sem harness', async () => {
  const pool = createHarnessPool({
    cacheRoot: cacheRoot(),
    assertReady: () => {},
    serveStatic: fakeServe([]),
    hostFactories: fakeFactories([]),
  });
  await assert.rejects(pool.acquire('vue', '/ds'), /Sem harness/);
});

test('closeAll fecha todos os servers e limpa o cache', async () => {
  const builds = [];
  const closes = [];
  const pool = createHarnessPool({
    cacheRoot: cacheRoot(),
    assertReady: () => {},
    serveStatic: fakeServe(closes),
    hostFactories: fakeFactories(builds),
    now: () => 1000,
    sentinelMtime: () => 100,
  });

  await pool.acquire('react', '/ds');
  await pool.acquire('angular', '/ds');
  await pool.closeAll();
  assert.equal(closes.length, 2);

  // Cache limpo: acquire builda de novo.
  await pool.acquire('react', '/ds');
  assert.equal(builds.length, 3);
  await pool.closeAll();
});
