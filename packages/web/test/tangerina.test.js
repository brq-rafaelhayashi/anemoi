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
