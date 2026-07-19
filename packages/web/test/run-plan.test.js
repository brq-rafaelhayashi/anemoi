const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject(file = 'runPlan.ts') {
  return import(pathToFileURL(path.resolve(__dirname, `../src/runner/${file}`)).href);
}

const scene = {
  id: 'primary',
  name: 'Primary',
  component: 'tgr-button',
  args: {},
  slots: {},
};
const contractState = {
  status: 'current',
  fingerprintDigest: 'a',
  currentDigest: 'a',
  requiredBehaviors: ['activate'],
  coveredBehaviors: ['activate'],
  routes: [{id: 'activation', sceneId: 'primary', covers: ['activate']}],
};
const support = {
  schemaVersion: 1,
  required: ['chromium', 'firefox', 'webkit'],
  optional: [],
};

function planInput(overrides = {}) {
  return {
    runId: 'run-1',
    runDir: '/tmp/run',
    repo: '/tmp/tangerina',
    consumer: 'tangerina',
    component: 'tgr-button',
    card: 'CDCOM-1',
    specPath: '/anemoi/behaviors.spec.ts',
    hostsPath: '/tmp/run/hosts.json',
    support,
    scenes: [scene],
    contractState,
    brands: ['gol'],
    themes: ['light', 'dark'],
    viewports: ['sm'],
    viewportWidths: {sm: 360},
    ...overrides,
  };
}

test('buildRunPlan expande ambiente e viewport e preserva os tres browsers obrigatorios', async () => {
  const {buildRunPlan} = await subject();
  const plan = buildRunPlan(planInput());
  assert.deepEqual(plan.browsers, ['chromium', 'firefox', 'webkit']);
  assert.deepEqual(plan.requiredBrowsers, ['chromium', 'firefox', 'webkit']);
  assert.equal(plan.diagnostic, false);
  assert.equal(plan.collectA11y, true);
  assert.equal(plan.scenes.length, 2);
  assert.equal(new Set(plan.scenes.map(item => item.cellId)).size, 2);
});

test('buildRunPlan produz IDs deterministas e resistentes a colisoes de slug', async () => {
  const {buildRunPlan} = await subject();
  const colliding = [
    {...scene, id: 'primary/a', name: 'Slash'},
    {...scene, id: 'primary-a', name: 'Dash'},
  ];
  const first = buildRunPlan(planInput({scenes: colliding, themes: ['light']}));
  const second = buildRunPlan(planInput({scenes: colliding, themes: ['light']}));
  assert.deepEqual(first.scenes.map(item => item.cellId), second.scenes.map(item => item.cellId));
  assert.equal(new Set(first.scenes.map(item => item.cellId)).size, 2);
});

test('buildRunPlan canonicaliza permutacoes equivalentes sem alterar a entrada', async () => {
  const {buildRunPlan} = await subject();
  const secondary = {...scene, id: 'secondary', name: 'Secondary'};
  const policy = {
    schemaVersion: 1,
    required: ['webkit', 'chromium', 'firefox'],
    optional: [],
  };
  const permuted = planInput({
    support: policy,
    selectedBrowsers: ['firefox', 'webkit', 'chromium'],
    scenes: [secondary, scene],
    brands: ['smiles', 'gol'],
    themes: ['contrast', 'dark', 'light'],
    viewports: ['lg', 'sm', 'md'],
    viewportWidths: {lg: 1024, sm: 360, md: 768},
  });
  const canonical = planInput({
    support: policy,
    selectedBrowsers: ['webkit', 'chromium', 'firefox'],
    scenes: [scene, secondary],
    brands: ['gol', 'smiles'],
    themes: ['light', 'dark', 'contrast'],
    viewports: ['sm', 'md', 'lg'],
    viewportWidths: {md: 768, lg: 1024, sm: 360},
  });
  const original = structuredClone(permuted);

  const fromPermutation = buildRunPlan(permuted);
  const fromCanonical = buildRunPlan(canonical);

  assert.deepEqual(permuted, original);
  assert.deepEqual(fromPermutation.browsers, ['webkit', 'chromium', 'firefox']);
  assert.deepEqual(fromPermutation.requiredBrowsers, ['webkit', 'chromium', 'firefox']);
  assert.deepEqual(
    fromPermutation.scenes.slice(0, 12).map(item => [item.id, item.brand, item.theme, item.viewport]),
    [
      ['primary', 'gol', 'light', 'sm'],
      ['primary', 'gol', 'light', 'md'],
      ['primary', 'gol', 'light', 'lg'],
      ['primary', 'gol', 'dark', 'sm'],
      ['primary', 'gol', 'dark', 'md'],
      ['primary', 'gol', 'dark', 'lg'],
      ['primary', 'gol', 'contrast', 'sm'],
      ['primary', 'gol', 'contrast', 'md'],
      ['primary', 'gol', 'contrast', 'lg'],
      ['primary', 'smiles', 'light', 'sm'],
      ['primary', 'smiles', 'light', 'md'],
      ['primary', 'smiles', 'light', 'lg'],
    ],
  );
  assert.equal(JSON.stringify(fromPermutation), JSON.stringify(fromCanonical));
});

test('buildRunPlan isola profundamente cada celula, Cena e contrato de entrada', async () => {
  const {buildRunPlan} = await subject();
  const nestedScene = {
    ...scene,
    args: {config: {label: 'Original'}},
    slots: {icon: {icon: 'download'}},
  };
  const input = planInput({scenes: [nestedScene]});
  const original = structuredClone(input);
  const plan = buildRunPlan(input);
  assert.equal(plan.scenes.length, 2);

  plan.scenes[0].args.config.label = 'Changed';
  plan.scenes[0].slots.icon.icon = 'upload';
  plan.contract.routes[0].covers.push('changed');

  assert.deepEqual(plan.scenes[1].args, {config: {label: 'Original'}});
  assert.deepEqual(plan.scenes[1].slots, {icon: {icon: 'download'}});
  assert.deepEqual(input, original);
});

test('filtro de browser reduz execucao mas marca plano diagnostico', async () => {
  const {buildRunPlan} = await subject();
  const plan = buildRunPlan(planInput({selectedBrowsers: ['chromium'], themes: ['light']}));
  assert.deepEqual(plan.browsers, ['chromium']);
  assert.equal(plan.diagnostic, true);
});

test('buildRunPlan rejeita selecao vazia, duplicada ou fora da matriz', async () => {
  const {buildRunPlan} = await subject();
  assert.throws(() => buildRunPlan(planInput({selectedBrowsers: []})), /vazia ou duplicada/);
  assert.throws(() => buildRunPlan(planInput({selectedBrowsers: ['chromium', 'chromium']})), /vazia ou duplicada/);
  assert.throws(() => buildRunPlan(planInput({selectedBrowsers: ['chrome']})), /fora da Matriz de Suporte/);
  assert.throws(() => buildRunPlan(planInput({support: {
    schemaVersion: 1,
    required: ['chromium', 'firefox', 'webkit'],
    optional: ['chromium'],
  }})), /Matriz de Suporte invalida/);
});

test('buildRunPlan rejeita eixos vazios ou duplicados antes de gerar IDs', async () => {
  const {buildRunPlan} = await subject();
  assert.throws(() => buildRunPlan(planInput({scenes: []})), /Eixo scenes/);
  assert.throws(() => buildRunPlan(planInput({brands: []})), /Eixo brands/);
  assert.throws(() => buildRunPlan(planInput({themes: ['light', 'light']})), /Eixo themes/);
  assert.throws(() => buildRunPlan(planInput({viewports: ['sm', 'sm']})), /Eixo viewports/);
});

test('writeRunPlan publica JSON completo sem sobrescrever o plano imutavel', async t => {
  const {writeRunPlan, readRunPlan} = await subject();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-plan-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'run-plan.json');
  const plan = {schemaVersion: 1, runId: 'x', scenes: []};
  writeRunPlan(file, plan);
  assert.deepEqual(readRunPlan(file), plan);
  assert.deepEqual(fs.readdirSync(dir), ['run-plan.json']);
  assert.throws(() => writeRunPlan(file, {...plan, runId: 'changed'}), /run-plan ja existe/);
  assert.deepEqual(readRunPlan(file), plan);
});

test('prepareHarnessBuilds isola builds e registra os caminhos efetivos', async t => {
  const {prepareHarnessBuilds} = await subject('builds.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-builds-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const calls = [];
  const factory = framework => repo => ({
    build(value, outDir, options) {
      calls.push({framework, repo, value, outDir, logPath: options.logPath});
      return framework === 'angular' ? path.join(outDir, 'browser') : undefined;
    },
  });
  const builds = prepareHarnessBuilds('/tmp/tangerina', dir, {
    factories: {
      wc: factory('wc'),
      react: factory('react'),
      angular: factory('angular'),
    },
  });
  assert.deepEqual(builds, {
    wc: path.join(dir, 'build', 'wc'),
    react: path.join(dir, 'build', 'react'),
    angular: path.join(dir, 'build', 'angular', 'browser'),
  });
  assert.deepEqual(calls.map(call => call.framework), ['wc', 'react', 'angular']);
  assert.ok(calls.every(call => call.repo === '/tmp/tangerina' && call.value === '/tmp/tangerina'));
  assert.ok(calls.every(call => call.logPath === path.join(dir, 'logs', `${call.framework}-harness-build.log`)));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'builds.json'), 'utf8')), builds);
});

function preflightDependencies(dir, overrides = {}) {
  return {
    definition: {
      contract: {
        schemaVersion: 1,
        consumer: 'tangerina',
        component: 'tgr-button',
        requiredBehaviors: ['activate'],
        routes: [{id: 'activation', sceneId: 'primary', covers: ['activate']}],
      },
      scenes: [scene],
    },
    contractDir: path.join(dir, 'contract'),
    reviewedFingerprint: {component: 'tgr-button', digest: 'same'},
    currentFingerprint: {component: 'tgr-button', digest: 'same'},
    support,
    prepareConsumer: () => {},
    prepareHarnessBuilds: () => fs.writeFileSync(path.join(dir, 'builds.json'), '{}'),
    ...overrides,
  };
}

test('preflight preserva coletas e fecha contrato quando fingerprint esta stale', async t => {
  const {preflightRun} = await subject('preflight.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-preflight-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const {plan, planPath} = await preflightRun({
    repo: '/tmp/tangerina',
    runDir: dir,
    component: 'tgr-button',
    card: 'C-1',
    brands: ['gol'],
    themes: ['light'],
    viewports: ['sm'],
  }, preflightDependencies(dir, {
    reviewedFingerprint: {component: 'tgr-button', digest: 'reviewed'},
    currentFingerprint: {component: 'tgr-button', digest: 'current'},
  }));
  assert.equal(plan.contract.status, 'stale');
  assert.equal(plan.scenes.length, 1);
  assert.equal(fs.existsSync(planPath), true);
});

test('preflight rejeita fingerprint revisado de outro componente', async t => {
  const {preflightRun} = await subject('preflight.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-fingerprint-component-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  let consumerPrepared = false;
  let harnessesPrepared = false;
  const dependencies = preflightDependencies(dir, {
    reviewedFingerprint: {component: 'other-component', digest: 'same'},
    prepareConsumer: () => { consumerPrepared = true; },
    prepareHarnessBuilds: () => { harnessesPrepared = true; },
  });

  await assert.rejects(preflightRun({
    repo: '/tmp/tangerina', runDir: dir, component: 'tgr-button', card: 'C-1',
  }, dependencies), /Fingerprint revisado pertence a other-component.*tgr-button/);
  assert.equal(consumerPrepared, false);
  assert.equal(harnessesPrepared, false);
});

test('preflight rejeita fingerprint atual de outro componente', async t => {
  const {preflightRun} = await subject('preflight.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-current-component-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  let harnessesPrepared = false;
  const dependencies = preflightDependencies(dir, {
    currentFingerprint: {component: 'other-component', digest: 'same'},
    prepareHarnessBuilds: () => { harnessesPrepared = true; },
  });

  await assert.rejects(preflightRun({
    repo: '/tmp/tangerina', runDir: dir, component: 'tgr-button', card: 'C-1',
  }, dependencies), /Fingerprint atual pertence a other-component.*tgr-button/);
  assert.equal(harnessesPrepared, false);
});

test('preflight fecha cobertura ausente sem publicar contrato current', async t => {
  const {preflightRun} = await subject('preflight.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-coverage-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const dependencies = preflightDependencies(dir);
  dependencies.definition.contract.requiredBehaviors.push('focus');
  const {plan} = await preflightRun({
    repo: '/tmp/tangerina', runDir: dir, component: 'tgr-button', card: 'C-1',
    brands: ['gol'], themes: ['light'], viewports: ['sm'],
  }, dependencies);
  assert.equal(plan.contract.status, 'stale');
  assert.deepEqual(plan.contract.requiredBehaviors, ['activate', 'focus']);
  assert.deepEqual(plan.contract.coveredBehaviors, ['activate']);
});

test('preflight rejeita contrato de outro consumer ou componente antes dos builds', async t => {
  const {preflightRun} = await subject('preflight.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-contract-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  let prepared = false;
  const dependencies = preflightDependencies(dir, {prepareConsumer: () => { prepared = true; }});
  dependencies.definition.contract.consumer = 'outro';
  await assert.rejects(preflightRun({
    repo: '/tmp/tangerina', runDir: dir, component: 'tgr-button', card: 'C-1',
  }, dependencies), /Contrato incompativel/);
  assert.equal(prepared, false);
});

test('preflight valida o plano antes de preparar harnesses', async t => {
  const {preflightRun} = await subject('preflight.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-plan-first-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  let harnessesPrepared = false;
  const dependencies = preflightDependencies(dir, {
    prepareHarnessBuilds: () => { harnessesPrepared = true; },
  });
  await assert.rejects(preflightRun({
    repo: '/tmp/tangerina',
    runDir: dir,
    component: 'tgr-button',
    card: 'C-1',
    selectedBrowsers: [],
  }, dependencies), /vazia ou duplicada/);
  assert.equal(harnessesPrepared, false);
});

test('preflight marca qualquer run filtrado como diagnostico', async t => {
  const {preflightRun} = await subject('preflight.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-filtered-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const secondary = {...scene, id: 'secondary', name: 'Secondary'};
  const dependencies = preflightDependencies(dir);
  dependencies.definition.scenes.push(secondary);
  const {plan} = await preflightRun({
    repo: '/tmp/tangerina',
    runDir: dir,
    component: 'tgr-button',
    card: 'C-1',
    scenesFilter: ['primary'],
    brands: ['gol'],
    themes: ['light', 'dark'],
    viewports: ['sm', 'lg'],
  }, dependencies);
  assert.equal(plan.diagnostic, true);
});
