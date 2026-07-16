'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {collectProvenance} = require('../src/provenance');

function git(cwd, ...args) {
  execFileSync('git', ['-c', 'user.email=t@t.dev', '-c', 'user.name=t', ...args], {cwd, stdio: 'ignore'});
}

test('collectProvenance: repo sem git => commit null, resto preenchido', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-'));
  const p = collectProvenance({repo});
  assert.equal(p.tangerina.commit, null);
  assert.equal(p.environment.node, process.version);
  assert.equal(p.environment.browser, 'chromium');
  assert.equal(p.thresholds.pixelmatch, 0.1);
  assert.equal(p.thresholds.mismatchTolerance, 0);
  assert.equal(p.thresholds.fit, 'union');
  assert.equal(p.capture.deviceScaleFactor, 2);
  assert.equal(p.capture.viewportHeight, 900);
});

test('collectProvenance: repo git => commit hex de 40 chars', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-git-'));
  git(repo, 'init');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'x');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'x');
  const p = collectProvenance({repo});
  assert.match(p.tangerina.commit, /^[0-9a-f]{40}$/);
});

test('collectProvenance: versao do anemoi vem do package.json do web', () => {
  const p = collectProvenance({repo: os.tmpdir()});
  assert.equal(p.anemoi.version, require('../package.json').version);
});
