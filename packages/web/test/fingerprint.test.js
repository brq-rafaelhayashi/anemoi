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

function withOverride(t, fixtureName, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-public-surface-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, fixtureName);
  fs.writeFileSync(file, contents);
  return {
    cemPath: path.join(FIXTURE, 'custom-elements.json'),
    reactPath: path.join(FIXTURE, 'react.d.ts'),
    angularPath: path.join(FIXTURE, 'angular.d.ts'),
    [fixtureName === 'react.d.ts' ? 'reactPath' : 'angularPath']: file,
  };
}

function publicSurface(component = 'tgr-button') {
  return {
    component,
    wc: {
      attributes: [{name: 'disabled', type: 'boolean'}],
      properties: [],
      events: [{name: 'tgrClick', type: 'CustomEvent'}],
      slots: ['', 'icon'],
    },
    react: {exportName: 'TgrButton', events: ['onTgrClick']},
    angular: {
      selector: component,
      inputs: ['disabled'],
      outputs: ['tgrClick'],
      projectableSlots: ['*'],
    },
  };
}

function fingerprintFile(t, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-reviewed-fingerprint-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'fingerprint.json');
  fs.writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents));
  return file;
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

test('readPublicSurface rejeita declaracao React que nao e exportada', async t => {
  const [{readPublicSurface}] = await modules();
  const overrides = withOverride(t, 'react.d.ts', [
    'type TgrButtonEvents = {onTgrClick: EventName<CustomEvent>};',
    'declare const TgrButton: StencilReactComponent<TgrButtonElement, TgrButtonEvents>;',
  ].join('\n'));
  assert.throws(() => readPublicSurface('/unused', 'tgr-button', overrides),
    /Wrapper React nao exporta TgrButton/);
});

test('readPublicSurface nao confunde export type React com export de valor', async t => {
  const [{readPublicSurface}] = await modules();
  const overrides = withOverride(t, 'react.d.ts', [
    'type TgrButtonEvents = {onTgrClick: EventName<CustomEvent>};',
    'declare const TgrButton: StencilReactComponent<TgrButtonElement, TgrButtonEvents>;',
    'export type {TgrButton};',
  ].join('\n'));
  assert.throws(() => readPublicSurface('/unused', 'tgr-button', overrides),
    /Wrapper React nao exporta TgrButton/);
});

test('readPublicSurface rejeita formato React sem event map reconhecivel', async t => {
  const [{readPublicSurface}] = await modules();
  const overrides = withOverride(t, 'react.d.ts', [
    'declare const TgrButton: UnknownWrapper<TgrButtonElement>;',
    'export {TgrButton};',
  ].join('\n'));
  assert.throws(() => readPublicSurface('/unused', 'tgr-button', overrides),
    /Wrapper React TgrButton possui formato de eventos nao reconhecido/);
});

test('readPublicSurface rejeita wrapper React arbitrario mesmo com event map', async t => {
  const [{readPublicSurface}] = await modules();
  const overrides = withOverride(t, 'react.d.ts', [
    'type Events = {onFake: EventName<CustomEvent>};',
    'declare const TgrButton: UnknownWrapper<X, Events>;',
    'export {TgrButton};',
  ].join('\n'));
  assert.throws(() => readPublicSurface('/unused', 'tgr-button', overrides),
    /Wrapper React TgrButton possui formato de eventos nao reconhecido/);
});

test('readPublicSurface rejeita member React que nao e PropertySignature EventName', async t => {
  const [{readPublicSurface}] = await modules();
  const overrides = withOverride(t, 'react.d.ts', [
    'type Events = {onFake(): void};',
    'declare const TgrButton: StencilReactComponent<X, Events>;',
    'export {TgrButton};',
  ].join('\n'));
  assert.throws(() => readPublicSurface('/unused', 'tgr-button', overrides),
    /Wrapper React TgrButton possui formato de eventos nao reconhecido/);
});

test('readPublicSurface aceita export declare const React direto', async t => {
  const [{readPublicSurface}] = await modules();
  const overrides = withOverride(t, 'react.d.ts', [
    'type DirectEvents = {onDirect: EventName<CustomEvent>};',
    'export declare const TgrButton: StencilReactComponent<TgrButtonElement, DirectEvents>;',
  ].join('\n'));
  assert.deepEqual(readPublicSurface('/unused', 'tgr-button', overrides).react,
    {exportName: 'TgrButton', events: ['onDirect']});
});

test('readPublicSurface resolve o local de export React com alias', async t => {
  const [{readPublicSurface}] = await modules();
  const overrides = withOverride(t, 'react.d.ts', [
    'type WrongEvents = {onWrong: EventName<CustomEvent>};',
    'type OtherEvents = {onRight: EventName<CustomEvent>};',
    'declare const TgrButton: StencilReactComponent<TgrButtonElement, WrongEvents>;',
    'declare const Other: StencilReactComponent<TgrButtonElement, OtherEvents>;',
    'export {Other as TgrButton};',
  ].join('\n'));
  assert.deepEqual(readPublicSurface('/unused', 'tgr-button', overrides).react,
    {exportName: 'TgrButton', events: ['onRight']});
});

test('readPublicSurface rejeita alias React cujo local nao existe', async t => {
  const [{readPublicSurface}] = await modules();
  const overrides = withOverride(t, 'react.d.ts', 'export {Missing as TgrButton};');
  assert.throws(() => readPublicSurface('/unused', 'tgr-button', overrides),
    /Wrapper React exporta TgrButton sem declarar Missing/);
});

test('readPublicSurface usa alias publico Angular e altera o fingerprint', async t => {
  const [{readPublicSurface}, {createFingerprint}] = await modules();
  const current = readPublicSurface('/unused', 'tgr-button', {
    cemPath: path.join(FIXTURE, 'custom-elements.json'),
    reactPath: path.join(FIXTURE, 'react.d.ts'),
    angularPath: path.join(FIXTURE, 'angular.d.ts'),
  });
  const overrides = withOverride(t, 'angular.d.ts', [
    'declare class TgrButton {',
    '  static ɵcmp: i0.ɵɵComponentDeclaration<TgrButton, "tgr-button", never, {',
    '    "disabled": {"alias": "isDisabled"; "required": false};',
    '  }, {}, never, ["*"], true, never>;',
    '}',
    'declare interface TgrButton { tgrClick: EventEmitter<CustomEvent>; }',
    'export {TgrButton};',
  ].join('\n'));
  const aliased = readPublicSurface('/unused', 'tgr-button', overrides);
  assert.deepEqual(aliased.angular.inputs, ['isDisabled']);
  assert.notEqual(createFingerprint(aliased).digest, createFingerprint(current).digest);
});

test('readPublicSurface rejeita mapping de inputs Angular desconhecido', async t => {
  const [{readPublicSurface}] = await modules();
  const overrides = withOverride(t, 'angular.d.ts', [
    'declare class TgrButton {',
    '  static ɵcmp: i0.ɵɵComponentDeclaration<TgrButton, "tgr-button", never, {',
    '    "disabled": boolean;',
    '  }, {}, never, ["*"], true, never>;',
    '}',
    'declare interface TgrButton { tgrClick: EventEmitter<CustomEvent>; }',
    'export {TgrButton};',
  ].join('\n'));
  assert.throws(() => readPublicSurface('/unused', 'tgr-button', overrides),
    /Wrapper Angular TgrButton possui mapping de inputs nao reconhecido/);
});

test('readPublicSurface usa alias publico do output Angular e altera fingerprint', async t => {
  const [{readPublicSurface}, {createFingerprint}] = await modules();
  const current = readPublicSurface('/unused', 'tgr-button', {
    cemPath: path.join(FIXTURE, 'custom-elements.json'),
    reactPath: path.join(FIXTURE, 'react.d.ts'),
    angularPath: path.join(FIXTURE, 'angular.d.ts'),
  });
  const overrides = withOverride(t, 'angular.d.ts', [
    'declare class TgrButton {',
    '  static ɵcmp: i0.ɵɵComponentDeclaration<TgrButton, "tgr-button", never, {',
    '    "disabled": {"alias": "disabled"; "required": false};',
    '  }, {"internalChange": "publicChange"}, never, ["*"], true, never>;',
    '}',
    'declare interface TgrButton { internalChange: EventEmitter<CustomEvent>; }',
    'export {TgrButton};',
  ].join('\n'));
  const aliased = readPublicSurface('/unused', 'tgr-button', overrides);
  assert.deepEqual(aliased.angular.outputs, ['publicChange']);
  assert.notEqual(createFingerprint(aliased).digest, createFingerprint(current).digest);
});

test('readPublicSurface aceita proxy Angular sem outputs', async t => {
  const [{readPublicSurface}] = await modules();
  const overrides = withOverride(t, 'angular.d.ts', [
    'declare class TgrButton {',
    '  static ɵcmp: i0.ɵɵComponentDeclaration<TgrButton, "tgr-button", never, {}, {}, never, ["*"], true, never>;',
    '}',
    'declare interface TgrButton extends Components.TgrButton {}',
    'export {TgrButton};',
  ].join('\n'));
  assert.deepEqual(readPublicSurface('/unused', 'tgr-button', overrides).angular.outputs, []);
});

test('readPublicSurface rejeita alias Angular sem EventEmitter interno correspondente', async t => {
  const [{readPublicSurface}] = await modules();
  const overrides = withOverride(t, 'angular.d.ts', [
    'declare class TgrButton {',
    '  static ɵcmp: i0.ɵɵComponentDeclaration<TgrButton, "tgr-button", never, {},',
    '    {"internalChange": "publicChange"}, never, ["*"], true, never>;',
    '}',
    'declare interface TgrButton extends Components.TgrButton {}',
    'export {TgrButton};',
  ].join('\n'));
  assert.throws(() => readPublicSurface('/unused', 'tgr-button', overrides),
    /Wrapper Angular TgrButton referencia output interno nao declarado: internalChange/);
});

test('readPublicSurface rejeita mapping de outputs Angular desconhecido', async t => {
  const [{readPublicSurface}] = await modules();
  const overrides = withOverride(t, 'angular.d.ts', [
    'declare class TgrButton {',
    '  static ɵcmp: i0.ɵɵComponentDeclaration<TgrButton, "tgr-button", never, {',
    '    "disabled": {"alias": "disabled"; "required": false};',
    '  }, {"internalChange": boolean}, never, ["*"], true, never>;',
    '}',
    'declare interface TgrButton { internalChange: EventEmitter<CustomEvent>; }',
    'export {TgrButton};',
  ].join('\n'));
  assert.throws(() => readPublicSurface('/unused', 'tgr-button', overrides),
    /Wrapper Angular TgrButton possui mapping de outputs nao reconhecido/);
});

for (const [collection, label, itemName] of [
  ['attributes', 'atributo', 'disabled'],
  ['members', 'propriedade', 'disabled'],
  ['events', 'evento', 'tgrClick'],
]) {
  test(`readPublicSurface rejeita ${label} CEM sem tipo`, async t => {
    const [{readPublicSurface}] = await modules();
    const cem = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'custom-elements.json'), 'utf8'));
    const declaration = cem.modules[0].declarations[0];
    delete declaration[collection][0].type;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-public-surface-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const cemPath = path.join(dir, 'custom-elements.json');
    fs.writeFileSync(cemPath, JSON.stringify(cem));
    assert.throws(() => readPublicSurface('/unused', 'tgr-button', {
      cemPath,
      reactPath: path.join(FIXTURE, 'react.d.ts'),
      angularPath: path.join(FIXTURE, 'angular.d.ts'),
    }), new RegExp(`Custom Elements Manifest declara ${label} ${itemName} sem tipo`));
  });
}

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

test('fingerprint e diff ignoram reorder de arrays e chaves de objetos', async () => {
  const [, {createFingerprint, diffFingerprints}] = await modules();
  const first = createFingerprint({
    component: 'tgr-button',
    wc: {
      attributes: [{name: 'disabled', type: 'boolean'}, {name: 'size', type: 'string'}],
      properties: [], events: [], slots: ['', 'icon'],
    },
    react: {exportName: 'TgrButton', events: ['onFocus', 'onTgrClick']},
    angular: {selector: 'tgr-button', inputs: ['disabled', 'size'], outputs: [], projectableSlots: ['*']},
  });
  const reordered = createFingerprint({
    component: 'tgr-button',
    wc: {
      attributes: [{type: 'string', name: 'size'}, {type: 'boolean', name: 'disabled'}],
      properties: [], events: [], slots: ['icon', ''],
    },
    react: {exportName: 'TgrButton', events: ['onTgrClick', 'onFocus']},
    angular: {selector: 'tgr-button', inputs: ['size', 'disabled'], outputs: [], projectableSlots: ['*']},
  });
  assert.equal(reordered.digest, first.digest);
  assert.deepEqual(diffFingerprints(first, reordered), []);
});

test('fingerprint e diff preservam multiplicidade dos arrays', async () => {
  const [, {createFingerprint, diffFingerprints}] = await modules();
  const base = {
    component: 'tgr-button',
    wc: {attributes: [], properties: [], events: [], slots: ['icon']},
    react: {exportName: 'TgrButton', events: []},
    angular: {selector: 'tgr-button', inputs: [], outputs: [], projectableSlots: []},
  };
  const single = createFingerprint(base);
  const duplicate = createFingerprint({...base, wc: {...base.wc, slots: ['icon', 'icon']}});
  assert.notEqual(duplicate.digest, single.digest);
  assert.deepEqual(diffFingerprints(single, duplicate), [
    {path: 'wc.slots', kind: 'added', value: 'icon'},
  ]);
  assert.deepEqual(diffFingerprints(duplicate, single), [
    {path: 'wc.slots', kind: 'removed', value: 'icon'},
  ]);
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

test('readReviewedFingerprint falha fechado para JSON e shape invalidos', async t => {
  const [, {createFingerprint, readReviewedFingerprint}] = await modules();
  const valid = createFingerprint(publicSurface());

  assert.throws(
    () => readReviewedFingerprint(fingerprintFile(t, '{invalid')),
    /Fingerprint revisado possui JSON invalido/,
  );
  for (const invalid of [
    null,
    [],
    {...valid, component: ''},
    {...valid, surface: {...valid.surface, wc: {...valid.surface.wc, events: [{name: 'x'}]}}},
    {...valid, surface: {...valid.surface, react: {...valid.surface.react, events: [42]}}},
    {...valid, surface: {...valid.surface, angular: {...valid.surface.angular, selector: ''}}},
  ]) {
    assert.throws(
      () => readReviewedFingerprint(fingerprintFile(t, invalid)),
      /Fingerprint revisado .*invalido/,
    );
  }
});

test('readReviewedFingerprint exige schema e digest SHA-256 lowercase', async t => {
  const [, {createFingerprint, readReviewedFingerprint}] = await modules();
  const valid = createFingerprint(publicSurface());

  assert.throws(
    () => readReviewedFingerprint(fingerprintFile(t, {...valid, schemaVersion: 2})),
    /schemaVersion invalido/,
  );
  for (const digest of ['abc', 'A'.repeat(64), 'g'.repeat(64)]) {
    assert.throws(
      () => readReviewedFingerprint(fingerprintFile(t, {...valid, digest})),
      /digest invalido/,
    );
  }
});

test('readReviewedFingerprint rejeita identidade incoerente e surface adulterada', async t => {
  const [, {createFingerprint, readReviewedFingerprint}] = await modules();
  const valid = createFingerprint(publicSurface());

  assert.throws(
    () => readReviewedFingerprint(fingerprintFile(t, {
      ...valid,
      surface: {...valid.surface, component: 'other-component'},
    })),
    /component.*diverge/i,
  );
  assert.throws(
    () => readReviewedFingerprint(fingerprintFile(t, {
      ...valid,
      surface: {
        ...valid.surface,
        wc: {...valid.surface.wc, slots: [...valid.surface.wc.slots, 'forged']},
      },
    })),
    /digest.*diverge/i,
  );
});
