const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const browsers = ['chromium', 'firefox', 'webkit'];
const frameworks = ['wc', 'react', 'angular'];

function assertArtifact(runDir, relativePath) {
  assert.equal(path.isAbsolute(relativePath), false);
  const absolutePath = path.resolve(runDir, relativePath);
  assert.equal(path.relative(runDir, absolutePath).startsWith('..'), false);
  assert.equal(fs.existsSync(absolutePath), true, absolutePath);
}

function assertPublishedRun(runDir, manifest) {
  for (const file of ['playwright.log', 'manifest.json', 'summary.md', 'index.html']) {
    assert.equal(fs.existsSync(path.join(runDir, file)), true, path.join(runDir, file));
  }
  assert.equal(manifest.attempts.length, browsers.length);
  for (const logical of manifest.attempts) {
    assert.equal(logical.attempts.length, 1);
    assertArtifact(runDir, logical.attempts[0].resultPath);
  }
  for (const logical of manifest.behavior.results) {
    assert.match(logical.logicalTestId, /^primary-gol-light-sm--(chromium|firefox|webkit)$/);
  }
  for (const group of manifest.groups) {
    for (const framework of frameworks) assertArtifact(runDir, group[framework]);
  }
}

test('Contraprova Controlada aprova baseline e reprova divergencia React nos tres browsers', {timeout: 240000}, async t => {
  const [{writeRunPlan}, {finalizeRun}, {invokePlaywright}] = await Promise.all([
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/runPlan.ts')).href),
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/finalize.ts')).href),
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/invoke.ts')).href),
  ]);
  const fixtureRoot = path.join(__dirname, 'fixtures', 'controlled-counterproof');
  const scene = {
    id: 'primary', cellId: 'primary-gol-light-sm', name: 'Primary', component: 'tgr-button', args: {}, slots: {},
    brand: 'gol', theme: 'light', viewport: 'sm', width: 360,
  };
  async function runMatrix(variant, reactFixture) {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), `anemoi-counterproof-${variant}-`));
    t.after(() => fs.rmSync(runDir, {recursive: true, force: true}));
    fs.writeFileSync(path.join(runDir, 'builds.json'), JSON.stringify({
      wc: path.join(fixtureRoot, 'wc'),
      react: path.join(fixtureRoot, reactFixture),
      angular: path.join(fixtureRoot, 'angular'),
    }));
    const plan = {
      schemaVersion: 1, runId: `counterproof-${variant}`, runDir, repo: '/fixture', consumer: 'fixture', component: 'tgr-button', card: 'COUNTERPROOF',
      diagnostic: false, collectA11y: true, browsers, requiredBrowsers: browsers, frameworks,
      specPath: path.join(__dirname, 'browser', 'controlled-counterproof.spec.ts'), hostsPath: path.join(runDir, 'hosts.json'), scenes: [scene],
      contract: {status: 'current', fingerprintDigest: 'fixture', currentDigest: 'fixture', requiredBehaviors: ['activation-emits-tgr-click'], coveredBehaviors: ['activation-emits-tgr-click'], routes: [{id: 'activation', sceneId: 'primary', covers: ['activation-emits-tgr-click']}]},
    };
    const planPath = path.join(runDir, 'run-plan.json');
    writeRunPlan(planPath, plan);
    const execution = await invokePlaywright({planPath, logPath: path.join(runDir, 'playwright.log')});
    const manifest = finalizeRun(planPath);
    assertPublishedRun(runDir, manifest);
    return {execution, manifest};
  }

  const clean = await runMatrix('clean', 'wc');
  assert.equal(clean.execution.exitCode, 0);
  assert.equal(clean.manifest.status, 'passed');
  assert.equal(clean.manifest.gate.status, 'passed');
  assert.deepEqual(clean.manifest.axes.browsers, browsers);
  assert.equal(clean.manifest.behavior.results.length, browsers.length);
  for (const dimension of Object.values(clean.manifest.gate.dimensions)) {
    assert.equal(dimension.status, 'passed');
  }

  const defective = await runMatrix('defective', 'react');
  assert.equal(defective.execution.exitCode, 1);
  assert.equal(defective.manifest.status, 'failed');
  assert.equal(defective.manifest.gate.status, 'failed');
  assert.deepEqual(defective.manifest.axes.browsers, browsers);
  assert.equal(defective.manifest.behavior.results.length, browsers.length);
  assert.deepEqual(Object.fromEntries(Object.entries(defective.manifest.gate.dimensions)
    .map(([name, dimension]) => [name, dimension.status])), {
    browserCoverage: 'passed',
    visualParity: 'passed',
    dimensions: 'passed',
    axe: 'passed',
    ariaParity: 'passed',
    behavioralConformance: 'failed',
    behavioralParity: 'failed',
    contractCoverage: 'passed',
    stability: 'failed',
  });
  for (const logical of defective.manifest.behavior.results) {
    const route = logical.routes[0];
    assert.equal(route.parity, 'failed');
    assert.equal(route.frameworks.wc.conformance, 'passed');
    assert.equal(route.frameworks.react.conformance, 'failed');
    assert.equal(route.frameworks.angular.conformance, 'passed');
    assert.equal(route.frameworks.wc.observation.events.length, 1);
    assert.equal(route.frameworks.react.observation.events.length, 0);
    assert.equal(route.frameworks.angular.observation.events.length, 1);
  }
});
