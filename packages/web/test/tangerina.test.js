const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  BUILD_SCRIPTS,
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

test('runTangerinaBuilds executa a ordem aprovada', () => {
  const repo = fixture();
  const calls = [];
  const logDir = path.join(repo, 'logs');
  runTangerinaBuilds(repo, {
    logDir,
    run: (command, args, options) => calls.push({command, args, options}),
  });
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
  runTangerinaBuilds(repo, {skipBuild: true, logDir: path.join(repo, 'logs'), run: () => { called = true; }});
  assert.equal(called, false);
});

test('runTangerinaBuilds interrompe a cadeia no primeiro build que falhar', () => {
  const repo = fixture();
  const calls = [];
  assert.throws(
    () => runTangerinaBuilds(repo, {
      logDir: path.join(repo, 'logs'),
      run: (_command, args) => {
        calls.push(args[0]);
        if (args[0] === 'build:assets') throw new Error('build quebrado');
      },
    }),
    /build quebrado/,
  );
  assert.deepEqual(calls, ['build:tokens', 'build:assets']);
});
