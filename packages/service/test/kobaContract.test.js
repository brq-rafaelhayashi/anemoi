'use strict';
// Contrato implicito com o repo koba (matheusBrqRocha/koba):
// GET /catalog.json  (root-config/src/catalog/types.ts) — key, initialArgs, slots.
//
// Desde que o servico passou a renderizar pelo motor proprio do Anemoi (harnesses
// isolados) em vez de fotografar a UI viva do Koba, este e o UNICO acoplamento
// com o Koba: o formato do catalogo. Se o shape mudar la, este teste quebra.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {normalizeCompareState} = require('../src/stateAdapter');

const CATALOG = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'koba-catalog.json'), 'utf8'));

// Copia fiel do parseCompareState do Koba (compareState.ts) — o estado efetivo
// que o Koba aplicaria dado um override sobre os defaults do catalogo.
function kobaDefaultState(component) {
  return {
    componentKey: component.key,
    props: {...component.initialArgs},
    slots: Object.fromEntries(component.slots.map(slot => [slot.name, slot.defaultContent])),
  };
}

test('normalizeCompareState aceita o shape real do catalogo do Koba e resolve a tag', () => {
  const state = normalizeCompareState(
    {componentKey: 'button', props: {label: 'Pagar'}, slots: {}},
    CATALOG,
  );
  // A key do catalogo ('button') != a tag do custom element ('tgr-button').
  // Os harnesses do motor proprio renderizam pela TAG, entao ela precisa ser resolvida aqui.
  assert.equal(state.componentKey, 'button');
  assert.equal(state.tag, 'tgr-button');
  assert.deepEqual(state.props, {label: 'Pagar', variant: 'primary', disabled: false});
  assert.deepEqual(state.slots, {icon: ''});
});

test('normalizeCompareState = defaults do catalogo + overrides (mesma regra do Koba) + tag', () => {
  const override = {componentKey: 'button', props: {label: 'Pagar', disabled: true}, slots: {icon: '<b>!</b>'}};
  const state = normalizeCompareState(override, CATALOG);

  // O que o Koba aplicaria: merge do override sobre o default do catalogo.
  // O Anemoi acrescenta a `tag` resolvida (usada no render do motor proprio).
  const kobaApplied = {
    ...kobaDefaultState(CATALOG[0]),
    props: {...kobaDefaultState(CATALOG[0]).props, ...override.props},
    slots: {...kobaDefaultState(CATALOG[0]).slots, ...override.slots},
  };
  assert.deepEqual(state, {...kobaApplied, tag: CATALOG[0].tag});
});
