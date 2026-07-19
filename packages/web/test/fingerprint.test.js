const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const FIXTURE = path.join(__dirname, 'fixtures', 'public-surface');

async function modules() {
  return Promise.all([
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/publicSurface.ts')).href),
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/fingerprint.ts')).href),
  ]);
}

test('readPublicSurface combina WC, React e Angular de forma canonica', async () => {
  const [{readPublicSurface}] = await modules();
  const surface = readPublicSurface('/unused', 'tgr-button', {
    cemPath: path.join(FIXTURE, 'custom-elements.json'),
    reactPath: path.join(FIXTURE, 'react.d.ts'),
    angularPath: path.join(FIXTURE, 'angular.d.ts'),
  });
  assert.deepEqual(surface.wc.attributes, [{name: 'disabled', type: 'boolean'}]);
  assert.deepEqual(surface.wc.events, [{name: 'tgrClick', type: 'CustomEvent<{clicked: true}>'}]);
  assert.deepEqual(surface.wc.slots, ['', 'icon']);
  assert.deepEqual(surface.react, {exportName: 'TgrButton', events: ['onTgrClick']});
  assert.deepEqual(surface.angular, {selector: 'tgr-button', inputs: ['disabled'], outputs: ['tgrClick'], projectableSlots: ['*']});
});

test('fingerprint e diff sao deterministas e legiveis', async () => {
  const [, {createFingerprint, diffFingerprints}] = await modules();
  const base = {
    component: 'tgr-button',
    wc: {attributes: [], properties: [], events: [], slots: []},
    react: {exportName: 'TgrButton', events: []},
    angular: {selector: 'tgr-button', inputs: [], outputs: [], projectableSlots: []},
  };
  const first = createFingerprint(base);
  const second = createFingerprint({...base, wc: {...base.wc, slots: ['icon']}});
  assert.match(first.digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(createFingerprint(base), first);
  assert.deepEqual(diffFingerprints(first, second), [{path: 'wc.slots', kind: 'added', value: 'icon'}]);
});

test('writeReviewedFingerprint usa JSON formatado com newline', async t => {
  const [, {createFingerprint, writeReviewedFingerprint, readReviewedFingerprint}] = await modules();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-fingerprint-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'fingerprint.json');
  const fingerprint = createFingerprint({component: 'x', wc: {attributes: [], properties: [], events: [], slots: []}, react: {exportName: 'X', events: []}, angular: {selector: 'x', inputs: [], outputs: [], projectableSlots: []}});
  writeReviewedFingerprint(file, fingerprint);
  assert.equal(fs.readFileSync(file, 'utf8').endsWith('\n'), true);
  assert.deepEqual(readReviewedFingerprint(file), fingerprint);
});
