const {test} = require('node:test');
const assert = require('node:assert/strict');
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
