'use strict';
// Executa um run: captura os panes do Koba vivo, computa paridade
// react x angular e publica o bundle padrao do Anemoi no checkout do DS.
// Nunca rejeita: todo caminho termina num status consultavel do run.

const fs = require('node:fs');
const path = require('node:path');
const {captureCells, writeManifest, writeSummary, renderHtml} = require('@gol-smiles/anemoi-core');
const {groupByCell} = require('@gol-smiles/anemoi-web/src/parity');
const {createRunDir} = require('@gol-smiles/anemoi-web/src/run');
const {writeFailureManifest} = require('@gol-smiles/anemoi-web/src/failure');
const {computeParityPair} = require('./parityPair');
const {makeKobaHost} = require('./kobaHost');

async function executeRun({run, store, cells, state, config}) {
  let stage = 'run-dir';
  let runDir = null;

  try {
    store.transition(run.runId, 'running', {stage});
    runDir = createRunDir(config.dsRepo, run.card, run.component);
    fs.mkdirSync(runDir, {recursive: true});
    store.patch(run.runId, {runDir});

    stage = 'capture';
    store.patch(run.runId, {stage});
    const host = makeKobaHost();
    const diagnosticsDir = path.join(runDir, 'logs');
    const cellsWithDiagnostics = cells.map(cell => ({...cell, diagnosticsDir}));
    const captures = await captureCells(cellsWithDiagnostics, host, config.kobaBaseUrl, runDir, {
      onProgress: (i, total) => store.patch(run.runId, {stage: `capturando ${i}/${total}`}),
    });

    stage = 'parity';
    store.patch(run.runId, {stage});
    const groups = computeParityPair(groupByCell(captures), runDir);

    stage = 'output';
    store.patch(run.runId, {stage});
    const parities = groups.flatMap(group => group.parity);
    const totalMismatch = parities.reduce((sum, parity) => sum + parity.mismatch, 0);
    const status = totalMismatch === 0 ? 'passed' : 'failed';

    const manifest = {
      tool: 'Anemoi Service',
      status,
      card: run.card,
      component: run.component,
      mode: 'koba-state',
      layout: 'parity',
      parityLabel: 'Paridade vs react',
      axes: {
        frameworks: ['react', 'angular'],
        stories: [cells[0].storyName],
        themes: ['light'],
        viewports: [...new Set(cells.map(cell => cell.viewport))],
        brands: ['gol'],
      },
      cellCount: captures.length,
      groups,
      compareState: state,
      generatedAt: new Date().toISOString(),
      runDir,
    };
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
