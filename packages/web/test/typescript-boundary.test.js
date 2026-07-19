const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

test('workspace web declara Playwright Test e typecheck sem emissao', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const tsconfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'tsconfig.json'), 'utf8'));
  assert.equal(pkg.devDependencies['@playwright/test'], '1.61.1');
  assert.ok(pkg.devDependencies.typescript);
  assert.ok(pkg.devDependencies['@types/node']);
  assert.equal(pkg.scripts.typecheck, 'tsc --noEmit');
  assert.equal(pkg.scripts['test:browser'], 'playwright test --config playwright.config.ts');
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.noEmit, true);
  assert.equal(tsconfig.compilerOptions.module, 'ESNext');
  assert.equal(tsconfig.compilerOptions.moduleResolution, 'Bundler');
  assert.ok(fs.existsSync(path.join(ROOT, 'src', 'runner', 'types.ts')));
});
