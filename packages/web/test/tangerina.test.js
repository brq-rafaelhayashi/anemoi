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
      run: (command, args) => {
        calls.push(args[0]);
        return command === 'pnpm' && args[0] === '--version'
          ? {status: 0, stdout: '8.15.0\n', stderr: ''}
          : {status: 0, stdout: '', stderr: ''};
      },
    }),
    /pnpm.*8\.15\.0.*9/i,
  );
  assert.deepEqual(calls, ['--version']);
});

test('probePnpmVersion consulta exatamente pnpm --version por uma injeção', () => {
  const calls = [];
  const logPath = '/tmp/anemoi-pnpm-version.log';
  const version = probePnpmVersion({
    cwd: '/consumer/tangerina-web-core',
    logPath,
    run: (command, args, options) => {
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
      logPath,
      echo: true,
    },
  }]);
});

test('runTangerinaBuilds aceita runtime pnpm 9 ou superior', () => {
  for (const version of ['9.15.0', '10.2.0']) {
    const repo = fixture({packageManager: 'pnpm@9.15.0'});
    assert.doesNotThrow(() => runTangerinaBuilds(repo, {
      logDir: path.join(repo, 'logs'),
      run: (_command, args) => ({
        status: 0,
        stdout: args[0] === '--version' ? `${version}\n` : '',
        stderr: '',
      }),
    }));
  }
});

test('probePnpmVersion produz diagnostico acionavel quando nao consegue consultar a versao', () => {
  const spawnError = new Error('spawn pnpm ENOENT');

  assert.throws(
    () => probePnpmVersion({
      cwd: '/consumer/tangerina-web-core',
      logPath: '/tmp/anemoi-pnpm-version.log',
      run: () => { throw spawnError; },
    }),
    error => /pnpm --version/.test(error.message)
      && /instale|ative/i.test(error.message)
      && /pnpm.*9/i.test(error.message),
  );
});

test('probePnpmVersion produz diagnostico acionavel para stdout invalido', () => {
  assert.throws(
    () => probePnpmVersion({
      cwd: '/consumer/tangerina-web-core',
      logPath: '/tmp/anemoi-pnpm-version.log',
      run: () => ({status: 0, stdout: 'pnpm nove\n', stderr: ''}),
    }),
    error => /interpretar/.test(error.message)
      && /pnpm --version/.test(error.message)
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
    run: (command, args, options) => {
      if (args[0] === '--version') {
        events.push('probe');
        return {status: 0, stdout: '9.15.0\n', stderr: ''};
      }
      events.push('build');
      calls.push({command, args, options});
      return {status: 0, stdout: '', stderr: ''};
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

test('runTangerinaBuilds valida runtime pnpm mesmo com skipBuild', () => {
  const repo = fixture();
  const logDir = path.join(repo, 'logs');
  const calls = [];
  runTangerinaBuilds(repo, {
    skipBuild: true,
    logDir,
    run: (command, args, options) => {
      calls.push({command, args, options});
      return {status: 0, stdout: '9.15.0\n', stderr: ''};
    },
  });
  assert.deepEqual(calls, [{
    command: 'pnpm',
    args: ['--version'],
    options: {
      cwd: repo,
      logPath: path.join(logDir, 'pnpm-version.log'),
      echo: true,
    },
  }]);
});

test('runTangerinaBuilds interrompe a cadeia no primeiro build que falhar', () => {
  const repo = fixture();
  const calls = [];
  assert.throws(
    () => runTangerinaBuilds(repo, {
      logDir: path.join(repo, 'logs'),
      run: (_command, args) => {
        if (args[0] === '--version') return {status: 0, stdout: '9.15.0\n', stderr: ''};
        calls.push(args[0]);
        if (args[0] === 'build:assets') throw new Error('build quebrado');
        return {status: 0, stdout: '', stderr: ''};
      },
    }),
    /build quebrado/,
  );
  assert.deepEqual(calls, ['build:tokens', 'build:assets']);
});
