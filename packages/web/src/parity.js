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

// Pares default do CLI: WC e o baseline padrao-ouro, react e angular comparados contra ele.
const DEFAULT_PAIRS = [
  {reference: 'wc', against: 'react'},
  {reference: 'wc', against: 'angular'},
];

// Compara cada par (reference x against) com writeDiff e GRAVA os PNGs de diff
// em <runDir>/diff/<against>-vs-<reference>/. Retorna os grupos com parity[].
function computeParity(groups, runDir, {pairs = DEFAULT_PAIRS} = {}) {
  return groups.map(g => {
    const parity = [];
    for (const {reference, against} of pairs) {
      if (g[reference] && g[against]) {
        const brand = assertSafePathSegment(g._cell.brand, 'brand');
        const storyId = assertSafePathSegment(g._cell.storyId, 'storyId');
        const viewport = assertSafePathSegment(g._cell.viewport, 'viewport');
        const theme = assertSafePathSegment(g._cell.theme, 'theme');
        const diffRel = path.join('diff', `${against}-vs-${reference}`, `${brand}-${storyId}-${viewport}-${theme}.png`);
        const {mismatch, width, height} = writeDiff(
          path.join(runDir, g[reference]), path.join(runDir, g[against]),
          ensureDir(path.join(runDir, diffRel)),
          {fit: 'intersection'},
        );
        parity.push({against, mismatch, width, height, diffPath: diffRel});
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
