'use strict';
// Seam CompareState (Koba) ⇄ celulas (Anemoi).
// A normalizacao espelha o parseCompareState do Koba: estado efetivo =
// defaults do catalogo + overrides enviados. O hash da identidade estavel
// a evidencia de um estado ad-hoc.

const {createHash} = require('node:crypto');

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
    props: {...(entry.initialArgs || {}), ...(compareState.props || {})},
    slots: {...defaultSlots, ...(compareState.slots || {})},
  };
}

module.exports = {stableStringify, stateHash, normalizeCompareState};
