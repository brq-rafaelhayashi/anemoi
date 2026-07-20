const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/verdict.ts')).href);
}

const passed = {status: 'passed', required: true, unavailable: 0, failed: 0};

function baseDimensions() {
  return {
    browserCoverage: passed, visualParity: passed, dimensions: passed, axe: passed, ariaParity: passed,
    behavioralConformance: passed, behavioralParity: passed, contractCoverage: passed, stability: passed,
  };
}

test('gate aprova somente com todas as dimensoes obrigatorias estaveis', async () => {
  const {buildConfidenceGate} = await subject();
  const gate = buildConfidenceGate({diagnostic: false, dimensions: baseDimensions()});
  assert.equal(gate.status, 'passed');
  assert.equal(gate.trusted, true);
});

test('indisponivel, failed, flaky ou matriz diagnostica nunca aprovam gate confiavel', async () => {
  const {buildConfidenceGate} = await subject();
  for (const dimension of [
    {...passed, status: 'failed', failed: 1},
    {...passed, status: 'unavailable', unavailable: 1},
  ]) {
    const gate = buildConfidenceGate({diagnostic: false, dimensions: {...baseDimensions(), stability: dimension}});
    assert.equal(gate.status, 'failed');
    assert.equal(gate.trusted, false);
  }
  const diagnostic = buildConfidenceGate({diagnostic: true, dimensions: baseDimensions()});
  assert.equal(diagnostic.trusted, false);
  assert.equal(diagnostic.status, 'not-approved');
});
