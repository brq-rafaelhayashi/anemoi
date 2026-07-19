const {test} = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const path = require('node:path');
const {runPlaywrightState} = require('../src/run');

function baseArgs() {
  return {repo: '/repo', component: 'tgr-button', card: 'C-1'};
}

test('executor novo sempre finaliza depois de exit 1 dos specs e usa o gate como exit final', async () => {
  const calls = [];
  const manifest = await runPlaywrightState(baseArgs(), '/cwd', {
    createRunDir: () => '/tmp/run',
    preflight: async () => ({planPath: '/tmp/run/run-plan.json'}),
    invoke: async () => ({exitCode: 1}),
    finalize: async () => {
      calls.push('finalize');
      return {gate: {status: 'failed'}, status: 'failed'};
    },
    setExitCode: value => calls.push(`exit:${value}`),
  });
  assert.equal(manifest.status, 'failed');
  assert.deepEqual(calls, ['finalize', 'exit:1']);
});

test('exit 2 do Playwright e erro de infraestrutura e nao publica aprovacao', async () => {
  await assert.rejects(() => runPlaywrightState(baseArgs(), '/cwd', {
    createRunDir: () => '/tmp/run',
    preflight: async () => ({planPath: '/tmp/plan'}),
    invoke: async () => ({exitCode: 2}),
    finalize: async () => { throw new Error('nao deveria finalizar'); },
  }), /Playwright Test falhou com exit 2/);
});

test('run diagnostico termina sem mentir que o gate foi aprovado', async () => {
  const exits = [];
  const manifest = await runPlaywrightState({...baseArgs(), browsers: 'chromium'}, '/cwd', {
    createRunDir: () => '/tmp/run',
    preflight: async () => ({planPath: '/tmp/plan'}),
    invoke: async () => ({exitCode: 0}),
    finalize: async () => ({gate: {status: 'not-approved', trusted: false}, status: 'failed'}),
    setExitCode: value => exits.push(value),
  });
  assert.equal(manifest.gate.trusted, false);
  assert.deepEqual(exits, [0]);
});

test('falha de persistencia do invocador e infraestrutura e nao finaliza', async () => {
  const cause = new Error('Falha ao persistir log do Playwright Test em /tmp/playwright.log: sem espaco');
  let finalized = false;
  await assert.rejects(() => runPlaywrightState(baseArgs(), '/cwd', {
    createRunDir: () => '/tmp/run',
    preflight: async () => ({planPath: '/tmp/plan'}),
    invoke: async () => { throw cause; },
    finalize: async () => { finalized = true; },
    writeFailure: () => {},
  }), error => error === cause);
  assert.equal(finalized, false);
});

test('bin preserva exit 2 para erro de infraestrutura da CLI', () => {
  const root = path.resolve(__dirname, '../../..');
  const result = childProcess.spawnSync(process.execPath, [
    path.join(root, 'packages/web/bin/anemoi-web.js'),
    '--repo', root,
    '--component', 'tgr-button',
    '--engine', 'desconhecida',
  ], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /Engine desconhecida/);
});
