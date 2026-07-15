'use strict';
// Indice de runs em memoria. Reiniciou o servico, perdeu o indice —
// os bundles persistem em disco (mesma filosofia do CLI).

const {randomUUID} = require('node:crypto');

const TRANSITIONS = {
  queued: ['running'],
  running: ['passed', 'failed', 'error'],
  passed: [],
  failed: [],
  error: [],
};

function createRunStore() {
  const runs = new Map();

  return {
    create({component, card}) {
      const run = {
        runId: randomUUID(),
        status: 'queued',
        stage: null,
        component,
        card,
        runDir: null,
        summary: null,
        error: null,
        createdAt: new Date().toISOString(),
      };
      runs.set(run.runId, run);
      return run;
    },
    get(runId) {
      return runs.get(runId) || null;
    },
    transition(runId, status, patch = {}) {
      const run = runs.get(runId);
      if (!run) throw new Error(`Run desconhecido: ${runId}`);
      if (!TRANSITIONS[run.status].includes(status)) {
        throw new Error(`Transicao invalida: ${run.status} -> ${status}`);
      }
      return Object.assign(run, patch, {status});
    },
    patch(runId, patch) {
      const run = runs.get(runId);
      if (!run) throw new Error(`Run desconhecido: ${runId}`);
      return Object.assign(run, patch);
    },
  };
}

module.exports = {createRunStore};
