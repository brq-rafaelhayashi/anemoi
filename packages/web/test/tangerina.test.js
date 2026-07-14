const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  BUILD_SCRIPTS,
  probePnpmVersion,
  validateTangerinaRepo,
  runTangerinaBuilds,
} = require('../src/tangerina');

function fixture(options = {}) {
  const scripts = options.scripts || Object.fromEntries(BUILD_SCRIPTS.map(name => [name, 'true']));
  const packageManager = Object.hasOwn(options, 'packageManager')
    ? options.packageManager
    : 'pnpm@9.15.0';
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tangerina-contract-'));
  const pkg = {name: 'tangerina-web-core', scripts};
  if (packageManager !== undefined) pkg.packageManager = packageManager;
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify(pkg));
  return repo;
}

test('validateTangerinaRepo exige identidade e scripts', () => {
  assert.doesNotThrow(() => validateTangerinaRepo(fixture()));
  assert.throws(() => validateTangerinaRepo(fixture({scripts: {}})), /build:tokens/);
});

test('validateTangerinaRepo exige pnpm 9 ou superior declarado pelo consumidor', () => {
  assert.throws(
    () => validateTangerinaRepo(fixture({packageManager: undefined})),
    /packageManager.*pnpm@9/i,
  );
  assert.throws(
    () => validateTangerinaRepo(fixture({packageManager: 'pnpm@8.15.0'})),
    /pnpm.*>=?9/i,
  );
});

test('runTangerinaBuilds bloqueia runtime pnpm 8 mesmo com packageManager pnpm@9', () => {
  const repo = fixture({packageManager: 'pnpm@9.15.0'});
  const calls = [];

  assert.throws(
    () => runTangerinaBuilds(repo, {
      logDir: path.join(repo, 'logs'),
      probeRuntime: () => '8.15.0',
      run: (_command, args) => calls.push(args[0]),
    }),
    /pnpm.*8\.15\.0.*9/i,
  );
  assert.deepEqual(calls, []);
});

test('probePnpmVersion consulta exatamente pnpm --version por uma injeção', () => {
  const calls = [];
  const version = probePnpmVersion({
    cwd: '/consumer/tangerina-web-core',
    spawnSync: (command, args, options) => {
      calls.push({command, args, options});
      return {status: 0, stdout: '9.15.0\n', stderr: ''};
    },
  });

  assert.equal(version, '9.15.0');
  assert.deepEqual(calls, [{
    command: 'pnpm',
    args: ['--version'],
    options: {
      cwd: '/consumer/tangerina-web-core',
      encoding: 'utf8',
      stdio: 'pipe',
      shell: false,
    },
  }]);
});

test('runTangerinaBuilds aceita runtime pnpm 9 ou superior', () => {
  for (const version of ['9.15.0', '10.2.0']) {
    const repo = fixture({packageManager: 'pnpm@9.15.0'});
    assert.doesNotThrow(() => runTangerinaBuilds(repo, {
      logDir: path.join(repo, 'logs'),
      probeRuntime: () => version,
      run: () => {},
    }));
  }
});

test('probePnpmVersion produz diagnostico acionavel quando nao consegue consultar a versao', () => {
  const spawnError = new Error('spawn pnpm ENOENT');

  assert.throws(
    () => probePnpmVersion({
      spawnSync: () => ({status: null, error: spawnError, stdout: '', stderr: ''}),
    }),
    error => /pnpm --version/.test(error.message)
      && /instale|ative/i.test(error.message)
      && /pnpm.*9/i.test(error.message),
  );
});

test('runTangerinaBuilds executa a ordem aprovada', () => {
  const repo = fixture();
  const calls = [];
  const events = [];
  const logDir = path.join(repo, 'logs');
  runTangerinaBuilds(repo, {
    logDir,
    probeRuntime: () => {
      events.push('probe');
      return '9.15.0';
    },
    run: (command, args, options) => {
      events.push('build');
      calls.push({command, args, options});
    },
  });
  assert.equal(events[0], 'probe');
  assert.equal(events.filter(event => event === 'probe').length, 1);
  assert.deepEqual(calls, BUILD_SCRIPTS.map(script => ({
    command: 'pnpm',
    args: [script],
    options: {
      cwd: repo,
      logPath: path.join(logDir, `${script.replace(':', '-')}.log`),
      echo: true,
    },
  })));
});

test('runTangerinaBuilds respeita skipBuild', () => {
  const repo = fixture();
  let called = false;
  let probed = false;
  runTangerinaBuilds(repo, {
    skipBuild: true,
    logDir: path.join(repo, 'logs'),
    probeRuntime: () => {
      probed = true;
      throw new Error('nao deveria consultar pnpm');
    },
    run: () => { called = true; },
  });
  assert.equal(called, false);
  assert.equal(probed, false);
});

test('runTangerinaBuilds interrompe a cadeia no primeiro build que falhar', () => {
  const repo = fixture();
  const calls = [];
  assert.throws(
    () => runTangerinaBuilds(repo, {
      logDir: path.join(repo, 'logs'),
      probeRuntime: () => '9.15.0',
      run: (_command, args) => {
        calls.push(args[0]);
        if (args[0] === 'build:assets') throw new Error('build quebrado');
      },
    }),
    /build quebrado/,
  );
  assert.deepEqual(calls, ['build:tokens', 'build:assets']);
});
