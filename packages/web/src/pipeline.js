'use strict';
// Nucleo compartilhado do run: captura -> paridade -> manifesto/galeria.
// CLI (run.js) e service (runner.js) sao callers finos por cima deste modulo:
// fornecem as celulas prontas e um acquireHost(framework) -> {host, url, release?}.
// Erros propagam para o caller (que decide entre process.exit e run store).

const fs = require('node:fs');
const path = require('node:path');
const {
  captureCells,
  buildManifest,
  writeManifest,
  writeSummary,
  renderHtml,
} = require('@gol-smiles/anemoi-core');
const {groupByCell, computeParity} = require('./parity');

async function capturePipeline({
  cells,
  acquireHost,
  runDir,
  pairs,
  manifestMeta,
  statusFromParity = false,
  onStage = () => {},
  onProgress = () => {},
}) {
  onStage('capture');
  // Ordem estavel: frameworks na ordem de aparicao das celulas.
  const frameworks = [...new Set(cells.map(cell => cell.framework))];
  const captures = [];
  for (const framework of frameworks) {
    const cellsForFramework = cells.filter(cell => cell.framework === framework);
    const {host, url, release} = await acquireHost(framework);
    try {
      const captured = await captureCells(cellsForFramework, host, url, runDir, {
        onProgress: (index, total, relPath) => onProgress({framework, index, total, relPath}),
      });
      captures.push(...captured);
    } finally {
      if (release) await release();
    }
  }

  onStage('parity');
  const groups = computeParity(groupByCell(captures), runDir, pairs ? {pairs} : {});

  onStage('output');
  const parities = groups.flatMap(group => group.parity);
  const status = statusFromParity && hasParityDivergence(parities) ? 'failed' : 'passed';
  const manifest = buildManifest({
    ...manifestMeta,
    status,
    cellCount: captures.length,
    groups,
    runDir,
  });
  writeManifest(runDir, manifest);
  writeSummary(runDir, manifest);
  fs.writeFileSync(path.join(runDir, 'index.html'), renderHtml(manifest), 'utf8');

  return {manifest, captures, groups};
}

// Divergencia de paridade: pixels diferentes OU capturas com dimensoes
// distintas. sizeMatch ausente (parity entries antigos) nao diverge.
function hasParityDivergence(parities) {
  return parities.some(parity => parity.mismatch > 0 || parity.sizeMatch === false);
}

module.exports = {capturePipeline, hasParityDivergence};
