'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {makeWcHarnessHost} = require('../src/hosts/wc-harness');
const {makeReactHost} = require('../src/hosts/react');
const {makeAngularHost} = require('../src/hosts/angular');

const ROOT = path.resolve(__dirname, '..');
const cell = {
  component: 'tgr-button',
  sceneId: 'submit',
  brand: 'gol',
  theme: 'light',
  viewport: 'sm',
  args: {type: 'submit'},
  slots: {'': 'Enviar'},
  context: {kind: 'form', id: 'button-form'},
};

test('os tres hosts serializam a mesma Cena declarativa', () => {
  for (const host of [
    makeWcHarnessHost('/repo'),
    makeReactHost('/repo'),
    makeAngularHost('/repo'),
  ]) {
    const url = new URL(host.urlFor(cell, 'http://127.0.0.1:3000'));
    assert.equal(url.searchParams.get('c'), 'tgr-button');
    assert.deepEqual(JSON.parse(url.searchParams.get('args')), {type: 'submit'});
    assert.deepEqual(JSON.parse(url.searchParams.get('slots')), {'': 'Enviar'});
    assert.deepEqual(JSON.parse(url.searchParams.get('context')), {
      kind: 'form',
      id: 'button-form',
    });
    assert.equal(host.selectorFor(cell), '#evidence-root');
  }
});

test('WC harness pertence ao Anemoi e nao importa Storybook', () => {
  const source = fs.readFileSync(path.join(ROOT, 'harness/wc/src/main.ts'), 'utf8');
  assert.match(source, /defineCustomElements/);
  assert.doesNotMatch(source, /storybook/i);
  assert.match(source, /evidence-root/);
});

test('setup:harnesses instala wc, react e angular', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(ROOT, '../..', 'package.json'), 'utf8')
  );
  assert.match(pkg.scripts['setup:harnesses'], /harness\/wc install/);
  assert.match(pkg.scripts['setup:harnesses'], /harness\/react install/);
  assert.match(pkg.scripts['setup:harnesses'], /harness\/angular install/);
});
