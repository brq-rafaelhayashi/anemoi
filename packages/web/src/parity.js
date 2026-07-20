const fs = require('node:fs');
const path = require('node:path');
const {
  writeDiff,
  assertSafePathSegment,
  assertSafeRelativePath,
  resolveContainedPath,
} = require('@gol-smiles/anemoi-core');

function keyOf(c) {
  return [c.browser || 'legacy', c.brand, c.storyId || c.sceneId, c.viewport, c.theme].join('|');
}

// Agrupa capturas por celula visual; cada grupo expoe wc/react/angular relPaths.
function groupByCell(captures) {
  const map = new Map();
  for (const c of captures) {
    const k = keyOf(c);
    if (!map.has(k)) {
      map.set(k, {
        browser: c.browser || null,
        brand: c.brand,
        storyId: c.storyId || c.sceneId,
        story: c.storyName,
        viewport: c.viewport,
        theme: c.theme,
        label: `${c.browser ? `${c.browser} · ` : ''}${c.brand} · ${c.storyName} · ${c.viewport} · ${c.theme}`,
        _cell: c,
      });
    }
    const group = map.get(k);
    group[c.framework] = c.relPath;
    if (c.a11y) {
      group._a11y = group._a11y || {};
      group._a11y[c.framework] = c.a11y;
    }
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
// O diff usa a uniao das dimensoes (fit default do core): area que existe em
// apenas um dos lados conta como divergencia, e sizeMatch registra se as
// capturas tinham o mesmo tamanho.
function computeParity(groups, runDir, {pairs = DEFAULT_PAIRS, artifactPrefix = ''} = {}) {
  const safeArtifactPrefix = assertSafeRelativePath(
    artifactPrefix,
    'artifactPrefix',
    {allowEmpty: true},
  );
  return groups.map(g => {
    const parity = [];
    for (const {reference, against} of pairs) {
      if (g[reference] && g[against]) {
        const brand = assertSafePathSegment(g._cell.brand, 'brand');
        const storyId = assertSafePathSegment(g._cell.storyId, 'storyId');
        const viewport = assertSafePathSegment(g._cell.viewport, 'viewport');
        const theme = assertSafePathSegment(g._cell.theme, 'theme');
        const browser = g._cell.browser
          ? assertSafePathSegment(g._cell.browser, 'browser')
          : null;
        const diffSegments = safeArtifactPrefix ? [safeArtifactPrefix, 'diff'] : ['diff'];
        if (browser) diffSegments.push(browser);
        diffSegments.push(
          `${against}-vs-${reference}`,
          `${brand}-${storyId}-${viewport}-${theme}.png`,
        );
        const diffRel = path.join(...diffSegments);
        const {mismatch, width, height, sizeMatch, beforeSize, afterSize} = writeDiff(
          path.join(runDir, g[reference]), path.join(runDir, g[against]),
          ensureDir(resolveContainedPath(runDir, diffRel, 'diff artifact path')),
        );
        parity.push({
          against, mismatch, width, height, sizeMatch,
          referenceSize: beforeSize, againstSize: afterSize,
          diffPath: diffRel,
        });
      }
    }
    return {...g, parity};
  });
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), {recursive: true});
  return p;
}

module.exports = {groupByCell, computeParity, DEFAULT_PAIRS};
