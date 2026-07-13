const fs = require('node:fs');
const {PNG} = require('pngjs');
const pixelmatch = require('pixelmatch');

// Compara before vs after. Se as dimensoes diferem, normaliza conforme opts.fit:
//   'union' (default): dimensoes = Math.max; imagem menor recebe pad transparente top-left.
//   'intersection': dimensoes = Math.min; ambas as imagens sao recortadas para a menor area.
function writeDiff(beforePath, afterPath, outPath, opts = {}) {
  const before = PNG.sync.read(fs.readFileSync(beforePath));
  const after = PNG.sync.read(fs.readFileSync(afterPath));

  const fit = opts.fit || 'union';
  const width = fit === 'intersection'
    ? Math.min(before.width, after.width)
    : Math.max(before.width, after.width);
  const height = fit === 'intersection'
    ? Math.min(before.height, after.height)
    : Math.max(before.height, after.height);

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
// Se o canvas for menor que a imagem (fit='intersection'), recorta para WxH.
function resizeCanvas(png, width, height) {
  if (png.width === width && png.height === height) {
    return png;
  }
  const canvas = new PNG({width, height});
  const copyW = Math.min(png.width, width);
  const copyH = Math.min(png.height, height);
  PNG.bitblt(png, canvas, 0, 0, copyW, copyH, 0, 0);
  return canvas;
}

module.exports = {writeDiff};
