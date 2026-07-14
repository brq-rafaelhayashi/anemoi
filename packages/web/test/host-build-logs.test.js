const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {makeWcHost} = require('../src/hosts/wc');
const {makeReactHost} = require('../src/hosts/react');
const {makeAngularHost} = require('../src/hosts/angular');

for (const [framework, factory] of [
  ['wc', makeWcHost],
  ['react', makeReactHost],
  ['angular', makeAngularHost],
]) {
  test(`${framework} encaminha build para runLogged com logPath`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `anemoi-${framework}-`));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const outDir = path.join(root, 'out');
    fs.mkdirSync(outDir, {recursive: true});
    if (framework === 'angular') fs.writeFileSync(path.join(outDir, 'index.html'), '');
    const calls = [];
    const run = (...args) => {
      calls.push(args);
      return {status: 0, stdout: '', stderr: ''};
    };
    const host = factory('/tmp/tangerina', {run, generate: () => {}});
    host.build('/tmp/tangerina', outDir, {logPath: path.join(root, `${framework}.log`)});
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2].logPath, path.join(root, `${framework}.log`));
    assert.equal(calls[0][2].echo, true);
  });
}
