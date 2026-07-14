'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {createRunStore} = require('../src/runStore');
const {createQueue} = require('../src/queue');

test('create gera run queued com uuid', () => {
  const store = createRunStore();
  const run = store.create({component: 'tgr-button', card: 'koba'});
  assert.match(run.runId, /^[0-9a-f-]{36}$/);
  assert.equal(run.status, 'queued');
  assert.equal(store.get(run.runId), run);
  assert.equal(store.get('nao-existe'), null);
});

test('transition segue a maquina de estados e rejeita saltos', () => {
  const store = createRunStore();
  const run = store.create({component: 'tgr-button', card: 'koba'});
  store.transition(run.runId, 'running', {stage: 'capture'});
  assert.equal(store.get(run.runId).stage, 'capture');
  store.transition(run.runId, 'passed', {stage: null, summary: {cells: 2}});
  assert.equal(store.get(run.runId).status, 'passed');
  assert.throws(() => store.transition(run.runId, 'running'), /Transicao invalida/);
});

test('transition rejeita queued -> passed', () => {
  const store = createRunStore();
  const run = store.create({component: 'tgr-button', card: 'koba'});
  assert.throws(() => store.transition(run.runId, 'passed'), /Transicao invalida/);
});

test('fila executa em ordem e sobrevive a job que rejeita', async () => {
  const queue = createQueue();
  const order = [];
  const first = queue.enqueue(async () => { order.push('a'); throw new Error('boom'); });
  const second = queue.enqueue(async () => { order.push('b'); });
  await first.catch(() => {});
  await second;
  assert.deepEqual(order, ['a', 'b']);
});
