const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

test('invokePlaywright passa o run plan e devolve exit do runner sem bloquear servidores', async () => {
  const {invokePlaywright} = await import(pathToFileURL(path.resolve(__dirname, '../src/runner/invoke.ts')).href);
  let captured;
  const spawn = (command, args, options) => {
    captured = {command, args, options};
    const child = fakeChild();
    queueMicrotask(() => child.emit('close', 1, null));
    return child;
  };
  const result = await invokePlaywright({
    planPath: '/tmp/run/run-plan.json',
    logPath: '/tmp/run/playwright.log',
    spawn,
    writeFile: () => {},
  });
  assert.equal(captured.command, process.execPath);
  assert.equal(captured.options.env.ANEMOI_RUN_PLAN, '/tmp/run/run-plan.json');
  assert.equal(captured.options.shell, false);
  assert.equal(result.exitCode, 1);
});

test('invokePlaywright rejeita falha de mkdir como infraestrutura acionavel', async () => {
  const {invokePlaywright} = await import(pathToFileURL(path.resolve(__dirname, '../src/runner/invoke.ts')).href);
  const cause = new Error('volume somente leitura');
  let writes = 0;
  const child = fakeChild();
  const invocation = invokePlaywright({
    planPath: '/tmp/run/run-plan.json',
    logPath: '/tmp/run/logs/playwright.log',
    spawn: () => child,
    mkdir: () => { throw cause; },
    writeFile: () => { writes += 1; },
  });
  queueMicrotask(() => child.emit('close', 0, null));

  await assert.rejects(invocation, error => {
    assert.match(error.message, /Falha ao persistir log do Playwright Test/);
    assert.match(error.message, /\/tmp\/run\/logs\/playwright\.log/);
    assert.match(error.message, /volume somente leitura/);
    assert.equal(error.cause, cause);
    return true;
  });
  assert.equal(writes, 0);
});

test('invokePlaywright rejeita falha de writeFile com causa e caminho do log', async () => {
  const {invokePlaywright} = await import(pathToFileURL(path.resolve(__dirname, '../src/runner/invoke.ts')).href);
  const cause = new Error('sem espaco');
  const child = fakeChild();
  const invocation = invokePlaywright({
    planPath: '/tmp/run/run-plan.json',
    logPath: '/tmp/run/logs/playwright.log',
    spawn: () => child,
    mkdir: () => {},
    writeFile: () => { throw cause; },
  });
  queueMicrotask(() => child.emit('close', 0, null));

  await assert.rejects(invocation, error => {
    assert.match(error.message, /Falha ao persistir log do Playwright Test/);
    assert.match(error.message, /\/tmp\/run\/logs\/playwright\.log/);
    assert.match(error.message, /sem espaco/);
    assert.equal(error.cause, cause);
    return true;
  });
});

test('invokePlaywright ignora close depois de error sem persistir ou reassentar', async () => {
  const {invokePlaywright} = await import(pathToFileURL(path.resolve(__dirname, '../src/runner/invoke.ts')).href);
  const child = fakeChild();
  const cause = new Error('spawn interrompido');
  let writes = 0;
  const invocation = invokePlaywright({
    planPath: '/tmp/run/run-plan.json',
    logPath: '/tmp/run/logs/playwright.log',
    spawn: () => child,
    mkdir: () => {},
    writeFile: () => { writes += 1; },
  });

  child.emit('error', cause);
  child.emit('close', 2, null);
  child.emit('close', 0, null);

  await assert.rejects(invocation, error => error === cause);
  assert.equal(writes, 0);
});

test('invokePlaywright preserva primeiro close e ignora error tardio', async () => {
  const {invokePlaywright} = await import(pathToFileURL(path.resolve(__dirname, '../src/runner/invoke.ts')).href);
  const child = fakeChild();
  let writes = 0;
  const invocation = invokePlaywright({
    planPath: '/tmp/run/run-plan.json',
    logPath: '/tmp/run/logs/playwright.log',
    spawn: () => child,
    mkdir: () => {},
    writeFile: () => { writes += 1; },
  });

  child.emit('close', null, 'SIGTERM');
  child.emit('close', 0, null);
  child.emit('error', new Error('erro tardio'));

  assert.deepEqual(await invocation, {exitCode: 2, signal: 'SIGTERM'});
  assert.equal(writes, 1);
});
