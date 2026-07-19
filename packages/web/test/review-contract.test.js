const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

test('reviewContract nao grava sem confirmacao explicita', async () => {
  const {reviewContract} = await import(pathToFileURL(path.resolve(__dirname, '../src/runner/reviewContract.ts')).href);
  let writes = 0;
  const result = await reviewContract({
    repo: '/repo',
    component: 'tgr-button',
    confirm: async () => 'n',
    write: () => {},
  }, {
    readReviewedFingerprint: () => ({digest: 'old'}),
    readPublicSurface: () => ({}),
    createFingerprint: () => ({digest: 'new'}),
    diffFingerprints: () => [{path: 'wc.events', kind: 'added', value: 'tgrClick'}],
    writeReviewedFingerprint: () => { writes += 1; },
  });
  assert.equal(result.updated, false);
  assert.equal(writes, 0);
});

test('reviewContract grava somente depois de yes', async () => {
  const {reviewContract} = await import(pathToFileURL(path.resolve(__dirname, '../src/runner/reviewContract.ts')).href);
  let writes = 0;
  const result = await reviewContract({
    repo: '/repo',
    component: 'tgr-button',
    confirm: async () => 'yes',
    write: () => {},
  }, {
    readReviewedFingerprint: () => ({digest: 'old'}),
    readPublicSurface: () => ({}),
    createFingerprint: () => ({digest: 'new'}),
    diffFingerprints: () => [{path: 'wc.events', kind: 'added', value: 'tgrClick'}],
    writeReviewedFingerprint: () => { writes += 1; },
  });
  assert.equal(result.updated, true);
  assert.equal(writes, 1);
});
