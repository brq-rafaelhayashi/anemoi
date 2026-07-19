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

function capture(attempt = 0, overrides = {}) {
  return {
    framework: 'wc',
    browser: 'chromium',
    brand: 'gol',
    storyId: 'primary',
    viewport: 'sm',
    theme: 'light',
    relPath: `results/primary--chromium/attempt-${attempt}/evidence/wc.png`,
    ...overrides,
  };
}

function frameworkResult(overrides = {}) {
  return {
    execution: 'passed',
    conformance: 'passed',
    observation: {focus: 'button', events: [], visibility: {button: true}, state: {}},
    ...overrides,
  };
}

function route(overrides = {}) {
  return {
    routeId: 'activation',
    covers: ['activate'],
    frameworks: {
      wc: frameworkResult(),
      react: frameworkResult(),
      angular: frameworkResult(),
    },
    parity: 'passed',
    ...overrides,
  };
}

function group(attempt = 0, overrides = {}) {
  return {
    browser: 'chromium',
    brand: 'gol',
    storyId: 'primary',
    viewport: 'sm',
    theme: 'light',
    label: 'chromium · gol · Primary · sm · light',
    parity: [{
      against: 'react',
      mismatch: 0,
      width: 360,
      height: 40,
      sizeMatch: true,
      referenceSize: {width: 360, height: 40},
      againstSize: {width: 360, height: 40},
      diffPath: `results/primary--chromium/attempt-${attempt}/evidence/diff.png`,
    }],
    a11y: {
      audits: {wc: {violations: [], artifactPath: `results/primary--chromium/attempt-${attempt}/evidence/wc.a11y.json`}},
      ariaParity: [{against: 'react', match: true}],
    },
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
  const captureWithA11y = (attempt, relPath) => capture(attempt, {
    relPath,
    a11y: {
      relPath: `${relPath}.json`,
      ariaRelPath: `${relPath}.aria.yaml`,
      violations: [],
    },
    parity: [{match: false, diffPath: `results/x/attempt-${attempt}/evidence/diff.png`}],
    audit: {artifactPath: `results/x/attempt-${attempt}/evidence/axe.json`, violations: []},
  });
  const [logical] = consolidateAttempts([
    result({
      captures: [captureWithA11y(0, 'results/x/attempt-0/evidence/wc.png')],
      diagnostics: {console: ['same'], pageErrors: [], attachments: ['results/x/attempt-0/trace.zip']},
    }),
    result({
      attempt: 1,
      captures: [captureWithA11y(1, 'results/x/attempt-1/evidence/wc.png')],
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
  const routeWithDiff = pathValue => route({
    parity: 'failed',
    diff: [{path: pathValue, reference: 1, against: 2}],
  });
  const [logical] = consolidateAttempts([
    result({routes: [routeWithDiff('events[0]')]}),
    result({attempt: 1, routes: [routeWithDiff('events[1]')]}),
  ]);
  assert.equal(logical.stability, 'flaky');
});

test('consolidateAttempts preserva identidade do artefato fora do prefixo da tentativa', async () => {
  const {consolidateAttempts} = await subject();
  const [logical] = consolidateAttempts([
    result({captures: [capture(0, {relPath: 'results/x/attempt-0/evidence/wc.png'})]}),
    result({attempt: 1, captures: [capture(1, {relPath: 'results/x/attempt-1/evidence/react.png'})]}),
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
  assert.throws(() => validateAtomicResult(result({captures: [capture(0, {relPath: '/tmp/outside.png'})]})), /artifact path invalido/);
  assert.throws(() => validateAtomicResult(result({captures: [capture(0, {relPath: 'results\\..\\outside.png'})]})), /artifact path invalido/);
});

test('validateAtomicResult valida captures discriminadas e consistentes com o resultado', async () => {
  const {validateAtomicResult} = await subject();
  assert.equal(validateAtomicResult(result({captures: [capture()]})).captures.length, 1);
  assert.equal(validateAtomicResult(result({captures: [{framework: 'react', browser: 'chromium', error: 'mount failed'}]})).captures.length, 1);
  assert.throws(() => validateAtomicResult(result({captures: [{}]})), /capture .*invalido/);
  assert.throws(() => validateAtomicResult(result({captures: [capture(0, {browser: 'webkit'})]})), /capture browser invalido/);
  assert.throws(() => validateAtomicResult(result({captures: [capture(0, {storyId: 'secondary'})]})), /capture scene invalida/);
  assert.throws(() => validateAtomicResult(result({captures: [{framework: 'wc', browser: 'chromium', error: ''}]})), /capture error invalido/);
  assert.throws(() => validateAtomicResult(result({captures: [capture(0, {brand: undefined})]})), /capture invalido/);
  assert.throws(() => validateAtomicResult(result({captures: [capture(0, {a11y: {violations: {}}})]})), /capture a11y invalido/);
});

test('validateAtomicResult valida proof groups, parity e a11y aninhados', async () => {
  const {validateAtomicResult} = await subject();
  assert.equal(validateAtomicResult(result({proofs: {groups: [group()]}})).proofs.groups.length, 1);
  assert.throws(() => validateAtomicResult(result({proofs: {groups: [{}]}})), /proof group .*invalido/);
  assert.throws(() => validateAtomicResult(result({proofs: {groups: [group(0, {browser: 'webkit'})]}})), /proof group browser invalido/);
  assert.throws(() => validateAtomicResult(result({proofs: {groups: [group(0, {theme: 'dark'})]}})), /proof group scene invalida/);
  assert.throws(() => validateAtomicResult(result({proofs: {groups: [group(0, {parity: [{}]})]}})), /proof parity invalido/);
  assert.throws(() => validateAtomicResult(result({proofs: {groups: [group(0, {a11y: {audits: [], ariaParity: []}})]}})), /proof a11y invalido/);
});

test('validateAtomicResult valida routes e resultados dos tres frameworks', async () => {
  const {validateAtomicResult} = await subject();
  assert.equal(validateAtomicResult(result({routes: [route()]})).routes.length, 1);
  assert.throws(() => validateAtomicResult(result({routes: [{}]})), /route invalida/);
  assert.throws(() => validateAtomicResult(result({routes: [route({parity: 'unknown'})]})), /route parity invalido/);
  assert.throws(() => validateAtomicResult(result({routes: [route({frameworks: {}})]})), /route framework invalido/);
  assert.throws(() => validateAtomicResult(result({routes: [route({frameworks: {...route().frameworks, react: frameworkResult({execution: 'timeout'})}})]})), /execution invalido/);
  assert.throws(() => validateAtomicResult(result({routes: [route({frameworks: {...route().frameworks, react: frameworkResult({observation: {events: []}})}})]})), /observation invalida/);
});

test('validateAtomicResult rejeita observacao nao serializavel antes de criar temporario', async t => {
  const {validateAtomicResult, writeAtomicResult} = await subject();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-result-observation-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const withObservation = observation => result({routes: [route({
    frameworks: {...route().frameworks, react: frameworkResult({observation})},
  })]});
  const undefinedFocus = withObservation({
    focus: undefined,
    events: [],
    visibility: {},
    state: {},
  });
  const bigintDetail = withObservation({
    focus: 'button',
    events: [{name: 'activate', detail: 1n}],
    visibility: {},
    state: {},
  });
  const cyclicState = {};
  cyclicState.self = cyclicState;
  const cyclic = withObservation({
    focus: 'button',
    events: [],
    visibility: {},
    state: cyclicState,
  });

  assert.throws(() => validateAtomicResult(undefinedFocus), /nao e serializavel/);
  assert.throws(() => validateAtomicResult(bigintDetail), /nao e serializavel/);
  assert.throws(() => validateAtomicResult(cyclic), /referencia circular/);
  assert.throws(() => writeAtomicResult(dir, undefinedFocus), /nao e serializavel/);
  assert.equal(fs.existsSync(path.join(dir, 'results')), false);
});

test('validateAtomicResult exige estados discriminados do resultado por framework', async () => {
  const {validateAtomicResult} = await subject();
  const withReact = react => result({routes: [route({
    frameworks: {...route().frameworks, react},
  })]});
  const observation = frameworkResult().observation;

  const valid = withReact(frameworkResult());
  assert.equal(validateAtomicResult(valid), valid);
  assert.doesNotThrow(() => validateAtomicResult(withReact(frameworkResult({
    conformance: 'failed',
    error: 'Expected one event',
  }))));
  assert.doesNotThrow(() => validateAtomicResult(withReact({
    execution: 'error',
    conformance: 'not-run',
    error: 'mount failed',
  })));

  assert.throws(() => validateAtomicResult(withReact({execution: 'passed', conformance: 'passed'})), /observation obrigatoria/);
  assert.throws(() => validateAtomicResult(withReact({...frameworkResult(), error: 'unexpected'})), /error ausente/);
  assert.throws(() => validateAtomicResult(withReact({execution: 'passed', conformance: 'failed', observation})), /error obrigatorio/);
  assert.throws(() => validateAtomicResult(withReact({execution: 'passed', conformance: 'not-run', observation})), /combinacao invalida/);
  assert.throws(() => validateAtomicResult(withReact({execution: 'error', conformance: 'failed', error: 'mount failed'})), /combinacao invalida/);
  assert.throws(() => validateAtomicResult(withReact({execution: 'error', conformance: 'not-run'})), /error obrigatorio/);
  assert.throws(() => validateAtomicResult(withReact({execution: 'error', conformance: 'not-run', error: 'mount failed', observation})), /observation ausente/);
});

test('observacao valida preserva identidade e faz roundtrip no resultado atomico', async t => {
  const {writeAtomicResult, readAtomicResults} = await subject();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-result-observation-roundtrip-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const value = result({routes: [route()]});
  const original = value.routes[0].frameworks.wc.observation;
  writeAtomicResult(dir, value);
  assert.equal(value.routes[0].frameworks.wc.observation, original);
  assert.deepEqual(readAtomicResults(dir)[0].routes[0].frameworks.wc.observation, original);
});

test('validateAtomicResult aceita resultado completo da fixture e emergencia vazia', async () => {
  const {validateAtomicResult} = await subject();
  const complete = result({
    status: 'passed',
    captures: [capture()],
    proofs: {groups: [group()]},
    routes: [route()],
  });
  assert.equal(validateAtomicResult(complete), complete);
  const emergency = result({status: 'error', captures: [], proofs: {groups: []}, routes: []});
  assert.equal(validateAtomicResult(emergency), emergency);
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
