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
