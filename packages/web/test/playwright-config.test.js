const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('config deriva projects e testMatch do run plan', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../playwright.config.ts'), 'utf8');
  assert.match(source, /plan\.browsers\.map/);
  assert.match(source, /browserName/);
  assert.match(source, /trace: 'off'/);
  assert.match(source, /timeout: 120000/);
  assert.match(source, /globalSetup/);
  assert.match(source, /plan\.specPath/);
  assert.doesNotMatch(source, /import\.meta/, 'config deve carregar no transpile CommonJS do Playwright');
  const fixture = fs.readFileSync(path.resolve(__dirname, '../src/runner/fixtures.ts'), 'utf8');
  assert.match(fixture, /tentativa interrompida antes da publicacao do Resultado Atomico/);
  assert.match(fixture, /artifactPrefix/);
  assert.doesNotMatch(fixture, /import\.meta/, 'fixture deve carregar no transpile CommonJS do Playwright');
  const setup = fs.readFileSync(path.resolve(__dirname, '../src/runner/globalSetup.ts'), 'utf8');
  assert.doesNotMatch(setup, /import\.meta/, 'global setup deve carregar no transpile CommonJS do Playwright');
});
