const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/contracts.ts')).href);
}

const scenes = [{id: 'primary', name: 'Primary', component: 'tgr-button', args: {}, slots: {}}];

test('validateContract calcula cobertura integral', async () => {
  const {defineContract, validateContract} = await subject();
  const contract = defineContract({
    schemaVersion: 1,
    consumer: 'tangerina',
    component: 'tgr-button',
    requiredBehaviors: ['activate', 'focus'],
    routes: [{id: 'activate-with-keyboard', sceneId: 'primary', covers: ['activate', 'focus']}],
  });
  assert.deepEqual(validateContract(contract, scenes), {
    required: ['activate', 'focus'],
    covered: ['activate', 'focus'],
    missing: [],
  });
});

test('validateContract informa lacuna sem transformar ausencia em aprovacao', async () => {
  const {validateContract} = await subject();
  const contract = {
    schemaVersion: 1, consumer: 'tangerina', component: 'tgr-button',
    requiredBehaviors: ['activate', 'disabled'],
    routes: [{id: 'activate', sceneId: 'primary', covers: ['activate']}],
  };
  assert.deepEqual(validateContract(contract, scenes).missing, ['disabled']);
});

test('validateContract rejeita rota duplicada, cena ausente e cobertura desconhecida', async () => {
  const {validateContract} = await subject();
  const base = {
    schemaVersion: 1, consumer: 'tangerina', component: 'tgr-button',
    requiredBehaviors: ['activate'],
  };
  assert.throws(() => validateContract({...base, routes: [
    {id: 'same', sceneId: 'primary', covers: ['activate']},
    {id: 'same', sceneId: 'primary', covers: ['activate']},
  ]}, scenes), /Roteiro duplicado/);
  assert.throws(() => validateContract({...base, routes: [
    {id: 'x', sceneId: 'missing', covers: ['activate']},
  ]}, scenes), /Cena inexistente/);
  assert.throws(() => validateContract({...base, routes: [
    {id: 'x', sceneId: 'primary', covers: ['unknown']},
  ]}, scenes), /comportamento nao declarado/);
});
