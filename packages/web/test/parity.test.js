const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {PNG} = require('pngjs');
const {groupByCell, computeParity} = require('../src/parity');

test('groupByCell agrupa as 3 capturas por (brand,story,viewport,theme)', () => {
  const caps = [
    {framework: 'wc', brand: 'gol', storyId: 'action-button--primary', storyName: 'Primary', viewport: 'sm', theme: 'light', relPath: 'wc/gol/action-button--primary/sm/light.png'},
    {framework: 'react', brand: 'gol', storyId: 'action-button--primary', storyName: 'Primary', viewport: 'sm', theme: 'light', relPath: 'react/gol/action-button--primary/sm/light.png'},
    {framework: 'angular', brand: 'gol', storyId: 'action-button--primary', storyName: 'Primary', viewport: 'sm', theme: 'light', relPath: 'angular/gol/action-button--primary/sm/light.png'},
  ];
  const groups = groupByCell(caps);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].wc, 'wc/gol/action-button--primary/sm/light.png');
  assert.equal(groups[0].react, 'react/gol/action-button--primary/sm/light.png');
  assert.equal(groups[0].label, 'gol · Primary · sm · light');
});

test('groupByCell nao colapsa stories distintas com o mesmo display name', () => {
  const base = {brand: 'gol', storyName: 'Primary', viewport: 'sm', theme: 'light'};
  const groups = groupByCell([
    {...base, framework: 'wc', storyId: 'button--primary-a', relPath: 'a.png'},
    {...base, framework: 'wc', storyId: 'button--primary-b', relPath: 'b.png'},
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => group.wc), ['a.png', 'b.png']);
});

function writeSolidPng(runDir, rel, fill, width = 4, height = 4) {
  const abs = path.join(runDir, rel);
  fs.mkdirSync(path.dirname(abs), {recursive: true});
  const png = new PNG({width, height});
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = fill;
    png.data[i + 1] = fill;
    png.data[i + 2] = fill;
    png.data[i + 3] = 255;
  }
  fs.writeFileSync(abs, PNG.sync.write(png));
}

test('computeParity guarda mismatch, width, height e diffPath por comparacao', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-'));
  writeSolidPng(runDir, 'wc.png', 10);
  writeSolidPng(runDir, 'react.png', 240);
  const groups = [{
    label: 'gol · Primary · sm · light',
    wc: 'wc.png',
    react: 'react.png',
    _cell: {brand: 'gol', storyId: 'button--primary', viewport: 'sm', theme: 'light'},
  }];
  const [g] = computeParity(groups, runDir);
  assert.equal(g.parity.length, 1);
  assert.equal(g.parity[0].against, 'react');
  assert.ok(g.parity[0].mismatch > 0);
  assert.equal(g.parity[0].width, 4);
  assert.equal(g.parity[0].height, 4);
  assert.match(g.parity[0].diffPath, /react-vs-wc/);
});

test('computeParity com pairs customizado compara angular contra react', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-'));
  writeSolidPng(runDir, 'react.png', 10);
  writeSolidPng(runDir, 'angular.png', 240);
  const groups = [{
    label: 'gol · Primary · sm · light',
    react: 'react.png',
    angular: 'angular.png',
    _cell: {brand: 'gol', storyId: 'button--primary', viewport: 'sm', theme: 'light'},
  }];
  const [g] = computeParity(groups, runDir, {pairs: [{reference: 'react', against: 'angular'}]});
  assert.equal(g.parity.length, 1);
  assert.equal(g.parity[0].against, 'angular');
  assert.ok(g.parity[0].mismatch > 0);
  assert.match(g.parity[0].diffPath, /^diff\/angular-vs-react\//);
  assert.equal(g._cell, undefined);
});

test('computeParity pairs: parity vazio quando falta um dos lados', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-'));
  writeSolidPng(runDir, 'react.png', 10);
  const groups = [{
    label: 'gol · Primary · sm · light',
    react: 'react.png',
    _cell: {brand: 'gol', storyId: 'button--primary', viewport: 'sm', theme: 'light'},
  }];
  const [g] = computeParity(groups, runDir, {pairs: [{reference: 'react', against: 'angular'}]});
  assert.deepEqual(g.parity, []);
});

test('computeParity: uniao das dimensoes e sizeMatch false quando tamanhos divergem', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-union-'));
  writeSolidPng(runDir, 'wc.png', 200, 4, 4);
  writeSolidPng(runDir, 'react.png', 200, 6, 4); // mesma cor, mais larga
  const groups = [{
    label: 'gol · Primary · sm · light',
    wc: 'wc.png',
    react: 'react.png',
    _cell: {brand: 'gol', storyId: 'button--primary', viewport: 'sm', theme: 'light'},
  }];
  const [g] = computeParity(groups, runDir);
  assert.equal(g.parity[0].width, 6);   // uniao (max), nao intersecao (min)
  assert.equal(g.parity[0].height, 4);
  assert.equal(g.parity[0].sizeMatch, false);
  assert.deepEqual(g.parity[0].referenceSize, {width: 4, height: 4});
  assert.deepEqual(g.parity[0].againstSize, {width: 6, height: 4});
  assert.ok(g.parity[0].mismatch > 0, 'area extra da uniao conta como divergencia');
});

test('computeParity: tamanhos iguais => sizeMatch true', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-eq-'));
  writeSolidPng(runDir, 'wc.png', 10);
  writeSolidPng(runDir, 'react.png', 10);
  const groups = [{
    label: 'gol · Primary · sm · light',
    wc: 'wc.png',
    react: 'react.png',
    _cell: {brand: 'gol', storyId: 'button--primary', viewport: 'sm', theme: 'light'},
  }];
  const [g] = computeParity(groups, runDir);
  assert.equal(g.parity[0].sizeMatch, true);
  assert.equal(g.parity[0].mismatch, 0);
});

test('groupByCell propaga a11y das capturas por framework em _a11y', () => {
  const base = {brand: 'gol', storyId: 'button--primary', storyName: 'Primary', viewport: 'sm', theme: 'light'};
  const groups = groupByCell([
    {...base, framework: 'wc', relPath: 'wc.png', a11y: {relPath: 'wc.a11y.json', violations: []}},
    {...base, framework: 'react', relPath: 'react.png', a11y: {error: 'axe timeout'}},
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]._a11y.wc.relPath, 'wc.a11y.json');
  assert.equal(groups[0]._a11y.react.error, 'axe timeout');
});

test('groupByCell sem a11y nas capturas nao cria _a11y', () => {
  const groups = groupByCell([
    {framework: 'wc', brand: 'gol', storyId: 'b--p', storyName: 'P', viewport: 'sm', theme: 'light', relPath: 'wc.png'},
  ]);
  assert.equal('_a11y' in groups[0], false);
});
