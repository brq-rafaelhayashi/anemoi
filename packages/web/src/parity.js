const fs = require('node:fs');
const path = require('node:path');
const {writeDiff, assertSafePathSegment} = require('@gol-smiles/anemoi-core');

function keyOf(c) {
  return [c.brand, c.storyId, c.viewport, c.theme].join('|');
}

// Agrupa capturas por celula visual; cada grupo expoe wc/react/angular relPaths.
function groupByCell(captures) {
  const map = new Map();
  for (const c of captures) {
    const k = keyOf(c);
    if (!map.has(k)) {
      map.set(k, {label: `${c.brand} · ${c.storyName} · ${c.viewport} · ${c.theme}`, _cell: c});
    }
    map.get(k)[c.framework] = c.relPath;
  }
  return [...map.values()];
}

// Compara react×wc e angular×wc com writeDiff e GRAVA os PNGs de diff em <runDir>/diff/. Retorna os grupos com parity[].
function computeParity(groups, runDir) {
  return groups.map(g => {
    const parity = [];
    for (const fw of ['react', 'angular']) {
      if (g.wc && g[fw]) {
        const brand = assertSafePathSegment(g._cell.brand, 'brand');
        const storyId = assertSafePathSegment(g._cell.storyId, 'storyId');
        const viewport = assertSafePathSegment(g._cell.viewport, 'viewport');
        const theme = assertSafePathSegment(g._cell.theme, 'theme');
        const diffRel = path.join('diff', `${fw}-vs-wc`, `${brand}-${storyId}-${viewport}-${theme}.png`);
        const {mismatch} = writeDiff(
          path.join(runDir, g.wc), path.join(runDir, g[fw]), ensureDir(path.join(runDir, diffRel)),
          {fit: 'intersection'},
        );
        parity.push({against: fw, mismatch, diffPath: diffRel});
      }
    }
    const {_cell, ...rest} = g;
    return {...rest, parity};
  });
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), {recursive: true});
  return p;
}

module.exports = {groupByCell, computeParity};
