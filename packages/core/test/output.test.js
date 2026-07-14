const {test} = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {writeManifest, writeSummary, renderHtml, escapeHtml} = require('../src/output');

function sampleManifest(runDir) {
  return {
    card: 'CDCOM-99',
    component: 'country_flag',
    mode: 'current',
    generatedAt: '2026-06-17T10:00:00.000Z',
    axes: {brands: ['gol'], stories: ['Country Flag'], viewports: ['xs'], modes: [], args: {}},
    cellCount: 1,
    captures: [
      {brand: 'gol', storyName: 'Country Flag', viewport: 'xs', mode: null, path: 'gol/Country Flag/xs.png'},
    ],
    runDir,
  };
}

test('escapeHtml: escapa caracteres', () => {
  assert.equal(escapeHtml('<a>&"'), '&lt;a&gt;&amp;&quot;');
});

test('writeManifest: grava manifest.json formatado', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-'));
  const p = writeManifest(dir, sampleManifest(dir));
  assert.ok(p.endsWith('manifest.json'));
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(parsed.component, 'country_flag');
  assert.equal(parsed.cellCount, 1);
});

test('writeSummary: grava summary.md legivel', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-'));
  const p = writeSummary(dir, sampleManifest(dir));
  const md = fs.readFileSync(p, 'utf8');
  assert.match(md, /country_flag/);
  assert.match(md, /CDCOM-99/);
  assert.match(md, /Status: passed/);
  assert.match(md, /Prints: 1/);
});

test('renderHtml layout parity monta grade wc|react|angular', () => {
  const html = renderHtml({
    tool: 'Anemoi Web', component: 'tgr-button', card: 'NO-CARD',
    mode: 'current', layout: 'parity', cellCount: 1,
    generatedAt: '2026-06-29T00:00:00Z',
    axes: {frameworks: ['wc','react','angular'], stories: ['Primary'], themes: ['light'], viewports: ['sm'], brands: ['gol']},
    groups: [{
      label: 'gol · Primary · sm · light',
      wc: 'wc/gol/Primary/sm/light.png',
      react: 'react/gol/Primary/sm/light.png',
      angular: 'angular/gol/Primary/sm/light.png',
      parity: [{against: 'react', mismatch: 0}, {against: 'angular', mismatch: 0}],
    }],
  });
  assert.match(html, /react\/gol\/Primary\/sm\/light\.png/);
  assert.match(html, /angular\/gol\/Primary\/sm\/light\.png/);
  assert.match(html, /paridade/i);
});
