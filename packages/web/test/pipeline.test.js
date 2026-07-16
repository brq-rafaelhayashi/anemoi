'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const {capturePipeline} = require('../src/pipeline');

// Servidor estatico fake: serve `html` para qualquer path (simula um harness servido).
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

const evidenceHtml = (color) =>
  `<!doctype html><html><head><meta charset="utf-8"></head>`
  + `<body style="margin:0"><div id="evidence-root">`
  + `<div style="width:120px;height:48px;background:${color}"></div></div></body></html>`;

function cell(framework) {
  return {
    framework, component: 'tgr-fake', brand: 'gol',
    storyId: 'fake--primary', storyName: 'Primary',
    viewport: 'sm', width: 640, theme: 'light', args: {},
  };
}

function meta() {
  return {
    tool: 'Anemoi Web',
    card: 'CDCOM-1',
    component: 'tgr-fake',
    mode: 'current',
    axes: {frameworks: ['react', 'angular'], stories: ['Primary'], themes: ['light'], viewports: ['sm'], brands: ['gol']},
  };
}

async function withServers(colors, fn) {
  const servers = {};
  for (const [framework, color] of Object.entries(colors)) {
    servers[framework] = await serveEvidence(evidenceHtml(color));
  }
  try {
    return await fn(servers);
  } finally {
    for (const server of Object.values(servers)) await server.close();
  }
}

test('pipeline: captura por framework, paridade e bundle completo', async () => {
  await withServers({react: '#f60', angular: '#f60'}, async (servers) => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-pipeline-'));
    const stages = [];
    const released = [];

    const {manifest, captures} = await capturePipeline({
      cells: [cell('react'), cell('angular')],
      acquireHost: async (framework) => ({
        host: fakeHost(framework),
        url: servers[framework].url,
        release: async () => released.push(framework),
      }),
      runDir,
      pairs: [{reference: 'react', against: 'angular'}],
      manifestMeta: meta(),
      onStage: (s) => stages.push(s),
    });

    assert.deepEqual(stages, ['capture', 'parity', 'output']);
    assert.deepEqual(released, ['react', 'angular']);
    assert.equal(captures.length, 2);
    assert.equal(manifest.status, 'passed');
    assert.equal(manifest.cellCount, 2);
    assert.equal(manifest.groups.length, 1);
    assert.equal(manifest.groups[0].parity[0].against, 'angular');
    assert.equal(manifest.groups[0].parity[0].mismatch, 0);
    assert.ok(fs.existsSync(path.join(runDir, 'manifest.json')));
    assert.ok(fs.existsSync(path.join(runDir, 'summary.md')));
    assert.ok(fs.existsSync(path.join(runDir, 'index.html')));
  });
});

test('pipeline: statusFromParity acusa failed quando ha mismatch', async () => {
  await withServers({react: '#f60', angular: '#06f'}, async (servers) => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-pipeline-'));
    const {manifest} = await capturePipeline({
      cells: [cell('react'), cell('angular')],
      acquireHost: async (framework) => ({host: fakeHost(framework), url: servers[framework].url}),
      runDir,
      pairs: [{reference: 'react', against: 'angular'}],
      statusFromParity: true,
      manifestMeta: meta(),
    });
    assert.equal(manifest.status, 'failed');
    assert.match(manifest.groups[0].parity[0].diffPath, /^diff\/angular-vs-react\//);
  });
});

test('pipeline: release e chamado mesmo quando a captura falha', async () => {
  await withServers({react: '#f60'}, async (servers) => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-pipeline-'));
    const released = [];
    const brokenHost = {...fakeHost('react'), verify: async () => { throw new Error('hidratacao falhou'); }};
    await assert.rejects(
      capturePipeline({
        cells: [cell('react')],
        acquireHost: async () => ({host: brokenHost, url: servers.react.url, release: async () => released.push('react')}),
        runDir,
        manifestMeta: meta(),
      }),
      /hidratacao falhou/,
    );
    assert.deepEqual(released, ['react']);
  });
});
