'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {makeWcHarnessHost} = require('../src/hosts/wc-harness');
const {makeReactHost} = require('../src/hosts/react');
const {makeAngularHost} = require('../src/hosts/angular');

const ROOT = path.resolve(__dirname, '..');
const HARNESS_SOURCES = [
  'harness/wc/src/main.ts',
  'harness/react/src/main.tsx',
  'harness/angular/src/app.component.ts',
];
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

test('query declarativa preserva percentuais sem segunda decodificacao', async () => {
  const {parseSceneQuery} = await import('../harness/scene-query.ts');
  const percentCell = {
    ...cell,
    args: {label: 'Economize 50%'},
    slots: {'': 'Oferta 100%', suffix: '20% off'},
    context: {kind: 'form', id: 'sale-50%-form'},
  };

  for (const host of [
    makeWcHarnessHost('/repo'),
    makeReactHost('/repo'),
    makeAngularHost('/repo'),
  ]) {
    const url = new URL(host.urlFor(percentCell, 'http://127.0.0.1:3000'));
    const parsed = parseSceneQuery(url.searchParams);
    assert.deepEqual(parsed.args, percentCell.args);
    assert.deepEqual(parsed.slots, percentCell.slots);
    assert.deepEqual(parsed.context, percentCell.context);
  }
});

test('slots aceitam somente texto inerte ou icone com identificadores seguros', async () => {
  const {parseSceneQuery} = await import('../harness/scene-query.ts');
  const activeMarkup = '<img src=x onerror=alert(1)>';
  const parsed = parseSceneQuery(new URLSearchParams({
    args: '{}',
    slots: JSON.stringify({
      label: activeMarkup,
      icon: {icon: 'add'},
      rotation: {icon: '360-rotation'},
    }),
    context: JSON.stringify({kind: 'form', id: 'safe-form'}),
  }));

  assert.equal(parsed.slots.label, activeMarkup);
  assert.deepEqual(parsed.slots.icon, {icon: 'add'});
  assert.deepEqual(parsed.slots.rotation, {icon: '360-rotation'});
  assert.deepEqual(parsed.context, {kind: 'form', id: 'safe-form'});
  assert.throws(
    () => parseSceneQuery(new URLSearchParams({
      slots: JSON.stringify({'bad slot': 'texto'}),
    })),
    /Nome de slot invalido/
  );
  assert.throws(
    () => parseSceneQuery(new URLSearchParams({
      slots: JSON.stringify({icon: {icon: 'add><script'}}),
    })),
    /Nome de icone invalido/
  );

  for (const relativePath of HARNESS_SOURCES) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    assert.doesNotMatch(source, /decodeURIComponent/);
    assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML/);
    assert.match(source, /createElement\(\s*['"]span['"]\s*[,)]/);
    assert.match(source, /aria-hidden/);
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
