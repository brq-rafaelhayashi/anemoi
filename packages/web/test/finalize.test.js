const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function modules() {
  return Promise.all([
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/runPlan.ts')).href),
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/atomicResult.ts')).href),
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/finalize.ts')).href),
  ]);
}

function fixture(overrides = {}) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-finalize-'));
  const scene = {id: 'primary', cellId: 'primary-gol-light-sm', name: 'Primary', component: 'tgr-button', args: {}, slots: {}, brand: 'gol', theme: 'light', viewport: 'sm', width: 360};
  const plan = {
    schemaVersion: 1, runId: 'run', runDir, repo: '/repo', consumer: 'tangerina', component: 'tgr-button', card: 'C-1', diagnostic: false, collectA11y: true,
    browsers: ['chromium'], requiredBrowsers: ['chromium'], frameworks: ['wc', 'react', 'angular'], specPath: '/spec.ts', hostsPath: path.join(runDir, 'hosts.json'), scenes: [scene],
    contract: contract(),
    ...overrides,
  };
  return {runDir, scene, plan, planPath: path.join(runDir, 'run-plan.json')};
}

function contract(overrides = {}) {
  return {
    status: 'current', fingerprintDigest: 'a', currentDigest: 'a',
    requiredBehaviors: ['activate'], coveredBehaviors: ['activate'],
    routes: [{id: 'activation', sceneId: 'primary', covers: ['activate']}],
    ...overrides,
  };
}

function frameworkResult() {
  return {execution: 'passed', conformance: 'passed', observation: {focus: true, events: [{name: 'tgrClick'}], visibility: {button: true}, state: {}}};
}

function parity(against, attempt) {
  return {against, mismatch: 0, width: 360, height: 40, sizeMatch: true, referenceSize: {width: 360, height: 40}, againstSize: {width: 360, height: 40}, diffPath: `results/primary-gol-light-sm--chromium/attempt-${attempt}/evidence/${against}.diff.png`};
}

function capture(scene, framework, attempt) {
  return {framework, browser: 'chromium', brand: 'gol', storyId: scene.id, storyName: scene.name, viewport: 'sm', theme: 'light', relPath: `results/${scene.cellId}--chromium/attempt-${attempt}/evidence/${framework}.png`, a11y: {violations: [], ariaSnapshot: 'button'}};
}

function result(scene, overrides = {}) {
  const attempt = overrides.attempt ?? 0;
  const frameworks = {wc: frameworkResult(), react: frameworkResult(), angular: frameworkResult()};
  const group = {
    browser: 'chromium', brand: 'gol', storyId: scene.id, label: 'chromium · gol · Primary · sm · light',
    viewport: 'sm', theme: 'light', wc: 'wc.png', react: 'react.png', angular: 'angular.png',
    parity: [parity('react', attempt), parity('angular', attempt)],
    a11y: {audits: {wc: {violations: []}, react: {violations: []}, angular: {violations: []}}, ariaParity: [{against: 'react', match: true}, {against: 'angular', match: true}]},
  };
  return {
    schemaVersion: 1, logicalTestId: `${scene.cellId}--chromium`, attempt, browser: 'chromium', scene, status: 'passed',
    captures: ['wc', 'react', 'angular'].map(framework => capture(scene, framework, attempt)),
    proofs: {groups: [group]}, routes: [{routeId: 'activation', covers: ['activate'], frameworks, parity: 'passed'}],
    diagnostics: {console: [], pageErrors: [], attachments: []}, ...overrides,
  };
}

function dependencies(runDir, overrides = {}) {
  return {
    summarizeA11y: () => ({totalViolations: 0, ariaMismatches: 0}),
    buildManifestV2: input => ({schemaVersion: 2, ...input}),
    writeManifest: (_dir, manifest) => fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest)),
    collectProvenance: () => ({environment: {runner: '@playwright/test'}}),
    ...overrides,
  };
}

async function setup(t, planOverrides = {}) {
  const [{writeRunPlan}, atomic, finalizer] = await modules();
  const value = fixture(planOverrides);
  t.after(() => fs.rmSync(value.runDir, {recursive: true, force: true}));
  writeRunPlan(value.planPath, value.plan);
  return {...value, ...atomic, ...finalizer};
}

test('finalizeRun rejeita matriz incompleta ou com IDs inesperados sem publicar', async t => {
  const value = await setup(t);
  assert.throws(() => value.finalizeRun(value.planPath, dependencies(value.runDir)), /Resultado Atomico ausente/);
  assert.equal(fs.existsSync(path.join(value.runDir, 'manifest.json')), false);
  value.writeAtomicResult(value.runDir, result({...value.scene, cellId: 'unexpected'}));
  assert.throws(() => value.finalizeRun(value.planPath, dependencies(value.runDir)), /Inesperado/);
  assert.equal(fs.existsSync(path.join(value.runDir, 'manifest.json')), false);
});

test('finalizeRun publica v2 aprovado quando todas as provas estao presentes', async t => {
  const value = await setup(t);
  value.writeAtomicResult(value.runDir, result(value.scene));
  const manifest = value.finalizeRun(value.planPath, dependencies(value.runDir));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.gate.status, 'passed');
  assert.equal(manifest.behavior.results.length, 1);
});

test('finalizeRun preserva retries e reprova qualquer flaky', async t => {
  const value = await setup(t);
  value.writeAtomicResult(value.runDir, result(value.scene, {status: 'failed'}));
  value.writeAtomicResult(value.runDir, result(value.scene, {attempt: 1, diagnostics: {console: [], pageErrors: [], attachments: ['results/primary/attempt-1/attachments/trace.zip']}}));
  const manifest = value.finalizeRun(value.planPath, dependencies(value.runDir));
  assert.equal(manifest.gate.dimensions.stability.status, 'failed');
  assert.equal(manifest.attempts[0].attempts.length, 2);
  assert.match(manifest.attempts[0].attempts[1].resultPath, /attempt-1\/result\.json$/);
  assert.deepEqual(manifest.attempts[0].attempts[1].attachments, ['results/primary/attempt-1/attachments/trace.zip']);
});

test('finalizeRun reprova resultado final failed mesmo quando provas parecem aprovadas', async t => {
  const value = await setup(t);
  value.writeAtomicResult(value.runDir, result(value.scene, {status: 'failed'}));
  const manifest = value.finalizeRun(value.planPath, dependencies(value.runDir));
  assert.equal(manifest.gate.dimensions.stability.status, 'failed');
  assert.equal(manifest.gate.status, 'failed');
  assert.equal(manifest.gate.trusted, false);
});

test('finalizeRun reprova resultado final error mesmo quando provas parecem aprovadas', async t => {
  const value = await setup(t);
  value.writeAtomicResult(value.runDir, result(value.scene, {status: 'error'}));
  const manifest = value.finalizeRun(value.planPath, dependencies(value.runDir));
  assert.equal(manifest.gate.dimensions.stability.status, 'unavailable');
  assert.equal(manifest.gate.status, 'failed');
  assert.equal(manifest.gate.trusted, false);
});

test('finalizeRun calcula browserCoverage pelo conjunto exato e por duplicatas', async t => {
  await t.test('missing e unexpected em relacao aos required', async t => {
    const value = await setup(t, {requiredBrowsers: ['firefox']});
    value.writeAtomicResult(value.runDir, result(value.scene));
    const manifest = value.finalizeRun(value.planPath, dependencies(value.runDir));
    assert.equal(manifest.gate.dimensions.browserCoverage.status, 'failed');
    assert.equal(manifest.gate.dimensions.browserCoverage.failed, 2);
    assert.equal(manifest.gate.status, 'failed');
  });

  await t.test('browser selecionado duplicado', async t => {
    const value = await setup(t, {browsers: ['chromium', 'chromium']});
    value.writeAtomicResult(value.runDir, result(value.scene));
    const manifest = value.finalizeRun(value.planPath, dependencies(value.runDir));
    assert.equal(manifest.gate.dimensions.browserCoverage.status, 'failed');
    assert.equal(manifest.gate.dimensions.browserCoverage.failed, 1);
  });

  await t.test('required oficial incompleto permanece falha mesmo em diagnostico', async t => {
    const value = await setup(t, {
      diagnostic: true,
      requiredBrowsers: ['chromium', 'firefox', 'webkit'],
    });
    value.writeAtomicResult(value.runDir, result(value.scene));
    const manifest = value.finalizeRun(value.planPath, dependencies(value.runDir));
    assert.equal(manifest.gate.dimensions.browserCoverage.status, 'failed');
    assert.equal(manifest.gate.dimensions.browserCoverage.failed, 2);
    assert.equal(manifest.gate.status, 'not-approved');
    assert.equal(manifest.gate.trusted, false);
  });
});

test('finalizeRun marca roteiro ausente como evidencia indisponivel', async t => {
  const value = await setup(t);
  value.writeAtomicResult(value.runDir, result(value.scene, {routes: []}));
  const manifest = value.finalizeRun(value.planPath, dependencies(value.runDir));
  assert.equal(manifest.gate.dimensions.behavioralConformance.status, 'unavailable');
  assert.equal(manifest.gate.dimensions.behavioralParity.status, 'unavailable');
});

test('finalizeRun deriva cobertura comportamental das rotas finais e exige covers canonico', async t => {
  for (const covers of [[], ['extra'], ['activate', 'extra']]) {
    await t.test(JSON.stringify(covers), async t => {
      const value = await setup(t);
      const atomic = result(value.scene);
      atomic.routes[0].covers = covers;
      value.writeAtomicResult(value.runDir, atomic);
      const manifest = value.finalizeRun(value.planPath, dependencies(value.runDir));
      assert.equal(manifest.gate.dimensions.behavioralConformance.status, 'unavailable');
      assert.equal(manifest.gate.dimensions.contractCoverage.status, 'failed');
      assert.ok(manifest.gate.dimensions.contractCoverage.failed > 0);
      assert.equal(manifest.gate.status, 'failed');
    });
  }
});

test('finalizeRun nao aprova provas visuais, captures ou a11y estruturalmente ausentes', async t => {
  const value = await setup(t);
  value.writeAtomicResult(value.runDir, result(value.scene, {captures: [], proofs: {groups: []}}));
  const manifest = value.finalizeRun(value.planPath, dependencies(value.runDir));
  assert.equal(manifest.gate.dimensions.visualParity.status, 'unavailable');
  assert.equal(manifest.gate.dimensions.axe.status, 'unavailable');
  assert.equal(manifest.gate.status, 'failed');
});

test('finalizeRun exige conjuntos exatos de parity, audits e ariaParity', async t => {
  const value = await setup(t);
  const atomic = result(value.scene);
  const group = atomic.proofs.groups[0];
  group.parity.push(parity('wc', 0));
  group.parity.push(parity('react', 0));
  group.a11y.audits.vue = {violations: []};
  group.a11y.ariaParity.push({against: 'wc', match: true});
  group.a11y.ariaParity.push({against: 'react', match: true});
  value.writeAtomicResult(value.runDir, atomic);
  const manifest = value.finalizeRun(value.planPath, dependencies(value.runDir));
  assert.equal(manifest.gate.dimensions.visualParity.status, 'unavailable');
  assert.equal(manifest.gate.dimensions.axe.status, 'unavailable');
  assert.equal(manifest.gate.dimensions.ariaParity.status, 'unavailable');
  assert.equal(manifest.gate.status, 'failed');
});

test('finalizeRun trata gap de tentativa e erro final como estabilidade indisponivel', async t => {
  const value = await setup(t);
  value.writeAtomicResult(value.runDir, result(value.scene, {attempt: 1, status: 'error', captures: [], proofs: {groups: []}, routes: []}));
  const manifest = value.finalizeRun(value.planPath, dependencies(value.runDir));
  assert.equal(manifest.gate.dimensions.stability.status, 'unavailable');
});

test('finalizeRun reprova contrato stale e execucao diagnostica', async t => {
  const value = await setup(t, {diagnostic: true, contract: contract({status: 'stale'})});
  value.writeAtomicResult(value.runDir, result(value.scene));
  const manifest = value.finalizeRun(value.planPath, dependencies(value.runDir));
  assert.equal(manifest.gate.dimensions.contractCoverage.status, 'unavailable');
  assert.equal(manifest.gate.status, 'not-approved');
  assert.equal(manifest.gate.trusted, false);
});

test('finalizeRun publica manifest somente depois de consolidar todos os dados', async t => {
  const value = await setup(t);
  value.writeAtomicResult(value.runDir, result(value.scene));
  const deps = dependencies(value.runDir, {summarizeA11y: () => { throw new Error('aggregate failed'); }});
  assert.throws(() => value.finalizeRun(value.planPath, deps), /aggregate failed/);
  assert.equal(fs.existsSync(path.join(value.runDir, 'manifest.json')), false);
});
