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
const {capturePipeline} = require('@gol-smiles/anemoi-web/src/pipeline');
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

    const diagnosticsDir = path.join(runDir, 'logs');
    const frameworks = [...new Set(cells.map(cell => cell.framework))];

    const {manifest} = await capturePipeline({
      cells: cells.map(cell => ({...cell, diagnosticsDir})),
      acquireHost: async (framework) => {
        // O 1o run por framework paga o build do harness (bloqueante); os seguintes reusam.
        store.patch(run.runId, {stage: `preparando harness ${framework}`});
        const {host, url} = await pool.acquire(framework, config.dsRepo);
        return {host, url};
      },
      runDir,
      pairs: [{reference: 'react', against: 'angular'}],
      statusFromParity: true,
      manifestMeta: {
        tool: 'Anemoi Service',
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
        compareState: state,
      },
      onStage: (s) => { stage = s; store.patch(run.runId, {stage: s}); },
      onProgress: ({framework, index, total}) =>
        store.patch(run.runId, {stage: `capturando ${framework} ${index}/${total}`}),
    });

    const parities = manifest.groups.flatMap(group => group.parity);
    store.transition(run.runId, manifest.status, {
      stage: null,
      summary: {
        cells: manifest.cellCount,
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
