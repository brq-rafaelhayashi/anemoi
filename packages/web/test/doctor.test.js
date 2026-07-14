const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const {
  collectChecks,
  assertCaptureReady,
  runDoctor,
  checkPnpmRuntime,
} = require('../src/doctor');
const {BUILD_SCRIPTS} = require('../src/tangerina');

// Usa um path que nao existe — testa apenas que os ids certos sao retornados
const FAKE_REPO = path.join(__dirname, 'nonexistent-repo-xyz');

function makeConsumerRepo(packageManager) {
  const fs = require('node:fs');
  const os = require('node:os');
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-doctor-'));
  const scripts = Object.fromEntries(BUILD_SCRIPTS.map(name => [name, 'true']));
  const pkg = {name: 'tangerina-web-core', scripts};
  if (packageManager !== undefined) pkg.packageManager = packageManager;
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify(pkg));
  return repo;
}

function collectWithPnpmResult(repoPath, result, calls = []) {
  return collectChecks(repoPath, {
    playwrightInstalled: () => false,
    pnpmRuntime: consumerPath => checkPnpmRuntime(consumerPath, {
      spawnSync: (command, args, options) => {
        calls.push({command, args, options});
        return result;
      },
    }),
  });
}

test('collectChecks retorna checks com os ids esperados', () => {
  const checks = collectChecks(FAKE_REPO);
  const ids = checks.map(c => c.id);
  assert.ok(ids.includes('repo'), `esperava id "repo", encontrei: ${ids.join(',')}`);
  assert.ok(ids.includes('storybook'), `esperava id "storybook", encontrei: ${ids.join(',')}`);
  assert.ok(ids.includes('react-pkg'), `esperava id "react-pkg", encontrei: ${ids.join(',')}`);
  assert.ok(ids.includes('angular-pkg'), `esperava id "angular-pkg", encontrei: ${ids.join(',')}`);
  assert.ok(ids.includes('components'), `esperava id "components", encontrei: ${ids.join(',')}`);
  assert.ok(ids.includes('pnpm'), `esperava id "pnpm", encontrei: ${ids.join(',')}`);
});

test('collectChecks reporta ok=false para repo inexistente', () => {
  const checks = collectChecks(FAKE_REPO);
  const repo = checks.find(c => c.id === 'repo');
  assert.equal(repo.ok, false);
});

test('collectChecks reporta ok=true para tangerina-web-core real (se presente)', () => {
  const REAL_REPO = '/Users/user/Documents/projects/tangerina-ds/tangerina-web-core';
  const fs = require('node:fs');
  if (!fs.existsSync(REAL_REPO)) {
    // repo nao disponivel no ambiente de CI — pula
    return;
  }
  const checks = collectChecks(REAL_REPO);
  const repo = checks.find(c => c.id === 'repo');
  assert.equal(repo.ok, true, 'esperava repo ok=true para repo real');
});

test('Doctor decide o check pnpm pelo runtime, inclusive sem packageManager', () => {
  const scenarios = [
    {
      name: 'runtime pnpm 8',
      packageManager: 'pnpm@9.15.0',
      result: {status: 0, stdout: '8.15.0\n', stderr: ''},
      expected: false,
    },
    {
      name: 'runtime ausente',
      packageManager: 'pnpm@9.15.0',
      result: {status: null, stdout: '', stderr: '', error: new Error('spawn pnpm ENOENT')},
      expected: false,
    },
    {
      name: 'runtime pnpm 9 sem packageManager',
      packageManager: undefined,
      result: {status: 0, stdout: '9.15.0\n', stderr: ''},
      expected: true,
    },
    {
      name: 'runtime pnpm 10 sem packageManager',
      packageManager: undefined,
      result: {status: 0, stdout: '10.2.0\n', stderr: ''},
      expected: true,
    },
  ];

  for (const scenario of scenarios) {
    const repo = makeConsumerRepo(scenario.packageManager);
    const checks = collectWithPnpmResult(repo, scenario.result);
    const pnpm = checks.find(check => check.id === 'pnpm');
    assert.equal(pnpm.ok, scenario.expected, scenario.name);
  }
});

test('Doctor injeta spawnSync no consumidor sem shell e executa somente pnpm --version', () => {
  const repo = makeConsumerRepo();
  const calls = [];
  const checks = collectWithPnpmResult(
    repo,
    {status: 0, stdout: '9.15.0\n', stderr: ''},
    calls,
  );

  assert.equal(checks.find(check => check.id === 'pnpm').ok, true);
  assert.deepEqual(calls, [{
    command: 'pnpm',
    args: ['--version'],
    options: {
      cwd: repo,
      encoding: 'utf8',
      stdio: 'pipe',
      shell: false,
    },
  }]);
});

test('collectChecks exige package.json#name e todos os scripts da cadeia Tangerina', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-doctor-'));
  const scripts = Object.fromEntries(BUILD_SCRIPTS.map(name => [name, 'true']));
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({
    name: 'tangerina-web-core',
    scripts,
  }));

  const checks = collectChecks(repo, {
    playwrightInstalled: () => false,
    pnpmRuntime: () => ({
      id: 'pnpm',
      label: 'pnpm runtime >=9 (`pnpm --version`)',
      ok: true,
      detail: 'pnpm --version retornou 9.15.0',
    }),
  });
  const repoCheck = checks.find(check => check.id === 'repo');
  assert.equal(repoCheck.ok, true);
  assert.equal(checks.find(check => check.id === 'pnpm').ok, true);
  assert.match(checks.find(check => check.id === 'pnpm').label, /pnpm.*runtime/i);
  assert.match(checks.find(check => check.id === 'pnpm').detail, /pnpm --version/);
  for (const script of BUILD_SCRIPTS) {
    const check = checks.find(item => item.id === `script-${script.replace(':', '-')}`);
    assert.equal(check.ok, true, `esperava check ok para ${script}`);
  }

  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({name: 'outro-repo', scripts: {}}));
  const invalidChecks = collectChecks(repo, {
    playwrightInstalled: () => false,
    pnpmRuntime: () => ({id: 'pnpm', label: 'pnpm runtime >=9', ok: true, detail: 'injetado'}),
  });
  assert.equal(invalidChecks.find(check => check.id === 'repo').ok, false);
  assert.equal(invalidChecks.find(check => check.id === 'script-build-tokens').ok, false);
});

test('assertCaptureReady bloqueia a captura com os checks do Doctor e instrucao acionavel', () => {
  const failed = [{
    id: 'components',
    label: 'Web Components buildados',
    ok: false,
    detail: 'rode pnpm build:components',
  }];

  assert.throws(
    () => assertCaptureReady(FAKE_REPO, {collect: () => failed}),
    error => /Pre-flight bloqueou a captura/.test(error.message)
      && /Web Components buildados/.test(error.message)
      && /rode pnpm build:components/.test(error.message)
      && /--doctor/.test(error.message),
  );
});

test('runDoctor continua somente reportando checks falhos', () => {
  const checks = [{id: 'components', label: 'Web Components buildados', ok: false, detail: 'rode pnpm build:components'}];
  const lines = [];
  assert.deepEqual(
    runDoctor(FAKE_REPO, {collect: () => checks, write: line => lines.push(line)}),
    checks,
  );
  assert.ok(lines.some(line => line.includes('item(ns) a resolver')));
});
