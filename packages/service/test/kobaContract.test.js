'use strict';
// Contrato implicito com o repo koba (matheusBrqRocha/koba):
// 1. Shape do GET /catalog.json  (root-config/src/catalog/types.ts)
// 2. Formato do ?state=          (root-config/src/compare/compareState.ts)
// 3. Classes dos panes           (root-config/index.html)
// Se algo mudar la, estes testes quebram primeiro.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {normalizeCompareState} = require('../src/stateAdapter');
const {makeKobaHost} = require('../src/kobaHost');

const CATALOG = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'koba-catalog.json'), 'utf8'));
const FIXTURE_PAGE = fs.readFileSync(path.join(__dirname, 'fixtures', 'compare-page.html'), 'utf8');

// Copia fiel do parseCompareState do Koba (compareState.ts) — usada para
// provar o round-trip: o que o service serializa, o Koba aplica.
function kobaParseCompareState(search, fallback) {
  const params = new URLSearchParams(search);
  const raw = params.get('state');
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.componentKey !== fallback.componentKey) return fallback;
    return {
      componentKey: fallback.componentKey,
      props: {...fallback.props, ...parsed.props},
      slots: {...fallback.slots, ...parsed.slots},
    };
  } catch {
    return fallback;
  }
}

function kobaDefaultState(component) {
  return {
    componentKey: component.key,
    props: {...component.initialArgs},
    slots: Object.fromEntries(component.slots.map(slot => [slot.name, slot.defaultContent])),
  };
}

test('normalizeCompareState aceita o shape real do catalogo do Koba', () => {
  const state = normalizeCompareState(
    {componentKey: 'tgr-button', props: {label: 'Pagar'}, slots: {}},
    CATALOG,
  );
  assert.deepEqual(state.props, {label: 'Pagar', variant: 'primary', disabled: false});
  assert.deepEqual(state.slots, {icon: ''});
});

test('round-trip: o state serializado pelo host e o que o Koba aplicaria', () => {
  const state = normalizeCompareState(
    {componentKey: 'tgr-button', props: {label: 'Pagar', disabled: true}, slots: {icon: '<b>!</b>'}},
    CATALOG,
  );
  const host = makeKobaHost();
  const url = new URL(host.urlFor({component: state.componentKey, framework: 'react', state}, 'http://localhost:9000'));

  const applied = kobaParseCompareState(url.search, kobaDefaultState(CATALOG[0]));
  assert.deepEqual(applied, state);
});

test('fixture do /compare usa as classes reais dos panes do Koba', () => {
  for (const framework of ['react', 'angular']) {
    const selector = makeKobaHost().selectorFor({framework});
    assert.ok(
      FIXTURE_PAGE.includes(selector.slice(1)),
      `fixture compare-page.html deve conter a classe ${selector}`,
    );
  }
});
