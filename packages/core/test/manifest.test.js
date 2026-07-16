const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildManifest, buildFailureManifest} = require('../src/manifest');

const NOW = new Date('2026-07-15T12:00:00.000Z');

test('buildManifest: defaults de bundle (passed, parity, eixos vazios)', () => {
  const m = buildManifest({
    tool: 'Anemoi Web', card: 'CDCOM-1', component: 'tgr-button',
    mode: 'current', runDir: '/tmp/run', now: NOW,
  });
  assert.equal(m.tool, 'Anemoi Web');
  assert.equal(m.status, 'passed');
  assert.equal(m.mode, 'current');
  assert.equal(m.layout, 'parity');
  assert.equal(m.parityLabel, 'Paridade vs wc');
  assert.deepEqual(m.axes, {});
  assert.deepEqual(m.groups, []);
  assert.equal(m.cellCount, 0);
  assert.equal(m.generatedAt, '2026-07-15T12:00:00.000Z');
  assert.equal(m.runDir, '/tmp/run');
  assert.ok(!('compareState' in m));
});

test('buildManifest: campos opcionais entram quando fornecidos', () => {
  const m = buildManifest({
    tool: 'Anemoi Service', status: 'failed', card: 'koba', component: 'tgr-button',
    mode: 'koba-state', parityLabel: 'Paridade vs react',
    axes: {frameworks: ['react', 'angular']}, cellCount: 2, groups: [{label: 'g'}],
    compareState: {componentKey: 'tgr-button'}, runDir: '/tmp/run', now: NOW,
  });
  assert.equal(m.status, 'failed');
  assert.equal(m.parityLabel, 'Paridade vs react');
  assert.equal(m.cellCount, 2);
  assert.deepEqual(m.groups, [{label: 'g'}]);
  assert.deepEqual(m.compareState, {componentKey: 'tgr-button'});
});

test('buildManifest: lanca em campo obrigatorio ausente', () => {
  const base = {tool: 't', card: 'c', component: 'x', mode: 'current', runDir: '/tmp'};
  for (const field of ['tool', 'card', 'component', 'mode', 'runDir']) {
    const incomplete = {...base};
    delete incomplete[field];
    assert.throws(() => buildManifest(incomplete), new RegExp(`campo obrigatorio ausente: ${field}`));
  }
});

test('buildFailureManifest: falha de execucao sem grade, com diagnostico', () => {
  const m = buildFailureManifest({
    stage: 'capture', card: 'CDCOM-1', component: 'tgr-button',
    error: 'boom', logPath: 'logs/capture.log', runDir: '/tmp/run', now: NOW,
  });
  assert.equal(m.tool, 'Anemoi Web');
  assert.equal(m.status, 'failed');
  assert.equal(m.stage, 'capture');
  assert.equal(m.error, 'boom');
  assert.equal(m.logPath, 'logs/capture.log');
  assert.equal(m.generatedAt, '2026-07-15T12:00:00.000Z');
  assert.ok(!('groups' in m));
  assert.ok(!('cellCount' in m));
});

test('buildManifest: provenance entra verbatim quando fornecida', () => {
  const provenance = {
    anemoi: {version: '1.0.0', commit: 'abc123'},
    tangerina: {commit: 'def456'},
    thresholds: {pixelmatch: 0.1, mismatchTolerance: 0, fit: 'union'},
  };
  const m = buildManifest({
    tool: 'Anemoi Web', card: 'CDCOM-1', component: 'tgr-button',
    mode: 'current', runDir: '/tmp/run', provenance, now: NOW,
  });
  assert.deepEqual(m.provenance, provenance);
});

test('buildManifest: sem provenance, a chave nao existe', () => {
  const m = buildManifest({
    tool: 'Anemoi Web', card: 'CDCOM-1', component: 'tgr-button',
    mode: 'current', runDir: '/tmp/run', now: NOW,
  });
  assert.ok(!('provenance' in m));
});

test('barrel do core exporta buildManifest e buildFailureManifest', () => {
  const core = require('../src/index');
  assert.equal(typeof core.buildManifest, 'function');
  assert.equal(typeof core.buildFailureManifest, 'function');
});
