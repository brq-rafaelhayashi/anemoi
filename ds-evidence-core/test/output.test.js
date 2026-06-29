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
  assert.match(md, /Prints: 1/);
});

test('renderHtml: gera galeria com img das capturas (modo current)', () => {
  const html = renderHtml(sampleManifest('/tmp/run'));
  assert.match(html, /<img/);
  assert.match(html, /gol\/Country Flag\/xs\.png/);
  assert.match(html, /country_flag/);
});

test('renderHtml: before/after gera 3-up (before/after/diff)', () => {
  const manifest = sampleManifest('/tmp/run');
  manifest.mode = 'before-after';
  manifest.captures = [
    {
      brand: 'gol', storyName: 'Country Flag', viewport: 'xs', mode: null,
      beforePath: 'before/gol/Country Flag/xs.png',
      afterPath: 'after/gol/Country Flag/xs.png',
      diffPath: 'diff/gol/Country Flag/xs.png',
      mismatch: 42,
    },
  ];
  const html = renderHtml(manifest);
  assert.match(html, /before\/gol/);
  assert.match(html, /after\/gol/);
  assert.match(html, /diff\/gol/);
  assert.match(html, /42/);
});
