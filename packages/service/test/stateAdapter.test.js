'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {stableStringify, stateHash, normalizeCompareState} = require('../src/stateAdapter');

const CATALOG = [{
  key: 'tgr-button',
  tag: 'tgr-button',
  name: 'Button',
  initialArgs: {label: 'Comprar', variant: 'primary'},
  slots: [{name: 'icon', defaultContent: ''}],
  props: [], events: [],
}];

test('stableStringify ordena chaves recursivamente', () => {
  assert.equal(
    stableStringify({b: 1, a: {d: [2, {z: 3, y: 4}], c: 5}}),
    '{"a":{"c":5,"d":[2,{"y":4,"z":3}]},"b":1}',
  );
});

test('stateHash e estavel independente da ordem das chaves', () => {
  const h1 = stateHash({componentKey: 'tgr-button', props: {a: 1, b: 2}, slots: {}});
  const h2 = stateHash({props: {b: 2, a: 1}, slots: {}, componentKey: 'tgr-button'});
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{8}$/);
});

test('normalizeCompareState faz merge sobre os defaults do catalogo', () => {
  const state = normalizeCompareState(
    {componentKey: 'tgr-button', props: {label: 'Pagar'}, slots: {}},
    CATALOG,
  );
  assert.deepEqual(state, {
    componentKey: 'tgr-button',
    props: {label: 'Pagar', variant: 'primary'},
    slots: {icon: ''},
  });
});

test('normalizeCompareState rejeita componentKey desconhecido com code', () => {
  assert.throws(
    () => normalizeCompareState({componentKey: 'tgr-nao-existe', props: {}, slots: {}}, CATALOG),
    (error) => error.code === 'UNKNOWN_COMPONENT' && /tgr-nao-existe/.test(error.message),
  );
});
