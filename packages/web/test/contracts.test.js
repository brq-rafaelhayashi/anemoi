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

test('validateContract rejeita IDs de cena vazios ou duplicados', async () => {
  const {validateContract} = await subject();
  const contract = {
    schemaVersion: 1, consumer: 'tangerina', component: 'tgr-button',
    requiredBehaviors: ['activate'], routes: [],
  };
  assert.throws(() => validateContract(contract, [
    {...scenes[0], id: ' '},
  ]), /ID de Cena invalido/);
  assert.throws(() => validateContract(contract, [
    scenes[0], {...scenes[0]},
  ]), /Cena duplicada: primary/);
});

test('validateContract rejeita comportamentos obrigatorios vazios ou duplicados', async () => {
  const {validateContract} = await subject();
  const base = {
    schemaVersion: 1, consumer: 'tangerina', component: 'tgr-button', routes: [],
  };
  assert.throws(() => validateContract({
    ...base, requiredBehaviors: [' '],
  }, scenes), /ID de comportamento obrigatorio invalido/);
  assert.throws(() => validateContract({
    ...base, requiredBehaviors: ['activate', 'activate'],
  }, scenes), /Comportamento obrigatorio duplicado: activate/);
});

test('validateContract rejeita IDs de roteiro vazios ou duplicados', async () => {
  const {validateContract} = await subject();
  const base = {
    schemaVersion: 1, consumer: 'tangerina', component: 'tgr-button',
    requiredBehaviors: ['activate'],
  };
  assert.throws(() => validateContract({...base, routes: [
    {id: ' ', sceneId: 'primary', covers: ['activate']},
  ]}, scenes), /ID de Roteiro invalido/);
  assert.throws(() => validateContract({...base, routes: [
    {id: 'same', sceneId: 'primary', covers: ['activate']},
    {id: 'same', sceneId: 'primary', covers: ['activate']},
  ]}, scenes), /Roteiro duplicado: same/);
});

test('validateContract rejeita referencias de cena e comportamento vazias ou repetidas', async () => {
  const {validateContract} = await subject();
  const base = {
    schemaVersion: 1, consumer: 'tangerina', component: 'tgr-button',
    requiredBehaviors: ['activate'],
  };
  assert.throws(() => validateContract({...base, routes: [
    {id: 'x', sceneId: ' ', covers: ['activate']},
  ]}, scenes), /Roteiro x possui referencia de Cena invalida/);
  assert.throws(() => validateContract({...base, routes: [
    {id: 'x', sceneId: 'primary', covers: [' ']},
  ]}, scenes), /Roteiro x possui referencia de comportamento invalida/);
  assert.throws(() => validateContract({...base, routes: [
    {id: 'x', sceneId: 'primary', covers: []},
  ]}, scenes), /Roteiro x nao referencia comportamentos/);
  assert.throws(() => validateContract({...base, routes: [
    {id: 'x', sceneId: 'primary', covers: ['activate', 'activate']},
  ]}, scenes), /Roteiro x possui referencia de comportamento duplicada: activate/);
});

test('validateContract rejeita comportamento referenciado por roteiros distintos', async () => {
  const {validateContract} = await subject();
  const contract = {
    schemaVersion: 1, consumer: 'tangerina', component: 'tgr-button',
    requiredBehaviors: ['activate'],
    routes: [
      {id: 'r1', sceneId: 'primary', covers: ['activate']},
      {id: 'r2', sceneId: 'primary', covers: ['activate']},
    ],
  };
  assert.throws(() => validateContract(contract, scenes),
    /Roteiro r2 possui referencia de comportamento duplicada: activate; ja referenciada pelo Roteiro r1/);
});
