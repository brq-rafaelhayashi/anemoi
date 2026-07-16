'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const {capturePipeline, hasParityDivergence} = require('../src/pipeline');

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

    assert.deepEqual(stages, ['capture', 'parity', 'a11y', 'output']);
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

test('hasParityDivergence: mismatch, sizeMatch e manifests antigos', () => {
  assert.equal(hasParityDivergence([{mismatch: 0, sizeMatch: true}]), false);
  assert.equal(hasParityDivergence([{mismatch: 3, sizeMatch: true}]), true);
  assert.equal(hasParityDivergence([{mismatch: 0, sizeMatch: false}]), true);
  // Entries antigos sem sizeMatch nao podem divergir pela ausencia do campo.
  assert.equal(hasParityDivergence([{mismatch: 0}]), false);
});

// #evidence-root inline-block: o screenshot abraca o conteudo, entao larguras
// diferentes produzem capturas de tamanhos diferentes.
const evidenceHtmlSized = (color, width) =>
  `<!doctype html><html><head><meta charset="utf-8"></head>`
  + `<body style="margin:0"><div id="evidence-root" style="display:inline-block">`
  + `<div style="width:${width}px;height:48px;background:${color}"></div></div></body></html>`;

test('pipeline: dimensoes divergentes acusam failed e registram sizeMatch', async () => {
  const react = await serveEvidence(evidenceHtmlSized('#f60', 120));
  const angular = await serveEvidence(evidenceHtmlSized('#f60', 140));
  try {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-pipeline-'));
    const {manifest} = await capturePipeline({
      cells: [cell('react'), cell('angular')],
      acquireHost: async (framework) => ({
        host: fakeHost(framework),
        url: framework === 'react' ? react.url : angular.url,
      }),
      runDir,
      pairs: [{reference: 'react', against: 'angular'}],
      statusFromParity: true,
      manifestMeta: meta(),
    });
    assert.equal(manifest.status, 'failed');
    const p = manifest.groups[0].parity[0];
    assert.equal(p.sizeMatch, false);
    assert.ok(p.againstSize.width > p.referenceSize.width);
  } finally {
    await react.close();
    await angular.close();
  }
});

// --- estagio a11y ---

// Botao sem nome acessivel (violacao button-name) vs botao com nome:
// alem da violacao, as arvores ARIA divergem entre os dois servers.
const evidenceHtmlButton = (label) =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>f</title></head>`
  + `<body style="margin:0"><div id="evidence-root">`
  + `<button style="color:#000;background:#fff;border:1px solid #000">${label}</button></div></body></html>`;

test('pipeline: coleta a11y por padrao; sem gate, divergencia so aparece no relatorio', async () => {
  const react = await serveEvidence(evidenceHtmlButton(''));         // violacao button-name
  const angular = await serveEvidence(evidenceHtmlButton('Salvar')); // limpo, aria diferente
  try {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-pipeline-a11y-'));
    // Sem statusFromParity nem statusFromA11y: nenhuma divergencia muda o status.
    const {manifest, a11yDiverged, parityDiverged} = await capturePipeline({
      cells: [cell('react'), cell('angular')],
      acquireHost: async (framework) => ({
        host: fakeHost(framework),
        url: framework === 'react' ? react.url : angular.url,
      }),
      runDir,
      pairs: [{reference: 'react', against: 'angular'}],
      manifestMeta: meta(),
    });
    assert.equal(a11yDiverged, true);
    assert.equal(parityDiverged, true); // textos diferentes divergem em pixels tambem
    assert.equal(manifest.status, 'passed'); // gates desligados: so relatorio
    const {audits, ariaParity} = manifest.groups[0].a11y;
    assert.ok(audits.react.violations.some(v => v.id === 'button-name'));
    assert.deepEqual(audits.angular.violations, []);
    assert.equal(ariaParity[0].against, 'angular');
    assert.equal(ariaParity[0].match, false);
    assert.ok(fs.existsSync(path.join(runDir, ariaParity[0].diffPath)));
    assert.ok(fs.existsSync(path.join(runDir, audits.react.artifactPath)));
    assert.ok(fs.existsSync(path.join(runDir, 'react/gol/fake--primary/sm/light.aria.yaml')));
    assert.ok(manifest.a11y.totalViolations >= 1);
    assert.equal(manifest.a11y.ariaMismatches, 1);
  } finally {
    await react.close();
    await angular.close();
  }
});

test('pipeline: statusFromA11y acusa failed e emite o estagio a11y na ordem', async () => {
  // Botao sem nome nos DOIS lados: pixels e ARIA identicos (paridade passa),
  // mas ha violacao axe — a divergencia e SOMENTE de acessibilidade.
  const react = await serveEvidence(evidenceHtmlButton(''));
  const angular = await serveEvidence(evidenceHtmlButton(''));
  try {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-pipeline-a11y-'));
    const stages = [];
    const {manifest, parityDiverged} = await capturePipeline({
      cells: [cell('react'), cell('angular')],
      acquireHost: async (framework) => ({
        host: fakeHost(framework),
        url: framework === 'react' ? react.url : angular.url,
      }),
      runDir,
      pairs: [{reference: 'react', against: 'angular'}],
      statusFromParity: true,
      statusFromA11y: true,
      manifestMeta: meta(),
      onStage: (s) => stages.push(s),
    });
    assert.deepEqual(stages, ['capture', 'parity', 'a11y', 'output']);
    assert.equal(parityDiverged, false);
    assert.equal(manifest.status, 'failed'); // violacao button-name nos dois lados
    assert.equal(manifest.groups[0].a11y.ariaParity[0].match, true);
  } finally {
    await react.close();
    await angular.close();
  }
});

test('pipeline: collectA11y false nao coleta nem agrega', async () => {
  await withServers({react: '#f60', angular: '#f60'}, async (servers) => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-pipeline-noa11y-'));
    const {manifest, a11yDiverged} = await capturePipeline({
      cells: [cell('react'), cell('angular')],
      acquireHost: async (framework) => ({host: fakeHost(framework), url: servers[framework].url}),
      runDir,
      pairs: [{reference: 'react', against: 'angular'}],
      collectA11y: false,
      manifestMeta: meta(),
    });
    assert.equal('a11y' in manifest, false);
    assert.equal('a11y' in manifest.groups[0], false);
    assert.equal(a11yDiverged, false);
    assert.equal(fs.existsSync(path.join(runDir, 'react/gol/fake--primary/sm/light.a11y.json')), false);
  });
});
