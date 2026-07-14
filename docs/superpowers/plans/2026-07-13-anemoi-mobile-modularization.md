# Anemoi Mobile Modularization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing React Native/Detox engine and GOL_APP_Mobile integration into the stabilized workspace structure, then split the 2,013-line Mobile CLI into cohesive modules without changing any public Mobile contract.

**Architecture:** `packages/mobile` remains the independent `@gol-smiles/anemoi-preset` runtime and must not depend on `packages/core` or `packages/web`. The thin CLI dispatches to config, registry, doctor, runner, runtime, and reporting modules; `integrations/gol-app-mobile` contains only GOL-specific registry, Detox adapter, native entrypoint, and host documentation. Characterization tests lock behavior before each move or extraction.

**Tech Stack:** Node.js 24 CommonJS, Node test runner, React Native host configuration, Detox, Metro, JSON registries, npm workspaces.

## Global Constraints

- Preserve npm package name `@gol-smiles/anemoi-preset`, bin name `anemoi`, every current CLI flag, command, environment variable, output path, registry schema, Detox configuration name, error message, and GOL_APP_Mobile legacy contract.
- Preserve the host-side names `yarn ds:evidence`, `ds-evidence.config.js`, `packages/ds-evidence-preset`, `detox/`, `automation/ds`, `DsEvidenceScreen`, and every `ds-evidence-*` test ID.
- Keep Mobile independent from `packages/core` and `packages/web`; do not share helpers unless contracts and behavior are genuinely identical.
- Do not add a plugin API, rename host contracts, alter before/after semantics, change source-stash behavior, or add a new rendering runtime.
- Preserve existing edge behavior during this refactor: CLI flow normalization, `--add-flow`, and the Detox test intentionally have different `targetTestID` defaults; omitted `--mode` in reference mode currently means `package`; displayed mixed-category flow numbering and numeric selection use different orderings; Doctor currently evaluates Tangerina paths as stored rather than re-resolving them. Correcting any of these requires a separate behavioral change after this plan.
- Every extraction starts with a failing characterization/unit test, ends with focused tests plus root `npm test`, and is committed independently.
- Commands that bind local ports or invoke host tooling must be run outside a sandbox that blocks listeners or child processes.

## Target File Map

| Path | Responsibility |
| --- | --- |
| `packages/mobile/src/cli.js` | Parse argv and dispatch commands only. |
| `packages/mobile/src/config.js` | Resolve/load host config, host-relative paths, JSON/filesystem helpers, and `--init`. |
| `packages/mobile/src/registry.js` | Normalize flows/references, validate selections, collect inputs, and implement `--add-flow`. |
| `packages/mobile/src/doctor.js` | Validate config, registry, DS paths, devices, Metro port, and derived Detox binaries. |
| `packages/mobile/src/runners/evidence.js` | Orchestrate before/after and reference evidence runs. |
| `packages/mobile/src/runners/interactive.js` | Orchestrate the interactive device flow. |
| `packages/mobile/src/runtime/metro.js` | Probe, start, await, log, and stop Metro. |
| `packages/mobile/src/runtime/detox.js` | Construct and execute Detox build/test commands and collect capture metadata. |
| `packages/mobile/src/runtime/device.js` | Generic child-command execution and device/deep-link commands. |
| `packages/mobile/src/runtime/source-toggle.js` | Validate source diffs and push/pop the scoped source stash. |
| `packages/mobile/src/reporting/manifest.js` | Construct/write manifests and collect run metadata. |
| `packages/mobile/src/reporting/summary.js` | Write `summary.md`. |
| `packages/mobile/src/reporting/html.js` | Validate, render, and write single/per-flow HTML reports. |
| `integrations/gol-app-mobile/` | GOL registry, Detox/Jest/native adapter, context, and integration-only documentation. |
| `docs/guides/mobile.md` | Canonical operational Mobile guide. |
| `docs/adr/mobile-*.md` | Canonical Mobile architectural decisions. |

## Mechanical Extraction Protocol

The baseline for every extraction is immutable commit `9a451d0`. Before Task 2, save the source used
by all later tasks:

```bash
git show 9a451d0:anemoi-preset/src/cli.js > /tmp/anemoi-mobile-cli-baseline.js
test "$(wc -l < /tmp/anemoi-mobile-cli-baseline.js)" -eq 2013
```

Expected: the assertion exits `0`. “Move function X” below always means: copy the complete top-level
declaration named X byte-for-byte from that baseline into the named target, remove it from the active
`packages/mobile/src/cli.js`, then add exactly the imports and `module.exports` shown in the task. Do
not rewrite a function body during the mechanical extraction step. A later RED/GREEN step in the
same task may introduce the explicitly described dependency seam; commit only after both the
byte-preserving characterization suite and the new focused test pass. This separates relocation
from testability changes while avoiding a second, drifting 2,013-line source listing in this plan.

After each extraction, prove that every named declaration exists exactly once:

```bash
NAMES='loadConfig runInit' node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = 'packages/mobile/src';
const files = [];
const visit = dir => {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(target);
    else if (entry.name.endsWith('.js')) files.push(target);
  }
};
visit(root);
const declarations = process.env.NAMES.split(/\s+/).filter(Boolean);
for (const name of declarations) {
  const pattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, 'g');
  const matches = files.map(file => ({
    file,
    count: (fs.readFileSync(file, 'utf8').match(pattern) || []).length,
  })).filter(item => item.count > 0);
  const total = matches.reduce((sum, item) => sum + item.count, 0);
  if (total !== 1) {
    throw new Error(`${name}: expected one declaration, found ${total} in ${matches.map(item => `${item.file}:${item.count}`).join(', ')}`);
  }
  const owners = matches.map(item => item.file);
  console.log(`${name}: ${owners[0]}`);
}
NODE
```

Replace the example `NAMES` value with the function names from the current task. Constants use
an equivalent `rg -n '^const NAME =' packages/mobile/src` assertion. The package root export remains
exactly `createDetoxConfig` and `getTangerinaMetroConfig`; internal exports below are not re-exported
from `src/index.js`.

The allowed dependency graph is exact:

```text
cli -> config, registry, doctor, runners/evidence, runners/interactive, reporting/html
registry -> config
doctor -> config, registry, lib/detoxConfig
runners/evidence -> config, registry, runtime/metro, runtime/detox,
                    runtime/source-toggle, reporting/manifest, reporting/summary, reporting/html
runners/interactive -> runtime/metro, runtime/device
runtime/metro -> config
runtime/detox -> runtime/device
runtime/device -> runtime/metro
runtime/source-toggle -> config, runtime/device
reporting/manifest -> config, registry
reporting/summary -> config
reporting/html -> config, registry, reporting/manifest, reporting/summary
```

The only permitted semantic changes are test seams with these exact signatures; default calls must
execute the byte-preserved production behavior:

```js
async function chooseFlows(args, input, {askQuestion = defaultAskQuestion} = {})
async function runAddFlow(args, config, {askQuestion = defaultAskQuestion} = {})
function runCommand(command, args, options = {}, {spawnSync = childProcess.spawnSync} = {})
function checkMetro(port, {get = http.get} = {})
async function assertMetroPortIsFree(port, {probe = checkMetro} = {})
async function waitForMetro(port, metro, {probe = checkMetro, pause = wait} = {})
function startMetro(config, mode, port, options = {}, {spawn = childProcess.spawn} = {})
async function openInteractiveUrl(config, platform, url, {run = runCommand, pause = wait} = {})
async function runEvidence(args, config, input, deps = productionDependencies)
async function runReference(args, config, input, deps = productionDependencies)
async function runInteractive(args, config, input, deps = productionDependencies)
function doctorEnvironment(config, issues, warnings, {spawnSync = childProcess.spawnSync} = {})
function runDoctor(config, deps = productionDependencies)
async function runCli(argv, cwd = process.cwd(), deps = productionDependencies)
```

For each signature, the GREEN edit consists only of replacing the direct dependency reference with
the named parameter and adding its default. No branch, command, message, timeout, path, env key, or
return value may change. The pre-existing characterization tests run before and after every seam;
the focused tests invoke the seam with fakes.

Define the defaults exactly in their owning modules:

```js
// registry.js, after askQuestion is declared
const defaultAskQuestion = askQuestion;

// runners/evidence.js, after all imports and local helpers are declared
const productionDependencies = {
  ensureDir,
  slug,
  assertHtmlOutput,
  makeRunManifest,
  writeOutputs,
  sourcePathsFor,
  assertNoOrphanStash,
  ensureSourceDiff,
  detoxCommand,
  detoxCommandAsync,
  assertMetroPortIsFree,
  startMetro,
  waitForMetro,
  runDetoxPhase,
  pushSourceStash,
  popSourceStash,
  stopProcess,
  wait,
  now: () => new Date(),
  write: console.log,
};

// runners/interactive.js
const waitForSignal = () => new Promise(resolve => {
  process.once('SIGINT', resolve);
  process.once('SIGTERM', resolve);
});
const productionDependencies = {
  startDeviceCommand,
  runCommand,
  assertMetroPortIsFree,
  startMetro,
  waitForMetro,
  interactiveRunCommand,
  relaunchAppBeforeDeepLink,
  openInteractiveUrl,
  stopProcess,
  now: Date.now,
  waitForSignal,
  write: console.log,
};

// doctor.js
const productionDependencies = {
  loadRegistry,
  flowsForEntry,
  doctorEnvironment,
  write: console.log,
  warn: console.warn,
};
```

Within a runner, destructure the listed object at function entry and replace only same-named direct
references. `runReference` and `runEvidence` share the evidence defaults. Tests pass a shallow object
`{...productionDependencies, dependencyToFake}`; export `productionDependencies` only from the
owning internal module for focused tests, never from package `src/index.js`.

No module may import `cli.js` or a runner; runtime and reporting modules may not import each other
except for the edges listed above. Add this complete `packages/mobile/test/boundaries.test.js` file
in Task 7:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MOBILE_ROOT = path.resolve(__dirname, '..');

test('mobile module dependency direction stays acyclic', () => {
  const allowed = {
    'src/cli.js': ['./config', './registry', './doctor', './runners/evidence', './runners/interactive', './reporting/html'],
    'src/config.js': [],
    'src/registry.js': ['./config'],
    'src/doctor.js': ['./config', './registry', './lib/detoxConfig'],
    'src/runners/evidence.js': ['../config', '../registry', '../runtime/metro', '../runtime/detox', '../runtime/source-toggle', '../reporting/manifest', '../reporting/summary', '../reporting/html'],
    'src/runners/interactive.js': ['../runtime/metro', '../runtime/device'],
    'src/runtime/metro.js': ['../config'],
    'src/runtime/detox.js': ['./device'],
    'src/runtime/device.js': ['./metro'],
    'src/runtime/source-toggle.js': ['../config', './device'],
    'src/reporting/manifest.js': ['../config', '../registry'],
    'src/reporting/summary.js': ['../config'],
    'src/reporting/html.js': ['../config', '../registry', './manifest', './summary'],
  };
  const requirePattern = /require\(['"](\.[^'"]+)['"]\)/g;
  for (const [relative, expected] of Object.entries(allowed)) {
    const source = fs.readFileSync(path.join(MOBILE_ROOT, relative), 'utf8');
    const actual = [...source.matchAll(requirePattern)].map(match => match[1]).sort();
    assert.deepEqual([...new Set(actual)], [...expected].sort(), relative);
  }
});
```

---

### Task 1: Lock the Existing Mobile Contracts with Characterization Tests

**Files:**
- Create: `anemoi-preset/test/cli-characterization.test.js`
- Create: `anemoi-preset/test/public-api.test.js`
- Modify: `anemoi-preset/package.json`
- Modify: `test/workspace.test.js`

**Interfaces:**
- Consumes: current `anemoi-preset/src/cli.js#runCli(argv, cwd)` and `src/index.js` exports.
- Produces: a deterministic regression suite that later tasks run unchanged after path updates.

- [ ] **Step 1: Add a failing package-test assertion**

Add this assertion to `test/workspace.test.js` before adding the script:

```js
const mobile = json('anemoi-preset/package.json');
assert.equal(mobile.name, '@gol-smiles/anemoi-preset');
assert.equal(mobile.bin.anemoi, 'bin/anemoi.js');
assert.equal(mobile.scripts.test, 'node --test test/*.test.js');
```

- [ ] **Step 2: Run the root workspace test and confirm RED**

Run: `node --test test/workspace.test.js`

Expected: FAIL because `mobile.scripts.test` is absent.

- [ ] **Step 3: Add the package test script and characterization fixture helpers**

Set this exact script in `anemoi-preset/package.json`:

```json
"scripts": {
  "test": "node --test test/*.test.js"
}
```

In `cli-characterization.test.js`, use `fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-mobile-'))`, remove it in `t.after`, and provide these helpers:

```js
const captureConsole = async action => {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    await action();
    return lines.join('\n');
  } finally {
    console.log = original;
  }
};

const writeHost = root => {
  fs.mkdirSync(path.join(root, 'detox/anemoi'), {recursive: true});
  fs.writeFileSync(path.join(root, 'detox/anemoi/registry.json'), JSON.stringify({
    Button: {
      sourcePaths: ['src/components/Button'],
      flows: [{flowId: 'primary', category: 'testState', label: 'Primary', targetTestID: 'ds-evidence-primary'}],
      references: [],
    },
  }));
  fs.writeFileSync(path.join(root, 'ds-evidence.config.js'), `module.exports = {
    repoRoot: '.', scheme: 'gol://', registryPath: 'detox/anemoi/registry.json',
    outputDir: 'outputs/anemoi', metroPort: 8081,
    commands: {interactiveRun: {ios: ['true', []]}},
    tangerina: {corePath: '.'}, defaultSourcePaths: component => ['src/components/' + component]
  };\n`);
};
```

- [ ] **Step 4: Characterize init, list, and public API behavior**

Write tests that call `runCli(['--init'], root)` and assert exact creation of `ds-evidence.config.js` plus `detox/anemoi/registry.json`; call `runCli(['--component', 'Button', '--list-flows'], root)` after `writeHost(root)` and assert output contains `Estados de teste:`, `primary`, and `Primary`. In `public-api.test.js`, assert:

```js
const api = require('../src');
assert.deepEqual(Object.keys(api).sort(), ['createDetoxConfig', 'getTangerinaMetroConfig']);
assert.equal(typeof require('../src/cli').runCli, 'function');
```

Also assert the literal legacy defaults in the generated config: `ds-evidence.config.js`, `detox/anemoi/registry.json`, `outputs/anemoi`, and `automation/ds` where applicable.

- [ ] **Step 5: Run characterization and root tests**

Run:

```bash
npm test --workspace @gol-smiles/anemoi-preset
npm test
```

Expected: Mobile characterization PASS and all existing Web/Core/root tests PASS.

- [ ] **Step 6: Commit**

```bash
git add anemoi-preset/package.json anemoi-preset/test test/workspace.test.js package-lock.json
git commit -m "test(mobile): characterize legacy preset contracts"
```

### Task 2: Move the Mobile Package and GOL Integration Atomically

**Files:**
- Move: `anemoi-preset/` -> `packages/mobile/`
- Move: `gol-adapter-detox/` -> `integrations/gol-app-mobile/`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `test/workspace.test.js`
- Modify: `integrations/gol-app-mobile/anemoi.js`
- Modify: `integrations/gol-app-mobile/anemoi.test.js`
- Modify: `integrations/gol-app-mobile/.detoxrc.js`

**Interfaces:**
- Consumes: Task 1 characterization suite and unchanged package/bin names.
- Produces: stable target paths used by every later task.

- [ ] **Step 1: Change workspace expectations first**

Update `test/workspace.test.js` to expect:

```js
assert.deepEqual(root.workspaces, ['packages/core', 'packages/web', 'packages/mobile']);
assert.equal(json('packages/mobile/package.json').name, '@gol-smiles/anemoi-preset');
assert.equal(fs.existsSync(path.join(ROOT, 'anemoi-preset')), false);
assert.equal(fs.existsSync(path.join(ROOT, 'gol-adapter-detox')), false);
assert.equal(fs.existsSync(path.join(ROOT, 'integrations/gol-app-mobile/anemoi.js')), true);
assert.match(
  fs.readFileSync(path.join(ROOT, 'integrations/gol-app-mobile/anemoi.test.js'), 'utf8'),
  /\.\.\/\.\.\/packages\/mobile\/src\/lib\/detoxEvidenceTest/,
);
assert.match(
  fs.readFileSync(path.join(ROOT, 'integrations/gol-app-mobile/.detoxrc.js'), 'utf8'),
  /\.\.\/\.\.\/packages\/mobile\/src/,
);
```

- [ ] **Step 2: Run the workspace test and confirm RED**

Run: `node --test test/workspace.test.js`

Expected: FAIL because target paths do not exist.

- [ ] **Step 3: Move both trees and repair only internal relative imports**

Run:

```bash
mkdir -p integrations
git mv anemoi-preset packages/mobile
git mv gol-adapter-detox integrations/gol-app-mobile
```

Change the two adapter imports exactly:

```js
// integrations/gol-app-mobile/anemoi.js
require('../../packages/mobile/bin/anemoi');

// integrations/gol-app-mobile/anemoi.test.js
const {registerDetoxEvidenceTests} = require('../../packages/mobile/src/lib/detoxEvidenceTest');

// integrations/gol-app-mobile/.detoxrc.js
const {createDetoxConfig} = require('../../packages/mobile/src');
```

Do not rename `ds-evidence` host contracts or package/bin names.

- [ ] **Step 4: Update workspace metadata mechanically**

Replace `anemoi-preset` with `packages/mobile` in root `workspaces`, then run:

```bash
npm install --package-lock-only --ignore-scripts
```

Expected: `package-lock.json` contains `packages/mobile` and its workspace link, with no `anemoi-preset` workspace entry.

- [ ] **Step 5: Verify move and integration loading**

Run:

```bash
npm test --workspace @gol-smiles/anemoi-preset
npm test
```

Expected: characterization remains green and the workspace test proves the adapter points at the moved Detox test registration contract without trying to boot Detox under Node's unit-test runner.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json packages/mobile integrations/gol-app-mobile test/workspace.test.js
git commit -m "refactor(mobile): move engine and GOL integration"
```

### Task 3: Extract Configuration and Registry Modules

**Files:**
- Create: `packages/mobile/src/config.js`
- Create: `packages/mobile/src/registry.js`
- Create: `packages/mobile/test/config.test.js`
- Create: `packages/mobile/test/registry.test.js`
- Modify: `packages/mobile/src/cli.js`
- Modify: `packages/mobile/test/cli-characterization.test.js`

**Interfaces:**
- Consumes: Node filesystem/path, `ds-evidence.config.js`, and registry JSON.
- Produces: `config.js` exports `readJson`, `ensureDir`, `slug`, `relative`, `resolveConfigPath`, `loadConfig`, `resolveHostPath`, `runInit`; `registry.js` exports `FLOW_CATEGORIES`, `loadRegistry`, `flowsForEntry`, `referencesForEntry`, `formatFlowList`, `normalizePlatforms`, `collectInputs`, `chooseFlows`, `runAddFlow`.

```js
// config.js
module.exports = {readJson, ensureDir, slug, relative, resolveConfigPath, loadConfig, resolveHostPath, runInit};

// registry.js
module.exports = {
  FLOW_CATEGORIES,
  loadRegistry,
  flowsForEntry,
  referencesForEntry,
  formatFlowList,
  normalizePlatforms,
  collectInputs,
  chooseFlows,
  runAddFlow,
};
```

- [ ] **Step 1: Write focused failing tests**

In `config.test.js`, assert that `loadConfig({}, nestedCwd)` resolves `configPath`, resolves `repoRoot` relative to the config file, and leaves function-valued config fields callable. Assert `runInit(root)` is idempotent and does not overwrite existing files.

In `registry.test.js`, cover these exact cases:

```js
assert.deepEqual(normalizePlatforms(), ['ios']);
assert.deepEqual(normalizePlatforms('both'), ['ios', 'android']);
assert.throws(() => normalizePlatforms('windows'), /Unsupported platform: windows/);
assert.equal(flowsForEntry({harness: [{scenarioId: 'old'}]})[0].flowId, 'old');
assert.equal(referencesForEntry({realScreens: [{screen: 'Home'}]})[0].screen, 'Home');
```

Use a temp registry to assert unknown flows include the available-flow list and typo suggestion, and that `--scenarios` remains a deprecated alias for `--flows`.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test packages/mobile/test/config.test.js packages/mobile/test/registry.test.js`

Expected: FAIL with module-not-found for `config.js` and `registry.js`.

- [ ] **Step 3: Move configuration functions without semantic edits**

Move `readJson`, `ensureDir`, `slug`, `repoRootFromConfigPath`, `resolveConfigPath`, `loadConfig`, `resolveHostPath`, `relative`, and `runInit` into `config.js`. Keep the generated config and registry templates byte-for-byte equivalent. Export only the signatures listed in **Interfaces**.

- [ ] **Step 4: Move registry and flow-selection functions**

Move `FLOW_CATEGORIES`, `basename`, flow/reference normalization, list formatting, Levenshtein suggestion, platform normalization, input collection, selection parsing/prompting, registry writing, flow stub generation, and `runAddFlow` into `registry.js`. Inject the question function into interactive helpers with defaults:

```js
async function chooseFlows(args, input, {askQuestion = defaultAskQuestion} = {})
async function runAddFlow(args, config, {askQuestion = defaultAskQuestion} = {})
```

This makes tests deterministic while preserving production behavior.

- [ ] **Step 5: Reduce CLI imports and verify behavior**

Keep `parseArgs` in `cli.js`; import `loadConfig`/`runInit` and registry commands. Re-run:

```bash
node --test packages/mobile/test/config.test.js packages/mobile/test/registry.test.js packages/mobile/test/cli-characterization.test.js
npm test
```

Expected: focused tests and full suite PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/mobile/src/config.js packages/mobile/src/registry.js packages/mobile/src/cli.js packages/mobile/test
git commit -m "refactor(mobile): extract config and registry modules"
```

### Task 4: Extract Metro, Detox, Device, and Source-Toggle Runtime Modules

**Files:**
- Create: `packages/mobile/src/runtime/metro.js`
- Create: `packages/mobile/src/runtime/detox.js`
- Create: `packages/mobile/src/runtime/device.js`
- Create: `packages/mobile/src/runtime/source-toggle.js`
- Create: `packages/mobile/test/runtime-metro.test.js`
- Create: `packages/mobile/test/runtime-detox.test.js`
- Create: `packages/mobile/test/runtime-device.test.js`
- Create: `packages/mobile/test/runtime-source-toggle.test.js`
- Modify: `packages/mobile/src/cli.js`

**Interfaces:**
- Consumes: normalized host config and child-process/http/filesystem dependencies.
- Produces: deterministic command builders plus runtime executors used by runners and doctor.

```js
// runtime/metro.js
module.exports = {wait, checkMetro, assertMetroPortIsFree, waitForMetro, startMetro, stopProcess};

// runtime/detox.js
module.exports = {
  detoxConfiguration,
  detoxCommandArgs,
  detoxCommandEnv,
  detoxCommand,
  detoxCommandAsync,
};

// runtime/device.js
module.exports = {
  runCommand,
  openUrlCommand,
  terminateAppCommand,
  startDeviceCommand,
  interactiveRunCommand,
  relaunchAppBeforeDeepLink,
  openInteractiveUrl,
};

// runtime/source-toggle.js
module.exports = {
  STASH_MESSAGE_PREFIX,
  sourceRepoRoot,
  sourcePathsFor,
  ensureSourceDiff,
  assertNoOrphanStash,
  pushSourceStash,
  popSourceStash,
};
```

- [ ] **Step 1: Write RED tests for command construction and cleanup**

Assert:

```js
assert.equal(detoxConfiguration('ios'), 'ds.ios.debug');
assert.equal(detoxConfiguration('android'), 'ds.android.debug');
assert.throws(() => detoxConfiguration('web'), /Unsupported platform: web/);
assert.deepEqual(detoxCommandArgs({detoxConfigPath: 'detox/.detoxrc.js'}, 'build', 'ios'), [
  'detox', 'build', '--config-path', 'detox/.detoxrc.js', '-c', 'ds.ios.debug',
]);
```

Use injected `spawnSync` to assert `runCommand` merges env, preserves cwd, honors `allowFailure`, and throws the existing status message. Use injected HTTP/spawn dependencies to assert occupied Metro ports fail, failed Metro startup includes log tail, and `stopProcess` sends `SIGTERM`. Use a temporary Git repo or injected command runner to assert source-toggle only stashes configured source paths and always pops the exact created stash.

- [ ] **Step 2: Run runtime tests and confirm RED**

Run: `node --test packages/mobile/test/runtime-*.test.js`

Expected: FAIL because runtime modules do not exist.

- [ ] **Step 3: Extract generic command and device operations**

Move `runCommand`, `openUrlCommand`, `terminateAppCommand`, `startDeviceCommand`,
`interactiveRunCommand`, `relaunchAppBeforeDeepLink`, and `openInteractiveUrl` to
`runtime/device.js`. Import `wait` from `./metro`. In the following GREEN seam, add the optional
`spawnSync` parameter to `runCommand` and optional command/wait dependencies to
`openInteractiveUrl`, defaulting each to its production implementation; keep all command arrays,
cwd/env values, retry count, and error text unchanged.

- [ ] **Step 4: Extract Metro lifecycle**

Move `wait`, `stopProcess`, `checkMetro`, `assertMetroPortIsFree`, `waitForMetro`, and `startMetro`
to `runtime/metro.js`. Preserve 60 attempts, one-second probe timeout, 200-line memory tail, 60-line
failure tail, file logging, verbose echo, `SIGTERM`, and `RCT_METRO_PORT`/`TANGERINA_MODE` env values.

- [ ] **Step 5: Extract Detox and source-toggle behavior**

Move `detoxConfiguration`, `detoxCommandArgs`, `detoxCommandEnv`, and sync/async command execution to `runtime/detox.js`. Move `sourceRepoRoot`, `sourcePathsFor`, `ensureSourceDiff`, `assertNoOrphanStash`, `pushSourceStash`, and `popSourceStash` to `runtime/source-toggle.js`. Preserve `STASH_MESSAGE_PREFIX = 'anemoi-preset:'` and every existing env key. `runDetoxPhase` belongs to the evidence runner in Task 6; `collectCaptureMetadata` belongs to the manifest module in Task 5.

- [ ] **Step 6: Verify focused and full suites**

Run:

```bash
node --test packages/mobile/test/runtime-*.test.js
npm test --workspace @gol-smiles/anemoi-preset
npm test
```

Expected: all tests PASS and `packages/mobile/src/cli.js` no longer imports `http` or `child_process`.

- [ ] **Step 7: Commit**

```bash
git add packages/mobile/src/runtime packages/mobile/src/cli.js packages/mobile/test/runtime-*.test.js
git commit -m "refactor(mobile): extract runtime boundaries"
```

### Task 5: Extract Manifest, Summary, and HTML Reporting

**Files:**
- Create: `packages/mobile/src/reporting/manifest.js`
- Create: `packages/mobile/src/reporting/summary.js`
- Create: `packages/mobile/src/reporting/html.js`
- Create: `packages/mobile/test/reporting-manifest.test.js`
- Create: `packages/mobile/test/reporting-summary.test.js`
- Create: `packages/mobile/test/reporting-html.test.js`
- Modify: `packages/mobile/src/cli.js`

**Interfaces:**
- Consumes: normalized input and capture metadata.
- Produces: `manifest.json`, `summary.md`, and optional single/per-flow HTML with unchanged filenames and content semantics.

```js
// reporting/manifest.js
module.exports = {writeManifest, makeRunManifest, collectCaptureMetadata};

// reporting/summary.js
module.exports = {writeSummary};

// reporting/html.js
module.exports = {assertHtmlOutput, assertHtmlImagesExist, renderHtml, writeHtml, runHtmlOnly};
```

- [ ] **Step 1: Characterize report outputs before extraction**

Create one fixture manifest with iOS, component `Button`, card `CDCOM-1`, flow `primary`, before/after captures, one reference, and `htmlOutput: 'single'`. Assert `writeManifest` ends with a newline, summary includes `outputs/anemoi`, and HTML contains the before/after captions, escaped text, flow label, and relative image paths. Add a per-flow case asserting both the named flow HTML and index links.

- [ ] **Step 2: Run report tests and confirm RED**

Run: `node --test packages/mobile/test/reporting-*.test.js`

Expected: FAIL because reporting modules do not exist.

- [ ] **Step 3: Extract manifest and summary functions**

Move `makeRunManifest`, `writeManifest`, `collectCaptureMetadata`, and metadata shaping to `reporting/manifest.js`; move `writeSummary` to `reporting/summary.js`. Import `slug` and `relative` from `config.js`; do not introduce a Mobile-to-Web/Core dependency.

- [ ] **Step 4: Extract HTML functions**

Move `escapeHtml`, `formatDatePtBr`, `imageFigure`, `flowDiagram`, `renderHtml`, `assertHtmlOutput`, `writeHtml`, `assertHtmlImagesExist`, and `runHtmlOnly` to `reporting/html.js`. Preserve `single` and `per-flow`, named HTML files, missing-image handling, reference mode, crop warnings, and image-existence failures.

- [ ] **Step 5: Verify byte-level invariants and full suite**

Run:

```bash
node --test packages/mobile/test/reporting-*.test.js
npm test --workspace @gol-smiles/anemoi-preset
npm test
```

Expected: all report assertions and characterization tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/mobile/src/reporting packages/mobile/src/cli.js packages/mobile/test/reporting-*.test.js
git commit -m "refactor(mobile): extract evidence reporting"
```

### Task 6: Extract Evidence and Reference Runners

**Files:**
- Create: `packages/mobile/src/runners/evidence.js`
- Create: `packages/mobile/test/runner-evidence.test.js`
- Modify: `packages/mobile/src/cli.js`

**Interfaces:**
- Consumes: runtime modules from Task 4 and reporting modules from Task 5.
- Produces: `runEvidence(args, config, input, deps?)` and `runReference(args, config, input, deps?)`.

```js
module.exports = {runDetoxPhase, writeOutputs, runEvidence, runReference};
```

- [ ] **Step 1: Write orchestration tests with injected dependencies**

Build spies for `ensureSourceDiff`, `detoxCommand`, `detoxCommandAsync`, `assertMetroPortIsFree`, `startMetro`, `waitForMetro`, `runDetoxPhase`, `pushSourceStash`, `popSourceStash`, `stopProcess`, and `writeOutputs`. Assert the before/after call order is:

```text
source validation -> build -> port check -> Metro start -> Metro ready -> after -> stash push -> before -> stash pop -> Metro stop -> outputs
```

Add failure cases proving `popSourceStash` and `stopProcess` run when the before phase throws. Add reference cases proving invalid modes fail, an omitted mode preserves the current `package` default, one phase is named `reference`, no source stash occurs, and `TANGERINA_MODE` equals the effective mode.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test packages/mobile/test/runner-evidence.test.js`

Expected: FAIL because `runners/evidence.js` does not exist.

- [ ] **Step 3: Move run-directory and evidence orchestration**

Move `runDetoxPhase`, `writeOutputs`, `runEvidence`, and `runReference` into `runners/evidence.js`. Use one optional dependency object with production defaults:

```js
async function runEvidence(args, config, input, deps = productionDependencies)
async function runReference(args, config, input, deps = productionDependencies)
```

Keep timestamp sanitization, output layout `outputs/anemoi/<card>/<component>/<timestamp>`, sequential builds by default, opt-in parallel builds, dry-run behavior, `--skip-build`, and the one-Metro before/after lifecycle unchanged.

- [ ] **Step 4: Wire the CLI and verify cleanup behavior**

Import both runners from `./runners/evidence`; remove their implementation and runtime/reporting imports from `cli.js`. Run:

```bash
node --test packages/mobile/test/runner-evidence.test.js
npm test --workspace @gol-smiles/anemoi-preset
npm test
```

Expected: all tests PASS, including failure cleanup.

- [ ] **Step 5: Commit**

```bash
git add packages/mobile/src/runners/evidence.js packages/mobile/src/cli.js packages/mobile/test/runner-evidence.test.js
git commit -m "refactor(mobile): extract evidence runners"
```

### Task 7: Extract Interactive Runner and Doctor, Leaving a Thin CLI

**Files:**
- Create: `packages/mobile/src/runners/interactive.js`
- Create: `packages/mobile/src/doctor.js`
- Create: `packages/mobile/test/runner-interactive.test.js`
- Create: `packages/mobile/test/doctor.test.js`
- Create: `packages/mobile/test/cli-dispatch.test.js`
- Create: `packages/mobile/test/boundaries.test.js`
- Modify: `packages/mobile/src/cli.js`

**Interfaces:**
- Consumes: config, registry, runtime, report, and evidence-runner APIs from Tasks 3–6.
- Produces: thin `runCli(argv, cwd, deps?)` dispatcher with unchanged external behavior.

```js
// runners/interactive.js
module.exports = {runInteractive};

// doctor.js
module.exports = {doctorEnvironment, runDoctor};

// cli.js
module.exports = {parseArgs, runCli};
```

- [ ] **Step 1: Write interactive cleanup and Doctor tests**

For `runInteractive`, inject Metro/device dependencies and assert: mode is required; only one platform is accepted; scheme is required; optional start-device command is honored; the URL preserves `automation/ds/<component>?flows=...`; and Metro stops on success, device-command failure, and signal completion.

For Doctor, use temp paths and injected `spawnSync` to cover missing scheme, registry, interactive command, and Tangerina core; invalid registry flow; missing source paths; simulator/AVD warnings; occupied Metro warning; missing derived binaries warning; clean pass; and pass-with-warnings output.

- [ ] **Step 2: Write dispatcher tests and confirm RED**

Inject spies into `runCli` and verify each branch dispatches once and returns: `--init`, `--doctor`, `--html-only`, `--add-flow`, `--list-flows`, `--interactive`, `--reference`, and default evidence. Verify config is not loaded for `--init` and inputs are not collected for doctor/html/add-flow.

Run:

```bash
node --test packages/mobile/test/runner-interactive.test.js packages/mobile/test/doctor.test.js packages/mobile/test/cli-dispatch.test.js packages/mobile/test/boundaries.test.js
```

Expected: FAIL because modules/dependency injection are absent.

- [ ] **Step 3: Extract interactive runner and Doctor**

Move `runInteractive` to `runners/interactive.js` and `doctorEnvironment`/`runDoctor` to `doctor.js`. Keep host probes warning-only where they are warning-only today, preserve validation messages, and require `./lib/detoxConfig` through its new `packages/mobile` location.

- [ ] **Step 4: Rewrite CLI as parser and dispatcher only**

Keep `parseArgs` and `runCli` in `cli.js`. Use this dependency surface:

```js
const {loadConfig, runInit} = require('./config');
const {
  collectInputs,
  chooseFlows,
  formatFlowList,
  runAddFlow,
} = require('./registry');
const {runDoctor} = require('./doctor');
const {runEvidence, runReference} = require('./runners/evidence');
const {runInteractive} = require('./runners/interactive');
const {runHtmlOnly} = require('./reporting/html');

const productionDependencies = {
  loadConfig,
  runInit,
  collectInputs,
  chooseFlows,
  formatFlowList,
  runAddFlow,
  runDoctor,
  runEvidence,
  runReference,
  runInteractive,
  runHtmlOnly,
  write: console.log,
};

async function runCli(argv, cwd = process.cwd(), deps = productionDependencies) {
  const args = parseArgs(argv);
  if (args.init) return deps.runInit(cwd);

  const config = deps.loadConfig(args, cwd);
  if (args.doctor) return deps.runDoctor(config);
  if (args['html-only']) return deps.runHtmlOnly(args, config);
  if (args['add-flow']) return deps.runAddFlow(args, config);

  const input = deps.collectInputs(args, config);
  if (args['list-flows']) {
    deps.write(deps.formatFlowList(input.availableFlows, input.references));
    return;
  }

  const selectedInput = await deps.chooseFlows(args, input);
  if (args.interactive) return deps.runInteractive(args, config, selectedInput);
  if (args.reference) return deps.runReference(args, config, selectedInput);
  return deps.runEvidence(args, config, selectedInput);
}

module.exports = {parseArgs, runCli};
```

The body must preserve the current branch order exactly: init, config load, doctor, html-only, add-flow, collect input, list-flows, choose flows, interactive, reference, evidence. Export `{parseArgs, runCli}` for direct tests while keeping the bin unchanged.

- [ ] **Step 5: Enforce module boundaries in tests**

Add assertions that `packages/mobile/src/cli.js` is under 150 lines, contains no `child_process`, `http`, HTML template, stash command, or Detox command construction, and that no file under `packages/mobile` requires `packages/core` or `packages/web`.

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
node --test packages/mobile/test/runner-interactive.test.js packages/mobile/test/doctor.test.js packages/mobile/test/cli-dispatch.test.js packages/mobile/test/boundaries.test.js
npm test --workspace @gol-smiles/anemoi-preset
npm test
```

Expected: all tests PASS and the CLI remains externally compatible.

- [ ] **Step 7: Commit**

```bash
git add packages/mobile/src/runners/interactive.js packages/mobile/src/doctor.js packages/mobile/src/cli.js packages/mobile/test
git commit -m "refactor(mobile): finish modular CLI decomposition"
```

### Task 8: Consolidate Mobile Documentation and Complete Workspace Acceptance

**Files:**
- Create: `docs/guides/mobile.md`
- Move: `packages/mobile/docs/adr/*.md` -> `docs/adr/mobile-*.md`
- Move: `integrations/gol-app-mobile/docs/adr/*.md` -> `docs/adr/mobile-gol-*.md`
- Create: `integrations/gol-app-mobile/README.md`
- Preserve/Modify: `integrations/gol-app-mobile/CONTEXT.md`
- Preserve/Move: `integrations/gol-app-mobile/docs/anemoi-relatorio-html.md`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `test/workspace.test.js`
- Modify: `docs/superpowers/specs/2026-07-13-anemoi-architecture-compaction-design.md`

**Interfaces:**
- Consumes: final stable paths and verified public behavior.
- Produces: one operational entry point, one canonical architecture map, one Mobile guide, canonical ADR locations, and a completed architecture migration status.

- [ ] **Step 1: Add failing final-structure assertions**

Assert in `test/workspace.test.js` that `docs/guides/mobile.md`, `integrations/gol-app-mobile/README.md`, and `docs/adr` exist; old package-local ADR directories do not; root workspaces are exactly Core/Web/Mobile; integration is outside npm workspaces; and no package requires another runtime in a forbidden direction.

- [ ] **Step 2: Run the workspace test and confirm RED**

Run: `node --test test/workspace.test.js`

Expected: FAIL because canonical Mobile docs have not been consolidated.

- [ ] **Step 3: Consolidate operational and integration documentation**

Move the existing complete guide and preserve the HTML-report guide:

```bash
mkdir -p docs/guides integrations/gol-app-mobile/docs
git mv integrations/gol-app-mobile/docs/anemoi.md docs/guides/mobile.md
```

In the moved guide replace every `../../anemoi-preset/docs/adr/0004-recorte-no-componente-por-padrao.md`
link with `../adr/mobile-0004-recorte-no-componente-por-padrao.md`, and replace the final local ADR links
with the canonical `../adr/mobile-gol-*` paths from Step 4. Create
`integrations/gol-app-mobile/README.md` with this complete content:

```markdown
# Integração GOL_APP_Mobile

Esta pasta contém somente o adaptador do Anemoi Mobile para o GOL_APP_Mobile: configuração
Detox/Jest, wrapper do bin, teste de evidência, registry, entrypoint Android e documentação do
relatório HTML. O motor reutilizável vive em `packages/mobile` como
`@gol-smiles/anemoi-preset`.

O app consome esta integração pelos contratos legados preservados `detox/` e
`packages/ds-evidence-preset`; `ds-evidence.config.js` continua pertencendo ao app host. Não
renomeie `yarn ds:evidence`, `automation/ds`, `DsEvidenceScreen` ou os test IDs
`ds-evidence-*` durante a modularização.

- Guia operacional: [Anemoi Mobile](../../docs/guides/mobile.md)
- Vocabulário e limites GOL: [CONTEXT.md](CONTEXT.md)
- Relatório HTML: [docs/anemoi-relatorio-html.md](docs/anemoi-relatorio-html.md)
- Registry: [anemoi/registry.json](anemoi/registry.json)
```

Keep `CONTEXT.md` as the integration vocabulary source and keep the HTML-report guide under the
integration because it documents the GOL evidence presentation contract.

- [ ] **Step 4: Move ADRs with collision-free Mobile titles**

Use these canonical names:

```text
docs/adr/mobile-0001-preset-com-adaptador-local.md
docs/adr/mobile-0002-fluxos-de-evidencia-no-registry.md
docs/adr/mobile-0003-fonte-canonica-brq-ai-symlink.md
docs/adr/mobile-0004-recorte-no-componente-por-padrao.md
docs/adr/mobile-gol-0001-detox-for-anemoi.md
docs/adr/mobile-gol-0002-toggle-antes-depois-source-stash.md
docs/adr/mobile-gol-0003-escada-evidencia-a11y-vs-pixel.md
```

Execute these exact moves:

```bash
mkdir -p docs/adr
git mv packages/mobile/docs/adr/0001-preset-com-adaptador-local.md docs/adr/mobile-0001-preset-com-adaptador-local.md
git mv packages/mobile/docs/adr/0002-fluxos-de-evidencia-no-registry.md docs/adr/mobile-0002-fluxos-de-evidencia-no-registry.md
git mv packages/mobile/docs/adr/0003-fonte-canonica-brq-ai-symlink.md docs/adr/mobile-0003-fonte-canonica-brq-ai-symlink.md
git mv packages/mobile/docs/adr/0004-recorte-no-componente-por-padrao.md docs/adr/mobile-0004-recorte-no-componente-por-padrao.md
git mv integrations/gol-app-mobile/docs/adr/0001-detox-for-anemoi.md docs/adr/mobile-gol-0001-detox-for-anemoi.md
git mv integrations/gol-app-mobile/docs/adr/0002-toggle-antes-depois-source-stash.md docs/adr/mobile-gol-0002-toggle-antes-depois-source-stash.md
git mv integrations/gol-app-mobile/docs/adr/0003-escada-evidencia-a11y-vs-pixel.md docs/adr/mobile-gol-0003-escada-evidencia-a11y-vs-pixel.md
```

Repair every relative link and historical path statement without changing the decisions themselves.

- [ ] **Step 5: Update root docs and migration status**

Update `README.md` package table to `packages/mobile` and `integrations/gol-app-mobile`, document Web first and Mobile second, and link both guides. Update `docs/architecture.md` dependency graph to:

```text
packages/web -> packages/core
packages/mobile -/-> packages/core
packages/mobile -/-> packages/web
integrations/gol-app-mobile -> packages/mobile
```

Mark the approved design status `Implementation completed` only after all acceptance commands below pass.

- [ ] **Step 6: Run complete automated acceptance**

Run:

```bash
npm test --workspace @gol-smiles/anemoi-preset
npm test
git diff --check
rg -n "anemoi-preset/|gol-adapter-detox/" package.json packages integrations README.md docs \
  -g '!docs/superpowers/plans/**' -g '!docs/superpowers/specs/**'
rg -n "require\(.+packages/(core|web)|@gol-smiles/anemoi-(core|web)" packages/mobile
```

Expected: every test passes; diff check is clean; both searches return no operational stale path or forbidden dependency. Historical plan/spec references may retain old paths only where clearly labeled as history.

- [ ] **Step 7: Run host-contract smoke checks without a device**

Run the Mobile bin against a temporary fixture host for `--init`, `--list-flows`, `--doctor`, and `--dry-run`. Expected: generated legacy filenames remain unchanged, list/doctor output matches characterization tests, dry-run writes the same manifest schema under `outputs/anemoi`, and no Metro/Detox device process starts.

- [ ] **Step 8: Commit**

```bash
git add README.md docs packages/mobile integrations/gol-app-mobile test/workspace.test.js package.json package-lock.json
git commit -m "docs: complete Anemoi Mobile workspace migration"
```

## Final Review Gate

- [ ] Request a full code review over the complete Mobile commit range, with special attention to public-contract drift, failure cleanup, source-stash safety, dependency direction, and moved relative paths.
- [ ] Fix every Critical or Important finding with focused regression tests and request re-review.
- [ ] Re-run Task 8 Steps 6–7 on the reviewed HEAD.
- [ ] Verify `git status --short`, `git diff --check`, and the committed design status before choosing merge, PR, branch retention, or discard through `superpowers:finishing-a-development-branch`.
