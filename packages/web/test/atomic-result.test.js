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

test('writeAtomicResult publica mesmo com lock e temporario orfaos', async t => {
  const {atomicResultPath, writeAtomicResult, readAtomicResults} = await subject();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-result-lock-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = atomicResultPath(dir, 'primary--chromium', 0);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(`${file}.lock`, 'writer-a');
  fs.writeFileSync(`${file}.dead-worker.tmp`, 'partial');

  assert.equal(writeAtomicResult(dir, result()), file);
  assert.equal(fs.readFileSync(`${file}.lock`, 'utf8'), 'writer-a');
  assert.equal(fs.readFileSync(`${file}.dead-worker.tmp`, 'utf8'), 'partial');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).status, 'failed');
  assert.equal(readAtomicResults(dir).length, 1);
  assert.throws(() => writeAtomicResult(dir, result()), /Resultado Atomico ja existe/);
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
  const capture = (attempt, relPath) => ({
    framework: 'wc',
    relPath,
    a11y: {
      relPath: `${relPath}.a11y.json`,
      ariaRelPath: `${relPath}.aria.yaml`,
      violations: [],
    },
    parity: [{match: false, diffPath: `results/x/attempt-${attempt}/evidence/diff.png`}],
    audit: {artifactPath: `results/x/attempt-${attempt}/evidence/axe.json`, violations: []},
  });
  const [logical] = consolidateAttempts([
    result({
      captures: [capture(0, 'results/x/attempt-0/evidence/wc.png')],
      diagnostics: {console: ['same'], pageErrors: [], attachments: ['results/x/attempt-0/trace.zip']},
    }),
    result({
      attempt: 1,
      captures: [capture(1, 'results/x/attempt-1/evidence/wc.png')],
      diagnostics: {console: ['same'], pageErrors: [], attachments: ['results/x/attempt-1/trace.zip']},
    }),
  ]);
  assert.equal(logical.stability, 'stable');
});

test('consolidateAttempts preserva diagnosticos substantivos na assinatura', async () => {
  const {consolidateAttempts} = await subject();
  const [logical] = consolidateAttempts([
    result({
      status: 'error',
      diagnostics: {console: [], pageErrors: ['execution: timeout'], attachments: []},
    }),
    result({
      attempt: 1,
      status: 'error',
      diagnostics: {console: [], pageErrors: ['execution: page crash'], attachments: []},
    }),
  ]);
  assert.equal(logical.stability, 'flaky');
});

test('consolidateAttempts preserva campo path substantivo de diff', async () => {
  const {consolidateAttempts} = await subject();
  const route = pathValue => ({
    routeId: 'activation',
    covers: ['activate'],
    frameworks: {},
    parity: 'failed',
    diff: [{path: pathValue, reference: 1, against: 2}],
  });
  const [logical] = consolidateAttempts([
    result({routes: [route('events[0]')]}),
    result({attempt: 1, routes: [route('events[1]')]}),
  ]);
  assert.equal(logical.stability, 'flaky');
});

test('consolidateAttempts preserva identidade do artefato fora do prefixo da tentativa', async () => {
  const {consolidateAttempts} = await subject();
  const [logical] = consolidateAttempts([
    result({captures: [{relPath: 'results/x/attempt-0/evidence/wc.png'}]}),
    result({attempt: 1, captures: [{relPath: 'results/x/attempt-1/evidence/react.png'}]}),
  ]);
  assert.equal(logical.stability, 'flaky');
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
  assert.throws(() => atomicResultPath('/tmp/run', 'x', Number.MAX_SAFE_INTEGER + 1), /attempt invalido/);
});

test('validateAtomicResult rejeita envelope, identidade e artifact paths invalidos', async () => {
  const {validateAtomicResult} = await subject();
  assert.throws(() => validateAtomicResult(result({schemaVersion: 2})), /schemaVersion invalido/);
  assert.throws(() => validateAtomicResult(result({status: 'missing'})), /status invalido/);
  assert.throws(() => validateAtomicResult(result({browser: 'edge'})), /browser invalido/);
  assert.throws(() => validateAtomicResult(result({logicalTestId: 'other--chromium'})), /identidade invalida/);
  assert.throws(() => validateAtomicResult(result({captures: {}})), /captures invalido/);
  assert.throws(() => validateAtomicResult(result({captures: [null]})), /captures invalido/);
  assert.throws(() => validateAtomicResult(result({proofs: {groups: [null]}})), /proofs invalido/);
  assert.throws(() => validateAtomicResult(result({routes: [null]})), /routes invalido/);
  assert.throws(() => validateAtomicResult(result({scene: {...result().scene, name: 42}})), /scene invalida/);
  assert.throws(() => validateAtomicResult(result({scene: {...result().scene, args: []}})), /scene invalida/);
  assert.throws(() => validateAtomicResult(result({scene: {...result().scene, width: Infinity}})), /scene invalida/);
  assert.throws(() => validateAtomicResult(result({diagnostics: {console: [42], pageErrors: [], attachments: []}})), /diagnostics.console invalido/);
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

test('readAtomicResults rejeita alias nao canonico attempt-00', async t => {
  const {atomicResultPath, readAtomicResults} = await subject();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-result-attempt-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const canonical = atomicResultPath(dir, 'primary--chromium', 0);
  const alias = canonical.replace(`${path.sep}attempt-0${path.sep}`, `${path.sep}attempt-00${path.sep}`);
  fs.mkdirSync(path.dirname(alias), {recursive: true});
  fs.writeFileSync(alias, `${JSON.stringify(result())}\n`);

  assert.throws(() => readAtomicResults(dir), /Diretorio de tentativa invalido/);
});
