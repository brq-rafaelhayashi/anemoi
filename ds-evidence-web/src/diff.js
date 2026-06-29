const fs = require('node:fs');
const {PNG} = require('pngjs');
const pixelmatch = require('pixelmatch');

// Compara before vs after. Se as dimensoes diferem, normaliza para a maior
// (a menor e copiada num canvas do tamanho da maior) antes de comparar.
function writeDiff(beforePath, afterPath, outPath) {
  const before = PNG.sync.read(fs.readFileSync(beforePath));
  const after = PNG.sync.read(fs.readFileSync(afterPath));

  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);

  const a = resizeCanvas(before, width, height);
  const b = resizeCanvas(after, width, height);
  const diff = new PNG({width, height});

  const mismatch = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: 0.1,
  });

  fs.writeFileSync(outPath, PNG.sync.write(diff));
  return {mismatch, width, height};
}

// Coloca a imagem num canvas WxH (preenchido de transparente), top-left.
function resizeCanvas(png, width, height) {
  if (png.width === width && png.height === height) {
    return png;
  }
  const canvas = new PNG({width, height});
  PNG.bitblt(png, canvas, 0, 0, png.width, png.height, 0, 0);
  return canvas;
}

module.exports = {writeDiff};
