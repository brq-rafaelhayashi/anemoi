# Anemoi Web Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the current WC/React/Angular cross-framework implementation to the only Anemoi Web product, integrate it directly with aliased `tangerina-web-core` checkouts, and remove the obsolete web and cross identities.

**Architecture:** Move the active browser core and cross implementation under `packages/core` and `packages/web`, deleting the obsolete Storybook/Lit package in the same atomic change that assigns `@gol-smiles/anemoi-web` to the active implementation. Anemoi runs from its own repository, resolves a configured repository alias, prepares the Tangerina packages, renders WC/React/Angular through isolated hosts, and writes a parity bundle into the consumer checkout.

**Tech Stack:** Node.js 24 CommonJS, npm workspaces, `node:test`, Playwright, pixelmatch, Storybook 8, Vite/React 18, Angular 20, and pnpm 9 in `tangerina-web-core`.

## Global Constraints

- Keep Node at `>=24`; keep the consumer requirement at pnpm `>=9`.
- The current `anemoi-cross` implementation becomes Web; the current `anemoi-web` implementation is deleted.
- Do not create an `anemoi-cross` package, bin, script, output alias, or deprecation shim.
- Use `outputs/anemoi-web/<card>/<component>/<timestamp>` as the only browser-evidence path.
- Run the tool from the Anemoi repository; do not add a symlink or script to `tangerina-web-core`.
- Never run stash, reset, checkout, clean, or other Git state changes in the consumer repository.
- Preserve the current active Web flags and WC/React/Angular rendering behavior.
- Keep CLI and operational documentation in PT-BR.
- Leave `anemoi-preset` and `gol-adapter-detox` behavior unchanged in this plan; their move and modularization belong to the follow-on mobile plan.
- Preserve unrelated worktree changes, including the existing root `package-lock.json` change unless `npm install` incorporates it naturally.

---

### Task 1: Record the baseline and consumer audit

**Files:**
- Create: `docs/migration/2026-07-13-anemoi-web-consumer-audit.md`

**Interfaces:**
- Consumes: Current root scripts, package identities, and known `tangerina-web-core` integration history.
- Produces: A committed deletion gate proving the obsolete package has no active known consumer.

- [ ] **Step 1: Verify the current baseline**

Run outside a network-restricted sandbox because the core server tests bind localhost:

```bash
npm test
```

Expected: 27 core, 10 legacy web, and 11 cross tests pass. The cross story-args test may print the existing typeless-package warning, but no test fails.

- [ ] **Step 2: Audit operational references**

Run:

```bash
rg -n "anemoi-web|anemoi-cross|ds-evidence-cross" . \
  -g '!node_modules/**' -g '!package-lock.json' -g '!.superpowers/**'
rg -n "anemoi-web|anemoi-cross|ds-evidence-cross" \
  /Users/user/Documents/projects/tangerina-ds/tangerina-web-core \
  -g '!node_modules/**' -g '!packages/*/dist/**'
```

Expected findings:

- Anemoi root exposes separate `web` and `cross` scripts.
- `anemoi-web` contains the obsolete Storybook/Lit implementation.
- `anemoi-cross` contains the active WC/React/Angular implementation.
- The inspected Tangerina branch has historical `anemoi` integration commits, while its current working tree has removed the old tooling symlink and script.

Stop this plan and return to design review if another active repository or release process consumes the obsolete `@gol-smiles/anemoi-web` behavior.

- [ ] **Step 3: Write the audit artifact**

Create the file with this content:

```markdown
# Anemoi Web Consumer Audit

Date: 2026-07-13

## Decision

The WC/React/Angular implementation in `anemoi-cross` is the active Web product. The Storybook/Lit-only implementation in `anemoi-web` is obsolete and can be deleted atomically when the active package assumes the `@gol-smiles/anemoi-web` identity.

## Known Consumers

- Anemoi root scripts: internal and updated in the same migration.
- `tangerina-web-core`: historical symlink integration is removed from the current working tree; the new integration remains owned by Anemoi.
- No other active consumer was found in the inspected repositories.

## Compatibility Decision

There will be no `cross` package, bin, command, output alias, or deprecation period. Browser evidence moves to `outputs/anemoi-web`.
```

- [ ] **Step 4: Commit the audit**

```bash
git add docs/migration/2026-07-13-anemoi-web-consumer-audit.md
git commit -m "docs: audit Anemoi Web consumers"
```

---

### Task 2: Atomically promote Cross to Web and normalize browser package paths

**Files:**
- Create: `test/workspace.test.js`
- Delete: `anemoi-web/`
- Move: `anemoi-core/` to `packages/core/`
- Move: `anemoi-cross/` to `packages/web/`
- Move: `packages/web/bin/anemoi-cross.js` to `packages/web/bin/anemoi-web.js`
- Modify: `packages/web/package.json`
- Modify: `packages/web/src/cli.js`
- Modify: `packages/web/src/doctor.js`
- Modify: `packages/web/harness/react/vite.config.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `@gol-smiles/anemoi-core` public exports and the existing cross host contract.
- Produces: `@gol-smiles/anemoi-web`, bin `anemoi-web`, root script `npm run web`, and workspace paths used by every later task.

- [ ] **Step 1: Write the failing workspace identity test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const json = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

test('workspace expõe somente o Anemoi Web ativo', () => {
  const root = json('package.json');
  const web = json('packages/web/package.json');

  assert.deepEqual(root.workspaces, ['packages/core', 'packages/web', 'anemoi-preset']);
  assert.equal(root.scripts.web, 'node packages/web/bin/anemoi-web.js');
  assert.equal(root.scripts.cross, undefined);
  assert.equal(web.name, '@gol-smiles/anemoi-web');
  assert.equal(web.bin['anemoi-web'], 'bin/anemoi-web.js');
  assert.equal(fs.existsSync(path.join(ROOT, 'anemoi-web')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'anemoi-cross')), false);
});
```

- [ ] **Step 2: Run the identity test and verify it fails**

Run:

```bash
node --test test/workspace.test.js
```

Expected: FAIL because `packages/web/package.json` does not exist.

- [ ] **Step 3: Perform the atomic moves and deletion**

```bash
mkdir -p packages
git rm -r anemoi-web
git mv anemoi-core packages/core
git mv anemoi-cross packages/web
git mv packages/web/bin/anemoi-cross.js packages/web/bin/anemoi-web.js
```

- [ ] **Step 4: Update package identities and root scripts**

Set `packages/web/package.json` to:

```json
{
  "name": "@gol-smiles/anemoi-web",
  "version": "0.1.0",
  "private": true,
  "description": "Anemoi Web: evidencias WC, React e Angular do Tangerina Web Core.",
  "main": "src/cli.js",
  "bin": {"anemoi-web": "bin/anemoi-web.js"},
  "files": ["bin", "src", "harness"],
  "scripts": {"test": "node --test"},
  "engines": {"node": ">=24"},
  "dependencies": {
    "@gol-smiles/anemoi-core": "*",
    "@storybook/csf": "^0.1.11"
  }
}
```

Replace root workspace and script fields with:

```json
"workspaces": [
  "packages/core",
  "packages/web",
  "anemoi-preset"
],
"scripts": {
  "web": "node packages/web/bin/anemoi-web.js",
  "test": "node --test test/*.test.js && npm test --workspaces --if-present",
  "setup:harnesses": "npm --prefix packages/web/harness/react install && npm --prefix packages/web/harness/angular install",
  "postinstall": "npm run setup:harnesses"
}
```

- [ ] **Step 5: Remove the Cross identity from active code**

Make these exact replacements in `packages/web/src/cli.js`:

```js
// CLI orquestrador do Anemoi Web (WC/React/Angular).
// Uso: anemoi-web --component tgr-button [opções]
```

```js
const runDir = path.join(repo, 'outputs', 'anemoi-web', card, component, ts);
```

```js
console.log('\nAnemoi Web — estado atual');
```

```js
tool: 'Anemoi Web',
```

In `packages/web/src/doctor.js`, change the heading to `Doctor — anemoi-web` and describe the Playwright dependency as belonging to Web, not Cross. Keep historical terms only in the audit and design documents.

- [ ] **Step 6: Remove the harness's checkout-relative fallback**

In `packages/web/harness/react/vite.config.ts`, replace the `repo` declaration with:

```ts
const repo = process.env.DS_REPO;

if (!repo) {
  throw new Error('DS_REPO must point to the configured tangerina-web-core checkout.');
}
```

- [ ] **Step 7: Refresh workspace links and lockfile**

Run:

```bash
npm install
```

Expected: installation succeeds, harness dependencies install, and the root lockfile records `packages/core` and `packages/web` without losing the existing `hasInstallScript` metadata.

- [ ] **Step 8: Run the renamed workspace tests**

```bash
npm test
```

Expected: root workspace identity test, 27 core tests, and 11 active Web tests pass. No legacy Web test runs.

- [ ] **Step 9: Commit the atomic promotion**

```bash
git add package.json package-lock.json packages test/workspace.test.js
git commit -m "refactor: promote Anemoi Cross to Web"
```

---

### Task 3: Add repository aliases and split the CLI dispatcher

**Files:**
- Create: `packages/web/src/config.js`
- Create: `packages/web/test/config.test.js`
- Create: `packages/web/src/cli.js`
- Move: `packages/web/src/cli.js` to `packages/web/src/run.js` before creating the new dispatcher
- Modify: `packages/web/src/run.js`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `validateAlias(alias)`, `configureRepository(options)`, `resolveRepository(options)`, and thin `runCli(argv, cwd)`.
- Consumes: Core `parseArgs` temporarily; Task 8 moves it into Web before pruning core.

- [ ] **Step 1: Write failing alias tests**

Create `packages/web/test/config.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  validateAlias,
  configureRepository,
  resolveRepository,
} = require('../src/config');

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-config-'));
}

test('configureRepository grava alias e primeiro default', () => {
  const rootDir = tempRoot();
  const repoPath = path.join(rootDir, 'tangerina-web-core');
  fs.mkdirSync(repoPath);

  configureRepository({rootDir, cwd: rootDir, alias: 'tangerina', repoPath});

  const config = JSON.parse(fs.readFileSync(path.join(rootDir, '.anemoi.local.json'), 'utf8'));
  assert.equal(config.defaultRepository, 'tangerina');
  assert.equal(config.repositories.tangerina.path, repoPath);
});

test('resolveRepository aceita alias, default e caminho direto', () => {
  const rootDir = tempRoot();
  const repoPath = path.join(rootDir, 'repo-a');
  const directPath = path.join(rootDir, 'repo-b');
  fs.mkdirSync(repoPath);
  fs.mkdirSync(directPath);
  configureRepository({rootDir, cwd: rootDir, alias: 'tangerina', repoPath});

  assert.equal(resolveRepository({rootDir, cwd: rootDir, repoArg: 'tangerina'}), repoPath);
  assert.equal(resolveRepository({rootDir, cwd: rootDir}), repoPath);
  assert.equal(resolveRepository({rootDir, cwd: rootDir, repoArg: directPath}), directPath);
});

test('alias desconhecido lista aliases configurados', () => {
  const rootDir = tempRoot();
  const repoPath = path.join(rootDir, 'repo');
  fs.mkdirSync(repoPath);
  configureRepository({rootDir, cwd: rootDir, alias: 'tangerina', repoPath});

  assert.throws(
    () => resolveRepository({rootDir, cwd: rootDir, repoArg: 'inexistente'}),
    /Alias desconhecido.*tangerina/s,
  );
});

test('validateAlias rejeita maiusculas e hifens consecutivos', () => {
  assert.throws(() => validateAlias('Tangerina'), /Alias invalido/);
  assert.throws(() => validateAlias('tangerina--main'), /Alias invalido/);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
node --test packages/web/test/config.test.js
```

Expected: FAIL with `Cannot find module '../src/config'`.

- [ ] **Step 3: Implement alias configuration**

Create `packages/web/src/config.js`:

```js
const fs = require('node:fs');
const path = require('node:path');

const CONFIG_FILE = '.anemoi.local.json';
const ALIAS_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function validateAlias(alias) {
  if (!ALIAS_PATTERN.test(String(alias || ''))) {
    throw new Error('Alias invalido. Use letras minusculas, numeros e hifens simples.');
  }
  return alias;
}

function configPath(rootDir) {
  return path.join(rootDir, CONFIG_FILE);
}

function readLocalConfig(rootDir) {
  const filePath = configPath(rootDir);
  if (!fs.existsSync(filePath)) return {repositories: {}};
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {...value, repositories: value.repositories || {}};
}

function configureRepository({rootDir, cwd, alias, repoPath, makeDefault = false}) {
  validateAlias(alias);
  if (!repoPath) throw new Error('Informe --repo <caminho>.');
  const absolutePath = path.resolve(cwd, repoPath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Repositorio nao encontrado: ${absolutePath}`);
  const config = readLocalConfig(rootDir);
  config.repositories[alias] = {path: absolutePath};
  if (!config.defaultRepository || makeDefault) config.defaultRepository = alias;
  fs.writeFileSync(configPath(rootDir), `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

function isPathLike(value) {
  return path.isAbsolute(value) || value.startsWith('.') || value.includes('/') || value.includes('\\');
}

function resolveRepository({rootDir, cwd, repoArg}) {
  const config = readLocalConfig(rootDir);
  if (repoArg && config.repositories[repoArg]) return path.resolve(config.repositories[repoArg].path);
  if (repoArg && (isPathLike(repoArg) || fs.existsSync(path.resolve(cwd, repoArg)))) {
    return path.resolve(cwd, repoArg);
  }
  if (repoArg) {
    const aliases = Object.keys(config.repositories);
    throw new Error(`Alias desconhecido: ${repoArg}. Configurados: ${aliases.join(', ') || '(nenhum)'}.`);
  }
  if (config.defaultRepository && config.repositories[config.defaultRepository]) {
    return path.resolve(config.repositories[config.defaultRepository].path);
  }
  throw new Error('Repositorio nao configurado. Rode npm run web:configure -- --alias <alias> --repo <caminho>.');
}

module.exports = {
  CONFIG_FILE,
  validateAlias,
  readLocalConfig,
  configureRepository,
  resolveRepository,
};
```

- [ ] **Step 4: Split dispatcher from evidence execution**

Move the current orchestrator, then remove its `runCli` function and direct-execution block:

```bash
git mv packages/web/src/cli.js packages/web/src/run.js
```

Ensure `packages/web/src/run.js` exports only:

```js
module.exports = {runCurrentState};
```

Create the new `packages/web/src/cli.js`:

```js
const path = require('node:path');
const {parseArgs} = require('@gol-smiles/anemoi-core');
const {configureRepository, resolveRepository} = require('./config');
const {runCurrentState} = require('./run');

const ROOT = path.resolve(__dirname, '..', '..', '..');

async function runCli(argv, cwd = process.cwd()) {
  const args = parseArgs(argv);
  if (args.configure) {
    configureRepository({
      rootDir: ROOT,
      cwd,
      alias: args.alias,
      repoPath: args.repo,
      makeDefault: Boolean(args.default),
    });
    console.log(`Repositorio "${args.alias}" configurado.`);
    return;
  }

  const repo = resolveRepository({rootDir: ROOT, cwd, repoArg: args.repo});
  await runCurrentState({...args, repo}, cwd);
}

module.exports = {runCli};
```

Add the root script:

```json
"web:configure": "node packages/web/bin/anemoi-web.js --configure"
```

Add `.anemoi.local.json` to `.gitignore`.

- [ ] **Step 5: Run alias and workspace tests**

```bash
node --test packages/web/test/config.test.js test/workspace.test.js
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit alias support and dispatcher split**

```bash
git add .gitignore package.json packages/web/src packages/web/test/config.test.js
git commit -m "feat(web): configure consumer repositories by alias"
```

---

### Task 4: Add a logged process runner

**Files:**
- Create: `packages/web/src/process.js`
- Create: `packages/web/test/process.test.js`

**Interfaces:**
- Produces: `runLogged(command, args, options)` used by Tangerina builds and render hosts.

- [ ] **Step 1: Write the failing process-runner test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {runLogged} = require('../src/process');

test('runLogged persiste stdout e stderr', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-process-'));
  const logPath = path.join(dir, 'build.log');
  const spawnSync = () => ({status: 0, stdout: 'ok\n', stderr: 'warn\n'});
  runLogged('pnpm', ['build:components'], {cwd: dir, logPath, spawnSync});
  assert.match(fs.readFileSync(logPath, 'utf8'), /ok[\s\S]*warn/);
});

test('runLogged inclui comando e log no erro', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-process-'));
  const logPath = path.join(dir, 'failed.log');
  const spawnSync = () => ({status: 2, stdout: '', stderr: 'boom\n'});
  assert.throws(
    () => runLogged('pnpm', ['build:react'], {cwd: dir, logPath, spawnSync}),
    error => error.message.includes('pnpm build:react') && error.logPath === logPath,
  );
});
```

- [ ] **Step 2: Run it and verify failure**

```bash
node --test packages/web/test/process.test.js
```

Expected: FAIL because `src/process.js` does not exist.

- [ ] **Step 3: Implement the logged runner**

```js
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function runLogged(command, args, {
  cwd,
  env = process.env,
  logPath,
  echo = false,
  spawnSync = childProcess.spawnSync,
} = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  fs.mkdirSync(path.dirname(logPath), {recursive: true});
  fs.writeFileSync(logPath, `$ ${command} ${args.join(' ')}\n\n${stdout}\n${stderr}`);
  if (echo && stdout) process.stdout.write(stdout);
  if (echo && stderr) process.stderr.write(stderr);
  if (result.status !== 0) {
    const error = new Error(`${command} ${args.join(' ')} falhou (exit ${result.status}). Log: ${logPath}`);
    error.logPath = logPath;
    error.exitCode = result.status;
    throw error;
  }
  return result;
}

module.exports = {runLogged};
```

- [ ] **Step 4: Run the test and commit**

```bash
node --test packages/web/test/process.test.js
git add packages/web/src/process.js packages/web/test/process.test.js
git commit -m "feat(web): persist child process logs"
```

---

### Task 5: Encode and execute the Tangerina build contract

**Files:**
- Create: `packages/web/src/tangerina.js`
- Create: `packages/web/test/tangerina.test.js`
- Modify: `packages/web/src/run.js`
- Modify: `packages/web/src/doctor.js`

**Interfaces:**
- Produces: `validateTangerinaRepo(repoPath)` and `runTangerinaBuilds(repoPath, options)`.
- Consumes: `runLogged` from Task 4.

- [ ] **Step 1: Write failing contract tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {BUILD_SCRIPTS, validateTangerinaRepo, runTangerinaBuilds} = require('../src/tangerina');

function fixture(scripts = Object.fromEntries(BUILD_SCRIPTS.map(name => [name, 'true']))) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tangerina-contract-'));
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({name: 'tangerina-web-core', scripts}));
  return repo;
}

test('validateTangerinaRepo exige identidade e scripts', () => {
  assert.doesNotThrow(() => validateTangerinaRepo(fixture()));
  assert.throws(() => validateTangerinaRepo(fixture({})), /build:tokens/);
});

test('runTangerinaBuilds executa a ordem aprovada', () => {
  const repo = fixture();
  const calls = [];
  runTangerinaBuilds(repo, {
    logDir: path.join(repo, 'logs'),
    run: (_command, args) => calls.push(args[0]),
  });
  assert.deepEqual(calls, BUILD_SCRIPTS);
});

test('runTangerinaBuilds respeita skipBuild', () => {
  const repo = fixture();
  let called = false;
  runTangerinaBuilds(repo, {skipBuild: true, logDir: path.join(repo, 'logs'), run: () => { called = true; }});
  assert.equal(called, false);
});
```

- [ ] **Step 2: Run and verify failure**

```bash
node --test packages/web/test/tangerina.test.js
```

Expected: FAIL because `src/tangerina.js` does not exist.

- [ ] **Step 3: Implement the contract**

```js
const fs = require('node:fs');
const path = require('node:path');
const {runLogged} = require('./process');

const BUILD_SCRIPTS = [
  'build:tokens',
  'build:assets',
  'build:fonts',
  'build:components',
  'build:react',
  'build:angular',
];

function readPackage(repoPath) {
  const packagePath = path.join(repoPath, 'package.json');
  if (!fs.existsSync(packagePath)) throw new Error(`package.json nao encontrado em ${repoPath}.`);
  return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
}

function validateTangerinaRepo(repoPath) {
  const pkg = readPackage(repoPath);
  if (pkg.name !== 'tangerina-web-core') {
    throw new Error(`Repositorio invalido: esperado tangerina-web-core, encontrado ${pkg.name || '(sem nome)'}.`);
  }
  const missing = BUILD_SCRIPTS.filter(name => !pkg.scripts?.[name]);
  if (missing.length) throw new Error(`Scripts obrigatorios ausentes: ${missing.join(', ')}.`);
  return pkg;
}

function runTangerinaBuilds(repoPath, {skipBuild = false, logDir, run = runLogged} = {}) {
  validateTangerinaRepo(repoPath);
  if (skipBuild) return;
  for (const script of BUILD_SCRIPTS) {
    run('pnpm', [script], {
      cwd: repoPath,
      logPath: path.join(logDir, `${script.replace(':', '-')}.log`),
      echo: true,
    });
  }
}

module.exports = {BUILD_SCRIPTS, validateTangerinaRepo, runTangerinaBuilds};
```

- [ ] **Step 4: Integrate builds before Storybook**

In `runCurrentState`, after creating `runDir` and before `ensureStorybookIndex`, add:

```js
const {runTangerinaBuilds} = require('./tangerina');
```

```js
runTangerinaBuilds(repo, {
  skipBuild: Boolean(args['skip-build']),
  logDir: path.join(runDir, 'logs', 'tangerina'),
});
```

Update `collectChecks` in `doctor.js` to add one check per `BUILD_SCRIPTS` entry and to identify the repository by `package.json#name`. Artifact checks remain, so `--skip-build` cannot hide stale or absent builds.

- [ ] **Step 5: Run tests and commit**

```bash
node --test packages/web/test/tangerina.test.js packages/web/test/doctor.test.js
npm test
git add packages/web/src/tangerina.js packages/web/src/run.js packages/web/src/doctor.js packages/web/test
git commit -m "feat(web): build Tangerina dependencies before capture"
```

---

### Task 6: Reject non-serializable Storybook arguments

**Files:**
- Modify: `packages/web/src/storyArgs.js`
- Modify: `packages/web/test/storyArgs.test.js`

**Interfaces:**
- Produces: `assertSerializableArgs(value, context)` and story errors that identify story, source file, and invalid property.

- [ ] **Step 1: Write failing serialization tests**

Add to `packages/web/test/storyArgs.test.js`:

```js
const {resolveStoryArgs, assertSerializableArgs} = require('../src/storyArgs');

test('rejeita funcao e informa story, arquivo e propriedade', () => {
  assert.throws(
    () => assertSerializableArgs(
      {label: 'Salvar', onClick: () => {}},
      {storyName: 'Primary', sourcePath: 'tgr-button.stories.ts'},
    ),
    /Primary.*tgr-button\.stories\.ts.*onClick/s,
  );
});

test('rejeita referencia circular', () => {
  const args = {label: 'Salvar'};
  args.self = args;
  assert.throws(
    () => assertSerializableArgs(args, {storyName: 'Primary', sourcePath: 'sample.stories.ts'}),
    /referencia circular/i,
  );
});
```

Replace the file's original destructuring import so it imports both exports only once.

- [ ] **Step 2: Run and verify failure**

```bash
node --test packages/web/test/storyArgs.test.js
```

Expected: FAIL because `assertSerializableArgs` is not exported.

- [ ] **Step 3: Implement recursive JSON-value validation**

Add before `resolveStoryArgs`:

```js
function assertSerializableArgs(value, {storyName, sourcePath}) {
  const seen = new Set();

  function visit(current, propertyPath) {
    if (current === null || ['string', 'boolean'].includes(typeof current)) return;
    if (typeof current === 'number' && Number.isFinite(current)) return;
    if (['undefined', 'function', 'symbol', 'bigint'].includes(typeof current)) {
      throw new Error(`Story "${storyName}" (${sourcePath}) possui arg nao serializavel em ${propertyPath}.`);
    }
    if (typeof current !== 'object') {
      throw new Error(`Story "${storyName}" (${sourcePath}) possui arg invalido em ${propertyPath}.`);
    }
    if (seen.has(current)) {
      throw new Error(`Story "${storyName}" (${sourcePath}) possui referencia circular em ${propertyPath}.`);
    }
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${propertyPath}[${index}]`));
    } else {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error(`Story "${storyName}" (${sourcePath}) possui objeto nao serializavel em ${propertyPath}.`);
      }
      Object.entries(current).forEach(([key, item]) => visit(item, `${propertyPath}.${key}`));
    }
    seen.delete(current);
  }

  visit(value, 'args');
  return value;
}
```

In `resolveStoryArgs`, validate the merged value before assigning it:

```js
const mergedArgs = {...(meta.args || {}), ...storyArgs};
assertSerializableArgs(mergedArgs, {storyName: s.name, sourcePath: s.importPath});
out[s.id] = mergedArgs;
```

Export both functions:

```js
module.exports = {resolveStoryArgs, assertSerializableArgs};
```

- [ ] **Step 4: Run tests and commit**

```bash
node --test packages/web/test/storyArgs.test.js
npm test
git add packages/web/src/storyArgs.js packages/web/test/storyArgs.test.js
git commit -m "feat(web): reject non-serializable story args"
```

---

### Task 7: Record failed runs without publishing a gallery

**Files:**
- Create: `packages/web/src/failure.js`
- Create: `packages/web/test/failure.test.js`
- Modify: `packages/web/src/run.js`
- Modify: `packages/core/src/output.js`
- Modify: `packages/core/test/output.test.js`

**Interfaces:**
- Produces: `writeFailureManifest(runDir, context, error)` and manifests with `status: passed|failed`.

- [ ] **Step 1: Write the failing failure-manifest test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {writeFailureManifest} = require('../src/failure');

test('falha grava manifesto e nao publica index.html', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-failure-'));
  writeFailureManifest(runDir, {stage: 'build:react', card: 'CDCOM-1', component: 'tgr-button'}, new Error('boom'));
  const manifest = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'failed');
  assert.equal(manifest.stage, 'build:react');
  assert.equal(manifest.error, 'boom');
  assert.equal(fs.existsSync(path.join(runDir, manifest.logPath)), true);
  assert.equal(fs.existsSync(path.join(runDir, 'index.html')), false);
});
```

- [ ] **Step 2: Run and verify failure**

```bash
node --test packages/web/test/failure.test.js
```

Expected: FAIL because `src/failure.js` does not exist.

- [ ] **Step 3: Implement failed-run persistence**

```js
const fs = require('node:fs');
const path = require('node:path');

function writeFailureManifest(runDir, context, error) {
  fs.mkdirSync(runDir, {recursive: true});
  let logPath = error.logPath;
  if (!logPath) {
    logPath = path.join(runDir, 'logs', `${context.stage}.log`);
    fs.mkdirSync(path.dirname(logPath), {recursive: true});
    fs.writeFileSync(logPath, `${error.stack || error.message || String(error)}\n`);
  }
  const manifest = {
    tool: 'Anemoi Web',
    status: 'failed',
    stage: context.stage,
    card: context.card,
    component: context.component,
    generatedAt: new Date().toISOString(),
    runDir,
    error: error.message || String(error),
    logPath: path.relative(runDir, logPath),
  };
  fs.writeFileSync(path.join(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

module.exports = {writeFailureManifest};
```

- [ ] **Step 4: Add stage tracking to the active run**

Wrap the body after `runDir` creation in `try/catch`. Set `stage` before each boundary:

```js
let stage = 'tangerina-builds';
try {
  runTangerinaBuilds(repo, {
    skipBuild: Boolean(args['skip-build']),
    logDir: path.join(runDir, 'logs', 'tangerina'),
  });
  stage = 'storybook-build';
  // existing Storybook build and story extraction
  stage = 'capture';
  // existing host capture loop
  stage = 'parity';
  // existing parity and success output
} catch (error) {
  writeFailureManifest(runDir, {stage, card, component}, error);
  throw error;
}
```

Add `status: 'passed'` to the success manifest before calling `writeManifest`. Keep `index.html` creation after every stage succeeds.

- [ ] **Step 5: Add status to summary output and run tests**

Add this line to the core summary metadata:

```js
`- Status: ${manifest.status || 'passed'}`,
```

Update `packages/core/test/output.test.js` to assert that the summary contains `Status: passed` for a success manifest.

Run:

```bash
node --test packages/web/test/failure.test.js packages/core/test/output.test.js
npm test
```

- [ ] **Step 6: Commit failure reporting**

```bash
git add packages/web/src packages/web/test/failure.test.js packages/core/src/output.js packages/core/test/output.test.js
git commit -m "feat(web): persist failed evidence runs"
```

---

### Task 8: Prune browser core behavior that belonged to the deleted Web tool

**Files:**
- Move: `packages/core/src/args.js` to `packages/web/src/args.js`
- Move: `packages/core/test/args.test.js` to `packages/web/test/args.test.js`
- Delete: `packages/core/src/git.js`
- Delete: `packages/core/src/doctor.js`
- Delete: `packages/core/test/git.test.js`
- Delete: `packages/core/test/doctor.test.js`
- Modify: `packages/core/src/index.js`
- Modify: `packages/core/src/output.js`
- Modify: `packages/core/test/output.test.js`
- Modify: `packages/web/src/cli.js`

**Interfaces:**
- Produces: A browser core limited to capture, diff, matrix, output, and server exports.

- [ ] **Step 1: Move argument parsing to its only consumer**

```bash
git mv packages/core/src/args.js packages/web/src/args.js
git mv packages/core/test/args.test.js packages/web/test/args.test.js
```

Change the dispatcher import to:

```js
const {parseArgs} = require('./args');
```

- [ ] **Step 2: Delete dead Git and doctor modules**

```bash
git rm packages/core/src/git.js packages/core/src/doctor.js
git rm packages/core/test/git.test.js packages/core/test/doctor.test.js
```

- [ ] **Step 3: Restrict the core public API**

Replace `packages/core/src/index.js` with:

```js
module.exports = {
  ...require('./diff'),
  ...require('./server'),
  ...require('./matrix'),
  ...require('./capture'),
  ...require('./output'),
};
```

- [ ] **Step 4: Remove unused non-parity rendering**

Delete `renderCapture` and the `manifest.layout` branch from `output.js`. The body assignment becomes:

```js
const body = (manifest.groups || []).map(renderParityGroup).join('\n');
```

Remove before/after and single-layout assertions from `packages/core/test/output.test.js`. Keep tests for escaping, manifests, summaries, and parity layout.

- [ ] **Step 5: Prove the deleted exports have no active consumer**

```bash
rg -n "ensureWorkingTreeDiff|assertNoOrphanStash|pushStash|popStash|collectChecks|runDoctor|renderCapture" \
  packages package.json -g '*.js' -g 'package.json'
```

Expected: no references to the deleted core APIs. Web's own `runDoctor` remains in `packages/web/src/doctor.js` and is not a core import.

- [ ] **Step 6: Run tests and commit**

```bash
npm test
git add packages/core packages/web
git commit -m "refactor(core): remove obsolete Web behavior"
```

---

### Task 9: Consolidate Web documentation and run real acceptance

**Files:**
- Create: `.anemoi.local.example.json`
- Create: `docs/architecture.md`
- Create: `docs/guides/web.md`
- Modify: `README.md`
- Modify: `.gitignore`
- Modify: `docs/superpowers/specs/2026-07-13-anemoi-architecture-compaction-design.md`

**Interfaces:**
- Produces: Team-facing setup and operation without historical Cross knowledge.

- [ ] **Step 1: Add the committed alias example**

```json
{
  "defaultRepository": "tangerina",
  "repositories": {
    "tangerina": {
      "path": "/absolute/path/to/tangerina-web-core"
    }
  }
}
```

Keep `.anemoi.local.json` ignored and `.anemoi.local.example.json` tracked.

- [ ] **Step 2: Write the canonical architecture guide**

Document these exact dependency directions in `docs/architecture.md`:

```text
packages/web -> packages/core
packages/web -> configured tangerina-web-core checkout
tangerina-web-core -/-> anemoi (no symlink or source dependency)
anemoi-preset -/-> packages/core (separate runtime)
```

State that WC is the visual baseline, React and Angular receive the same CSF args, and the consumer repository is never modified through Git operations.

- [ ] **Step 3: Replace root and Web operational documentation**

The root README must lead with:

```bash
npm install
npm run web:configure -- --alias tangerina --repo /absolute/path/to/tangerina-web-core
npm run web -- --repo tangerina --doctor
npm run web -- --repo tangerina --component tgr-button --card CDCOM-123
```

`docs/guides/web.md` must list every preserved flag, the automatic build order, `--skip-build` behavior, output structure, failure-manifest behavior, and parity interpretation. It must not instruct users to run from the consumer repository.

- [ ] **Step 4: Run static verification**

```bash
npm test
git diff --check
rg -n "anemoi-cross|npm run cross|outputs/anemoi-cross|ds-evidence-cross" \
  package.json packages README.md docs/guides docs/architecture.md \
  -g '!**/package-lock.json'
```

Expected: tests pass, diff check is clean, and the search returns no operational reference.

- [ ] **Step 5: Create an isolated real-consumer checkout and run doctor**

```bash
git -C /Users/user/Documents/projects/tangerina-ds/tangerina-web-core \
  worktree add /private/tmp/tangerina-anemoi-acceptance HEAD
pnpm --dir /private/tmp/tangerina-anemoi-acceptance install --frozen-lockfile
npm run web:configure -- \
  --alias tangerina-acceptance \
  --repo /private/tmp/tangerina-anemoi-acceptance \
  --default
npm run web -- --repo tangerina-acceptance --doctor
```

Expected: alias resolves, the isolated target identifies as `tangerina-web-core`, required scripts and artifacts pass, and Chromium is available. The user's primary Tangerina working tree remains untouched.

- [ ] **Step 6: Run the real `tgr-button` acceptance matrix**

```bash
npm run web -- \
  --repo tangerina-acceptance \
  --component tgr-button \
  --card ARCH-COMPACTION \
  --frameworks wc,react,angular \
  --themes light,dark \
  --viewports sm,lg \
  --brands gol
```

Expected:

- Output is under `/private/tmp/tangerina-anemoi-acceptance/outputs/anemoi-web/ARCH-COMPACTION/tgr-button/<timestamp>`.
- `manifest.json` has `tool: "Anemoi Web"` and `status: "passed"`.
- WC, React, and Angular screenshots exist for every selected cell.
- Every React-versus-WC and Angular-versus-WC mismatch is zero.
- `index.html` opens as an offline parity gallery.

- [ ] **Step 7: Run the signal-isolation check in a disposable Anemoi worktree**

Create a disposable Anemoi worktree from the completed implementation:

```bash
git worktree add /private/tmp/anemoi-web-signal HEAD
cd /private/tmp/anemoi-web-signal
npm install
npm run web:configure -- \
  --alias tangerina-acceptance \
  --repo /private/tmp/tangerina-anemoi-acceptance \
  --default
```

In `/private/tmp/anemoi-web-signal/packages/web/harness/angular/src/app.component.ts`, add this line immediately after `this.args = JSON.parse(...)`:

```ts
delete this.args.disabled;
```

Run only the disabled story while reusing the consumer builds:

```bash
npm run web -- \
  --repo tangerina-acceptance \
  --component tgr-button \
  --card ARCH-SIGNAL \
  --stories Disabled \
  --frameworks wc,react,angular \
  --themes light \
  --viewports sm \
  --brands gol \
  --skip-build
```

Expected: Angular has a non-zero mismatch, React remains zero, and only the disposable Anemoi worktree contains the deliberate fault.

Return to the primary Anemoi checkout and remove both disposable worktrees:

```bash
cd /Users/user/Developer/projects/anemoi
git worktree remove /private/tmp/anemoi-web-signal
git -C /Users/user/Documents/projects/tangerina-ds/tangerina-web-core \
  worktree remove /private/tmp/tangerina-anemoi-acceptance
```

- [ ] **Step 8: Mark the Web portion implemented and commit docs**

In the approved design document, append `Web implementation completed` to the status while leaving Mobile pending.

```bash
git add .anemoi.local.example.json .gitignore README.md docs
git commit -m "docs: make Anemoi Web operational without Cross naming"
```

## Completion Gate

Do not start the mobile modularization plan until all Task 9 acceptance checks pass. At that point create `docs/superpowers/plans/2026-07-13-anemoi-mobile-modularization.md` against the stabilized `packages/core` and `packages/web` paths; that second plan owns moving `anemoi-preset` to `packages/mobile`, moving `gol-adapter-detox` to `integrations/gol-app-mobile`, mobile characterization tests, CLI decomposition, and final workspace documentation.
