'use strict';
// Paridade da fase 1: react e a referencia, angular e comparado contra ele.
// (Na fase 2, com a rota WC no Koba, o baseline padrao-ouro volta a ser o WC.)

const fs = require('node:fs');
const path = require('node:path');
const {writeDiff, assertSafePathSegment} = require('@gol-smiles/anemoi-core');

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  return filePath;
}

function computeParityPair(groups, runDir, {reference = 'react', against = 'angular'} = {}) {
  return groups.map(group => {
    const parity = [];
    if (group[reference] && group[against]) {
      const brand = assertSafePathSegment(group._cell.brand, 'brand');
      const storyId = assertSafePathSegment(group._cell.storyId, 'storyId');
      const viewport = assertSafePathSegment(group._cell.viewport, 'viewport');
      const theme = assertSafePathSegment(group._cell.theme, 'theme');
      const diffRel = path.join('diff', `${against}-vs-${reference}`, `${brand}-${storyId}-${viewport}-${theme}.png`);
      const {mismatch} = writeDiff(
        path.join(runDir, group[reference]),
        path.join(runDir, group[against]),
        ensureDir(path.join(runDir, diffRel)),
        {fit: 'intersection'},
      );
      parity.push({against, mismatch, diffPath: diffRel});
    }
    const {_cell, ...rest} = group;
    return {...rest, parity};
  });
}

module.exports = {computeParityPair};
