'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {PNG} = require('pngjs');

const {computeParityPair} = require('../src/parityPair');

function writePng(filePath, r, g, b) {
  const png = new PNG({width: 4, height: 4});
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
  }
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function makeGroup(runDir, {reactColor, angularColor}) {
  const reactRel = path.join('react', 'gol', 'koba-state-abc12345', 'sm', 'light.png');
  const angularRel = path.join('angular', 'gol', 'koba-state-abc12345', 'sm', 'light.png');
  writePng(path.join(runDir, reactRel), ...reactColor);
  writePng(path.join(runDir, angularRel), ...angularColor);
  return {
    label: 'gol · estado abc12345 · sm · light',
    _cell: {brand: 'gol', storyId: 'koba-state-abc12345', viewport: 'sm', theme: 'light'},
    react: reactRel,
    angular: angularRel,
  };
}

test('paridade zero quando as imagens sao iguais', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-parity-'));
  const groups = computeParityPair([makeGroup(runDir, {reactColor: [0, 128, 0], angularColor: [0, 128, 0]})], runDir);
  assert.equal(groups[0].parity.length, 1);
  assert.equal(groups[0].parity[0].against, 'angular');
  assert.equal(groups[0].parity[0].mismatch, 0);
  assert.equal(groups[0].parity[0].width, 4);
  assert.equal(groups[0].parity[0].height, 4);
  assert.ok(fs.existsSync(path.join(runDir, groups[0].parity[0].diffPath)));
  assert.equal(groups[0]._cell, undefined);
});

test('acusa mismatch quando as imagens divergem', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-parity-'));
  const groups = computeParityPair([makeGroup(runDir, {reactColor: [0, 128, 0], angularColor: [200, 0, 0]})], runDir);
  assert.ok(groups[0].parity[0].mismatch > 0);
  assert.match(groups[0].parity[0].diffPath, /^diff\/angular-vs-react\//);
});

test('parity vazio quando falta um dos lados', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-parity-'));
  const group = makeGroup(runDir, {reactColor: [0, 128, 0], angularColor: [0, 128, 0]});
  delete group.angular;
  const groups = computeParityPair([group], runDir);
  assert.deepEqual(groups[0].parity, []);
});
