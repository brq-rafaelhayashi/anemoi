'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('barrel publica a interface consumida pelo service e pelo CLI', () => {
  const api = require('../src/index');
  const fns = [
    'capturePipeline', 'groupByCell', 'computeParity',
    'createRunDir', 'prepareCapture', 'runCurrentState',
    'writeFailureManifest',
    'readLocalConfig', 'resolveRepository',
    'assertCaptureReady', 'runDoctor',
    'makeWcHost', 'makeReactHost', 'makeAngularHost',
  ];
  for (const name of fns) {
    assert.equal(typeof api[name], 'function', `esperava function em api.${name}`);
  }
  assert.equal(typeof api.VIEWPORT_WIDTHS, 'object', 'esperava VIEWPORT_WIDTHS');
});
