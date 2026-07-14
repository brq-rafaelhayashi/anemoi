const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const json = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

test('workspace expõe somente o Anemoi Web ativo', () => {
  const root = json('package.json');
  const lock = json('package-lock.json');
  const web = json('packages/web/package.json');

  assert.deepEqual(root.workspaces, ['packages/core', 'packages/web', 'anemoi-preset']);
  assert.equal(root.scripts.web, 'node packages/web/bin/anemoi-web.js');
  assert.equal(root.scripts.cross, undefined);
  assert.equal(web.name, '@gol-smiles/anemoi-web');
  assert.equal(web.bin['anemoi-web'], 'bin/anemoi-web.js');
  assert.equal(fs.existsSync(path.join(ROOT, 'anemoi-web')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'anemoi-cross')), false);
  assert.equal(lock.packages['anemoi-cross'], undefined);
  assert.equal(lock.packages['anemoi-web'], undefined);
  assert.equal(lock.packages['node_modules/@gol-smiles/anemoi-cross'], undefined);
  assert.equal(
    Object.values(lock.packages).some(pkg => pkg && pkg.extraneous === true),
    false,
  );
});
