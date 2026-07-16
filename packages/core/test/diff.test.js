const {test} = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {PNG} = require('pngjs');
const {writeDiff} = require('../src/diff');

function writePng(filePath, fill) {
  const png = new PNG({width: 4, height: 4});
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = fill.r;
    png.data[i + 1] = fill.g;
    png.data[i + 2] = fill.b;
    png.data[i + 3] = 255;
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

test('writeDiff: imagens iguais => 0 pixels diferentes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-'));
  const a = path.join(dir, 'a.png');
  const b = path.join(dir, 'b.png');
  const out = path.join(dir, 'd.png');
  writePng(a, {r: 10, g: 20, b: 30});
  writePng(b, {r: 10, g: 20, b: 30});

  const {mismatch} = writeDiff(a, b, out);
  assert.equal(mismatch, 0);
  assert.ok(fs.existsSync(out));
});

test('writeDiff: imagens diferentes => mismatch > 0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-'));
  const a = path.join(dir, 'a.png');
  const b = path.join(dir, 'b.png');
  const out = path.join(dir, 'd.png');
  writePng(a, {r: 0, g: 0, b: 0});
  writePng(b, {r: 255, g: 255, b: 255});

  const {mismatch} = writeDiff(a, b, out);
  assert.equal(mismatch, 16); // 4x4 px todos diferentes
});

// Helpers para testes de fit
function writePngSized(filePath, w, h, fill) {
  const png = new PNG({width: w, height: h});
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = fill.r;
    png.data[i + 1] = fill.g;
    png.data[i + 2] = fill.b;
    png.data[i + 3] = 255;
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

test('writeDiff union (default): trecho extra e contado como divergencia', () => {
  // before: 4x4 vermelho; after: 6x4 vermelho nos primeiros 4 cols, diferente nos 2 cols extras
  // No union (pad para 6x4), a area extra da imagem menor (before) fica transparente → diverge do vermelho
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-union-'));
  const a = path.join(dir, 'a.png');
  const b = path.join(dir, 'b.png');
  const out = path.join(dir, 'd.png');
  writePngSized(a, 4, 4, {r: 200, g: 0, b: 0}); // 4 wide
  writePngSized(b, 6, 4, {r: 200, g: 0, b: 0}); // 6 wide, mesma cor mas mais larga

  const {mismatch, width, height} = writeDiff(a, b, out);
  assert.equal(width, 6);
  assert.equal(height, 4);
  // Os 2 cols extras (2x4=8 px) da imagem menor ficam transparentes vs vermelho → mismatch > 0
  assert.ok(mismatch > 0, `esperado mismatch > 0, obtido ${mismatch}`);
});

test('writeDiff intersection: regiao comum identica => mismatch 0', () => {
  // Mesmo cenario acima, mas com fit:'intersection' => corta para 4x4 => regiao comum identica => 0
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-inter-'));
  const a = path.join(dir, 'a.png');
  const b = path.join(dir, 'b.png');
  const out = path.join(dir, 'd.png');
  writePngSized(a, 4, 4, {r: 200, g: 0, b: 0});
  writePngSized(b, 6, 4, {r: 200, g: 0, b: 0});

  const {mismatch, width, height} = writeDiff(a, b, out, {fit: 'intersection'});
  assert.equal(width, 4);
  assert.equal(height, 4);
  assert.equal(mismatch, 0);
});

test('writeDiff intersection: retorna dimensoes menores', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-inter2-'));
  const a = path.join(dir, 'a.png');
  const b = path.join(dir, 'b.png');
  const out = path.join(dir, 'd.png');
  writePngSized(a, 10, 8, {r: 0, g: 0, b: 0});
  writePngSized(b, 6, 12, {r: 0, g: 0, b: 0});

  const {width, height} = writeDiff(a, b, out, {fit: 'intersection'});
  assert.equal(width, 6);   // min(10,6)
  assert.equal(height, 8);  // min(8,12)
});

test('writeDiff: retorna sizeMatch true e dimensoes originais quando tamanhos coincidem', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-size-'));
  const a = path.join(dir, 'a.png');
  const b = path.join(dir, 'b.png');
  const out = path.join(dir, 'd.png');
  writePng(a, {r: 10, g: 20, b: 30});
  writePng(b, {r: 10, g: 20, b: 30});

  const result = writeDiff(a, b, out);
  assert.equal(result.sizeMatch, true);
  assert.deepEqual(result.beforeSize, {width: 4, height: 4});
  assert.deepEqual(result.afterSize, {width: 4, height: 4});
  assert.equal(result.threshold, 0.1);
});

test('writeDiff: sizeMatch false com tamanhos originais quando dimensoes divergem', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-size2-'));
  const a = path.join(dir, 'a.png');
  const b = path.join(dir, 'b.png');
  const out = path.join(dir, 'd.png');
  writePngSized(a, 4, 4, {r: 200, g: 0, b: 0});
  writePngSized(b, 6, 4, {r: 200, g: 0, b: 0});

  const result = writeDiff(a, b, out);
  assert.equal(result.sizeMatch, false);
  assert.deepEqual(result.beforeSize, {width: 4, height: 4});
  assert.deepEqual(result.afterSize, {width: 6, height: 4});
});

test('writeDiff: threshold customizado e aplicado e registrado no retorno', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-thr-'));
  const a = path.join(dir, 'a.png');
  const b = path.join(dir, 'b.png');
  const out = path.join(dir, 'd.png');
  writePng(a, {r: 0, g: 0, b: 0});
  writePng(b, {r: 255, g: 255, b: 255});

  // threshold 1 = tolerancia maxima do pixelmatch: preto vs branco nao conta.
  const result = writeDiff(a, b, out, {threshold: 1});
  assert.equal(result.mismatch, 0);
  assert.equal(result.threshold, 1);
});

test('barrel do core exporta DEFAULT_THRESHOLD', () => {
  const core = require('../src/index');
  assert.equal(core.DEFAULT_THRESHOLD, 0.1);
});
