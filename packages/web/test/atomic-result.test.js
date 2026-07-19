const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/atomicResult.ts')).href);
}

function result(overrides = {}) {
  return {
    schemaVersion: 1,
    logicalTestId: 'primary--chromium',
    attempt: 0,
    browser: 'chromium',
    scene: {
      id: 'primary',
      cellId: 'primary',
      name: 'Primary',
      component: 'tgr-button',
      args: {},
      slots: {},
      brand: 'gol',
      theme: 'light',
      viewport: 'sm',
      width: 360,
    },
    status: 'failed',
    captures: [],
    proofs: {groups: []},
    routes: [],
    diagnostics: {console: [], pageErrors: [], attachments: []},
    ...overrides,
  };
}

test('writeAtomicResult grava cada tentativa em path exclusivo sem temporario residual', async t => {
  const {writeAtomicResult, readAtomicResults} = await subject();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-result-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));

  const first = writeAtomicResult(dir, result());
  const second = writeAtomicResult(dir, result({attempt: 1, status: 'passed'}));

  assert.notEqual(first, second);
  assert.deepEqual(readAtomicResults(dir).map(item => item.attempt), [0, 1]);
  assert.deepEqual(
    fs.readdirSync(path.dirname(first)).filter(name => name.endsWith('.tmp') || name.endsWith('.lock')),
    [],
  );
  assert.throws(() => writeAtomicResult(dir, result()), /Resultado Atomico ja existe/);
  assert.equal(JSON.parse(fs.readFileSync(first, 'utf8')).status, 'failed');
});

test('writeAtomicResult nao remove lock pertencente a outro escritor', async t => {
  const {atomicResultPath, writeAtomicResult} = await subject();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-result-lock-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = atomicResultPath(dir, 'primary--chromium', 0);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(`${file}.lock`, 'writer-a');

  assert.throws(() => writeAtomicResult(dir, result()), /esta sendo publicado/);
  assert.equal(fs.readFileSync(`${file}.lock`, 'utf8'), 'writer-a');
  assert.equal(fs.existsSync(file), false);
});

test('resultado de emergencia interrompido e persistido como error', async t => {
  const {writeAtomicResult, readAtomicResults, consolidateAttempts} = await subject();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-result-error-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  writeAtomicResult(dir, result({
    status: 'error',
    diagnostics: {
      console: [],
      pageErrors: ['execution: Test timeout of 120000ms exceeded'],
      attachments: ['results/primary--chromium/attempt-0/attachments/failure.png'],
    },
  }));

  const [logical] = consolidateAttempts(readAtomicResults(dir));
  assert.equal(logical.stability, 'stable');
  assert.equal(logical.final.status, 'error');
  assert.match(logical.final.diagnostics.pageErrors[0], /timeout/);
});

test('consolidateAttempts classifica retry divergente como flaky', async () => {
  const {consolidateAttempts} = await subject();
  const [logical] = consolidateAttempts([result(), result({attempt: 1, status: 'passed'})]);
  assert.equal(logical.stability, 'flaky');
  assert.equal(logical.attempts.length, 2);
  assert.equal(logical.final.status, 'passed');
});

test('consolidateAttempts mantem falha repetida identica como stable', async () => {
  const {consolidateAttempts} = await subject();
  const input = [result({attempt: 1}), result()];
  const [logical] = consolidateAttempts(input);
  assert.equal(logical.stability, 'stable');
  assert.deepEqual(logical.attempts.map(item => item.attempt), [0, 1]);
  assert.deepEqual(input.map(item => item.attempt), [1, 0]);
});

test('consolidateAttempts ignora paths exclusivos de cada tentativa', async () => {
  const {consolidateAttempts} = await subject();
  const capture = relPath => ({
    framework: 'wc',
    relPath,
    a11y: {relPath: `${relPath}.a11y.json`, violations: []},
  });
  const [logical] = consolidateAttempts([
    result({captures: [capture('results/x/attempt-0/evidence/wc.png')]}),
    result({attempt: 1, captures: [capture('results/x/attempt-1/evidence/wc.png')]}),
  ]);
  assert.equal(logical.stability, 'stable');
});

test('consolidateAttempts rejeita tentativa duplicada do mesmo teste logico', async () => {
  const {consolidateAttempts} = await subject();
  assert.throws(() => consolidateAttempts([result(), result()]), /tentativa duplicada/);
});

test('atomicResultPath rejeita traversal e attempt invalido', async () => {
  const {atomicResultPath} = await subject();
  assert.throws(() => atomicResultPath('/tmp/run', '../escape', 0), /logicalTestId invalido/);
  assert.throws(() => atomicResultPath('/tmp/run', 'x\\y', 0), /logicalTestId invalido/);
  assert.throws(() => atomicResultPath('/tmp/run', 'x', -1), /attempt invalido/);
});

test('validateAtomicResult rejeita envelope, identidade e artifact paths invalidos', async () => {
  const {validateAtomicResult} = await subject();
  assert.throws(() => validateAtomicResult(result({schemaVersion: 2})), /schemaVersion invalido/);
  assert.throws(() => validateAtomicResult(result({status: 'missing'})), /status invalido/);
  assert.throws(() => validateAtomicResult(result({browser: 'edge'})), /browser invalido/);
  assert.throws(() => validateAtomicResult(result({logicalTestId: 'other--chromium'})), /identidade invalida/);
  assert.throws(() => validateAtomicResult(result({captures: {}})), /captures invalido/);
  assert.throws(() => validateAtomicResult(result({diagnostics: {console: [], pageErrors: [], attachments: ['../trace.zip']}})), /artifact path invalido/);
  assert.throws(() => validateAtomicResult(result({captures: [{relPath: '/tmp/outside.png'}]})), /artifact path invalido/);
  assert.throws(() => validateAtomicResult(result({captures: [{relPath: 'results\\..\\outside.png'}]})), /artifact path invalido/);
});

test('readAtomicResults ordena resultados e rejeita identidade divergente do diretorio', async t => {
  const {atomicResultPath, writeAtomicResult, readAtomicResults} = await subject();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-result-read-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  writeAtomicResult(dir, result({
    logicalTestId: 'secondary--webkit',
    browser: 'webkit',
    scene: {...result().scene, id: 'secondary', cellId: 'secondary'},
  }));
  writeAtomicResult(dir, result());
  assert.deepEqual(readAtomicResults(dir).map(item => item.logicalTestId), [
    'primary--chromium',
    'secondary--webkit',
  ]);

  const file = atomicResultPath(dir, 'forged--chromium', 0);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(result())}\n`);
  assert.throws(() => readAtomicResults(dir), /identidade do path diverge/);
});
