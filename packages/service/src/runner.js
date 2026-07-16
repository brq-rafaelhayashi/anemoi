'use strict';
// Executa um run: renderiza o componente ISOLADO pelo motor proprio do Anemoi
// (harnesses react/angular, um por framework), computa paridade react x angular
// e publica o bundle padrao do Anemoi no checkout do DS.
//
// Nao fotografa a UI viva do Koba: os harnesses recebem props/slots do
// compareState via querystring e renderizam so o componente (#evidence-root).
// Os harnesses buildados vem do harnessPool (build 1x + cache + serve).
// Nunca rejeita: todo caminho termina num status consultavel do run.

const fs = require('node:fs');
const path = require('node:path');
const {captureCells, buildManifest, writeManifest, writeSummary, renderHtml} = require('@gol-smiles/anemoi-core');
const {groupByCell, computeParity} = require('@gol-smiles/anemoi-web/src/parity');
const {createRunDir} = require('@gol-smiles/anemoi-web/src/run');
const {writeFailureManifest} = require('@gol-smiles/anemoi-web/src/failure');

async function executeRun({run, store, cells, state, config, pool}) {
  let stage = 'run-dir';
  let runDir = null;

  try {
    store.transition(run.runId, 'running', {stage});
    runDir = createRunDir(config.dsRepo, run.card, run.component);
    fs.mkdirSync(runDir, {recursive: true});
    store.patch(run.runId, {runDir});

    stage = 'capture';
    store.patch(run.runId, {stage});
    const diagnosticsDir = path.join(runDir, 'logs');
    // Frameworks presentes nas celulas (react, angular), em ordem estavel.
    const frameworks = [...new Set(cells.map(cell => cell.framework))];
    const captures = [];
    for (const framework of frameworks) {
      const cellsForFramework = cells.filter(cell => cell.framework === framework);
      if (cellsForFramework.length === 0) continue;
      // O 1o run por framework paga o build do harness (bloqueante); os seguintes reusam.
      store.patch(run.runId, {stage: `preparando harness ${framework}`});
      const {host, url} = await pool.acquire(framework, config.dsRepo);
      const cellsWithDiagnostics = cellsForFramework.map(cell => ({...cell, diagnosticsDir}));
      const captured = await captureCells(cellsWithDiagnostics, host, url, runDir, {
        onProgress: (i, total) => store.patch(run.runId, {stage: `capturando ${framework} ${i}/${total}`}),
      });
      captures.push(...captured);
    }

    stage = 'parity';
    store.patch(run.runId, {stage});
    const groups = computeParity(groupByCell(captures), runDir, {pairs: [{reference: 'react', against: 'angular'}]});

    stage = 'output';
    store.patch(run.runId, {stage});
    const parities = groups.flatMap(group => group.parity);
    const totalMismatch = parities.reduce((sum, parity) => sum + parity.mismatch, 0);
    const status = totalMismatch === 0 ? 'passed' : 'failed';

    const manifest = buildManifest({
      tool: 'Anemoi Service',
      status,
      card: run.card,
      component: run.component,
      mode: 'koba-state',
      parityLabel: 'Paridade vs react',
      axes: {
        frameworks,
        stories: [cells[0].storyName],
        themes: ['light'],
        viewports: [...new Set(cells.map(cell => cell.viewport))],
        brands: ['gol'],
      },
      cellCount: captures.length,
      groups,
      compareState: state,
      runDir,
    });
    writeManifest(runDir, manifest);
    writeSummary(runDir, manifest);
    fs.writeFileSync(path.join(runDir, 'index.html'), renderHtml(manifest), 'utf8');

    store.transition(run.runId, status, {
      stage: null,
      summary: {
        cells: captures.length,
        mismatches: parities.filter(parity => parity.mismatch > 0).length,
        maxMismatchPx: parities.length ? Math.max(...parities.map(parity => parity.mismatch)) : 0,
      },
    });
  } catch (error) {
    // Assentar o erro nunca pode lancar: o run pode estar desconhecido ou
    // ja terminal (ex.: reexecucao), e a transicao 'running' inicial pode
    // ter sido a propria causa do erro. Todo caminho precisa resolver.
    try {
      if (runDir) {
        writeFailureManifest(runDir, {stage, card: run.card, component: run.component}, error);
      }
    } catch (_manifestError) {
      // Ignorado: nao deixar falha ao gravar o manifesto de erro rejeitar o run.
    }
    try {
      store.transition(run.runId, 'error', {stage, error: error.message});
    } catch (_storeError) {
      // Ignorado: run desconhecido ou ja terminal — nao ha nada mais a fazer.
    }
  }
}

module.exports = {executeRun};
