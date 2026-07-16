'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {resolveExitCode} = require('../src/run');

test('resolveExitCode: 1 somente com failOnDiff e status failed', () => {
  assert.equal(resolveExitCode({status: 'failed'}, {failOnDiff: true}), 1);
  assert.equal(resolveExitCode({status: 'failed'}, {failOnDiff: false}), 0);
  assert.equal(resolveExitCode({status: 'passed'}, {failOnDiff: true}), 0);
  assert.equal(resolveExitCode({status: 'passed'}, {}), 0);
});
