'use strict';
// Seam CompareState (Koba) ⇄ celulas (Anemoi).
// A normalizacao espelha o parseCompareState do Koba: estado efetivo =
// defaults do catalogo + overrides enviados. O hash da identidade estavel
// a evidencia de um estado ad-hoc.

const {createHash} = require('node:crypto');
const {buildMatrix} = require('@gol-smiles/anemoi-core');
const {VIEWPORT_WIDTHS} = require('@gol-smiles/anemoi-web');

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.keys(value).sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function stateHash(state) {
  return createHash('sha256').update(stableStringify(state)).digest('hex').slice(0, 8);
}

function normalizeCompareState(compareState, catalog) {
  const entry = catalog.find(component => component.key === compareState.componentKey);
  if (!entry) {
    const error = new Error(
      `componentKey desconhecido no catalogo do Koba: "${compareState.componentKey}". `
      + 'Confira GET /catalog.json — o Koba descartaria esse estado silenciosamente.',
    );
    error.code = 'UNKNOWN_COMPONENT';
    throw error;
  }
  const defaultSlots = Object.fromEntries((entry.slots || []).map(slot => [slot.name, slot.defaultContent]));
  return {
    componentKey: entry.key,
    // tag do custom element (ex.: 'tgr-button'). A key do catalogo ('button') e o
    // nome da rota do Koba; os harnesses do motor proprio precisam da TAG no ?c=.
    tag: entry.tag || entry.key,
    props: {...(entry.initialArgs || {}), ...(compareState.props || {})},
    slots: {...defaultSlots, ...(compareState.slots || {})},
  };
}

const SERVICE_FRAMEWORKS = ['react', 'angular'];

function compareStateToCells(state, {viewports = ['sm', 'lg']} = {}) {
  const hash = stateHash(state);
  const story = {id: `koba-state-${hash}`, name: `estado ${hash}`};
  const cells = buildMatrix({
    frameworks: SERVICE_FRAMEWORKS,
    stories: [story],
    brands: ['gol'],
    themes: ['light'],
    viewports,
    viewportWidths: VIEWPORT_WIDTHS,
  });
  // Os harnesses do motor proprio leem props (args) e slots da querystring —
  // nao um `state` opaco. Mapeamos aqui: args = props, slots = slots.
  // `state` fica na celula so para diagnostico/manifesto.
  return cells.map(cell => ({
    ...cell,
    // harness usa a TAG no ?c= (fallback p/ componentKey em estados sem catalogo).
    component: state.tag || state.componentKey,
    args: state.props,
    slots: state.slots,
    state,
  }));
}

module.exports = {stableStringify, stateHash, normalizeCompareState, compareStateToCells};
