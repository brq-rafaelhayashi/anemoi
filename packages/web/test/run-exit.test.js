'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {resolveExitCode, resolveA11yFlags} = require('../src/run-legacy');

test('resolveExitCode: 1 somente quando um gate ligado divergiu', () => {
  assert.equal(resolveExitCode({parityDiverged: true}, {failOnDiff: true}), 1);
  assert.equal(resolveExitCode({parityDiverged: true}, {failOnDiff: false}), 0);
  assert.equal(resolveExitCode({a11yDiverged: true}, {failOnA11y: true}), 1);
  assert.equal(resolveExitCode({a11yDiverged: true}, {failOnA11y: false}), 0);
  // Gates independentes: um nao dispara pelo outro.
  assert.equal(resolveExitCode({a11yDiverged: true}, {failOnDiff: true}), 0);
  assert.equal(resolveExitCode({parityDiverged: true}, {failOnA11y: true}), 0);
  assert.equal(resolveExitCode({parityDiverged: true, a11yDiverged: true}, {failOnDiff: true, failOnA11y: true}), 1);
  assert.equal(resolveExitCode({}, {failOnDiff: true, failOnA11y: true}), 0);
  assert.equal(resolveExitCode({}, {}), 0);
});

test('resolveA11yFlags: coleta ligada por padrao, gate opt-in, conflito rejeitado', () => {
  assert.deepEqual(resolveA11yFlags({}), {collectA11y: true, failOnA11y: false});
  assert.deepEqual(resolveA11yFlags({'fail-on-a11y': true}), {collectA11y: true, failOnA11y: true});
  assert.deepEqual(resolveA11yFlags({'no-a11y': true}), {collectA11y: false, failOnA11y: false});
  assert.throws(() => resolveA11yFlags({'no-a11y': true, 'fail-on-a11y': true}), /incompativeis/);
});
