const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runSource = fs.readFileSync(path.join(__dirname, '../src/run.js'), 'utf8');

test('CLI Web nao importa legado e delega captura ao Playwright Test', () => {
  for (const forbidden of [['run', 'legacy'], ['legacy', 'adapter']]) {
    assert.equal(runSource.includes(forbidden.join('-')), false);
  }
  assert.match(runSource, /return runPlaywrightState\(args, cwd, overrides\);/);
});
