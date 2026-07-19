const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

test('invokePlaywright passa o run plan e devolve exit do runner sem bloquear servidores', async () => {
  const {invokePlaywright} = await import(pathToFileURL(path.resolve(__dirname, '../src/runner/invoke.ts')).href);
  let captured;
  const spawn = (command, args, options) => {
    captured = {command, args, options};
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
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
