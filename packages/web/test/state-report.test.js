const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/stateReport.ts')).href);
}

function group({
  id,
  name,
  browser = 'chromium',
  parityFailed = false,
  axeFailed = false,
  axeError = false,
}) {
  const logicalTestId = `${id}--gol--light--sm--hash--${browser}`;
  const root = `results/${logicalTestId}/attempt-0/evidence/${browser}`;
  return {
    browser,
    brand: 'gol',
    storyId: id,
    story: name,
    viewport: 'sm',
    theme: 'light',
    label: `${browser} · gol · ${name} · sm · light`,
    wc: `${root}/wc.png`,
    react: `${root}/react.png`,
    angular: `${root}/angular.png`,
    parity: [
      {against: 'react', mismatch: parityFailed ? 1 : 0, sizeMatch: true},
      {against: 'angular', mismatch: 0, sizeMatch: true},
    ],
    a11y: {
      audits: {
        wc: axeError ? {error: 'axe timeout'} : {
          violations: axeFailed ? [{id: 'color-contrast', nodes: [{}]}] : [],
        },
        react: {violations: []},
        angular: {violations: []},
      },
      ariaParity: [{against: 'react', match: true}, {against: 'angular', match: true}],
    },
  };
}

function manifest(groups) {
  const logicalIds = groups.map(item => item.wc.split('/')[1]);
  return {
    axes: {frameworks: ['wc', 'react', 'angular']},
    gate: {dimensions: {axe: {status: 'failed'}}},
    groups,
    behavior: {
      results: logicalIds.map(logicalTestId => ({
        logicalTestId,
        stability: 'stable',
        routes: [],
      })),
    },
    attempts: logicalIds.map(logicalTestId => ({
      logicalTestId,
      stability: 'stable',
      attempts: [{
        attempt: 0,
        status: 'passed',
        resultPath: `results/${logicalTestId}/attempt-0/result.json`,
      }],
    })),
  };
}

test('agrupa todas as evidencias pelo storyId e preserva o nome visivel', async () => {
  const {projectStateReport} = await subject();
  const states = projectStateReport(manifest([
    group({id: 'primary', name: 'Primary', browser: 'chromium'}),
    group({id: 'primary', name: 'Primary', browser: 'firefox'}),
  ]));

  assert.equal(states.length, 1);
  assert.equal(states[0].id, 'primary');
  assert.equal(states[0].name, 'Primary');
  assert.equal(states[0].groups.length, 2);
  assert.equal(states[0].behavior.length, 2);
  assert.equal(states[0].attempts.length, 2);
});

test('ordena failed, unavailable e passed e abre apenas estados nao aprovados', async () => {
  const {projectStateReport} = await subject();
  const states = projectStateReport(manifest([
    group({id: 'passed', name: 'Passed'}),
    group({id: 'unavailable', name: 'Unavailable', axeError: true}),
    group({id: 'failed', name: 'Failed', axeFailed: true}),
  ]));

  assert.deepEqual(states.map(item => [item.id, item.status, item.open]), [
    ['failed', 'failed', true],
    ['unavailable', 'unavailable', true],
    ['passed', 'passed', false],
  ]);
});

test('coloca combinacoes falhas antes das aprovadas sem perder ordem estavel', async () => {
  const {projectStateReport} = await subject();
  const states = projectStateReport(manifest([
    group({id: 'primary', name: 'Primary', browser: 'chromium'}),
    group({id: 'primary', name: 'Primary', browser: 'firefox', parityFailed: true}),
    group({id: 'primary', name: 'Primary', browser: 'webkit'}),
  ]));

  assert.deepEqual(states[0].groups.map(item => item.browser), [
    'firefox',
    'chromium',
    'webkit',
  ]);
});

test('preserva resultados nao associaveis em Evidencias sem estado', async () => {
  const {projectStateReport} = await subject();
  const input = manifest([group({id: 'primary', name: 'Primary'})]);
  input.attempts.push({
    logicalTestId: 'orphan--chromium',
    stability: 'stable',
    attempts: [{attempt: 0, status: 'error', resultPath: 'results/orphan--chromium/attempt-0/result.json'}],
  });

  const orphan = projectStateReport(input).find(item => item.orphaned);
  assert.equal(orphan.name, 'Evidências sem estado');
  assert.equal(orphan.status, 'unavailable');
  assert.equal(orphan.attempts[0].logicalTestId, 'orphan--chromium');
});
