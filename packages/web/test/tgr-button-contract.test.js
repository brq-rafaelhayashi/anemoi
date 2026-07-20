const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const DIR = path.resolve(__dirname, '../contracts/tangerina/tgr-button');

test('tgr-button possui cobertura integral e fingerprint revisado', async () => {
  const [{contract}, {scenes}, {validateContract}] = await Promise.all([
    import(pathToFileURL(path.join(DIR, 'contract.ts')).href),
    import(pathToFileURL(path.join(DIR, 'scenes.ts')).href),
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/contracts.ts')).href),
  ]);
  assert.deepEqual(validateContract(contract, scenes).missing, []);
  assert.equal(new Set(scenes.map(scene => scene.id)).size, scenes.length);
  const fingerprint = JSON.parse(fs.readFileSync(path.join(DIR, 'fingerprint.json'), 'utf8'));
  assert.equal(fingerprint.schemaVersion, 1);
  assert.equal(fingerprint.component, 'tgr-button');
  assert.match(fingerprint.digest, /^[a-f0-9]{64}$/);
});
