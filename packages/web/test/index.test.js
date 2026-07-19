'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('barrel publica a interface consumida pelo service e pelo CLI', () => {
  const api = require('../src/index');
  const {makeWcHarnessHost} = require('../src/hosts/wc-harness');
  const fns = [
    'capturePipeline', 'groupByCell', 'computeParity',
    'createRunDir', 'prepareCapture', 'runCurrentState', 'runPlaywrightState',
    'writeFailureManifest',
    'readLocalConfig', 'resolveRepository',
    'assertCaptureReady', 'runDoctor',
    'makeWcHost', 'makeReactHost', 'makeAngularHost',
  ];
  for (const name of fns) {
    assert.equal(typeof api[name], 'function', `esperava function em api.${name}`);
  }
  assert.equal(typeof api.VIEWPORT_WIDTHS, 'object', 'esperava VIEWPORT_WIDTHS');
  assert.equal(api.makeWcHost, makeWcHarnessHost, 'makeWcHost deve ser o alias publico do harness canonico');
});
