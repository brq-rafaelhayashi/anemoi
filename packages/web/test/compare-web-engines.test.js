'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {compareEngineManifests} = require('../scripts/compare-web-engines');

function group(overrides = {}) {
  return {
    browser: 'chromium',
    brand: 'gol',
    storyId: 'primary',
    viewport: 'sm',
    theme: 'light',
    wc: 'wc.png',
    react: 'react.png',
    angular: 'angular.png',
    parity: [
      {against: 'react', mismatch: 0, sizeMatch: true},
      {against: 'angular', mismatch: 0, sizeMatch: true},
    ],
    a11y: {
      audits: {
        wc: {violations: []},
        react: {violations: []},
        angular: {violations: []},
      },
      ariaParity: [
        {against: 'react', match: true},
        {against: 'angular', match: true},
      ],
    },
    ...overrides,
  };
}

test('comparador aprova provas equivalentes apesar dos paths dos artefatos', () => {
  const legacy = {groups: [group({browser: null, wc: 'wc/old.png'})]};
  const current = {groups: [group({wc: 'chromium/wc/new.png'})]};

  assert.deepEqual(compareEngineManifests(legacy, current), {
    match: true,
    comparedCells: 1,
    differences: [],
  });
});

for (const [name, mutate] of [
  ['celula ausente', () => []],
  ['captura ausente', value => [{...value, react: undefined}]],
  ['pixel diferente', value => [{...value, parity: [{against: 'react', mismatch: 4, sizeMatch: true}]}]],
  ['dimensao diferente', value => [{...value, parity: [{against: 'react', mismatch: 0, sizeMatch: false}]}]],
  ['axe diferente', value => [{
    ...value,
    a11y: {
      ...value.a11y,
      audits: {...value.a11y.audits, react: {violations: [{id: 'button-name'}]}},
    },
  }]],
  ['aria diferente', value => [{
    ...value,
    a11y: {...value.a11y, ariaParity: [{against: 'react', match: false}]},
  }]],
]) {
  test(`comparador detecta ${name}`, () => {
    const base = group();
    const result = compareEngineManifests({groups: [base]}, {groups: mutate(base)});

    assert.equal(result.match, false);
    assert.notEqual(result.differences.length, 0);
  });
}

test('comparador preserva a identidade canonica storyId e nao usa display name', () => {
  const legacy = {groups: [group({storyId: 'primary', storyName: 'Primary'})]};
  const current = {groups: [group({storyId: 'secondary', storyName: 'Primary'})]};

  const result = compareEngineManifests(legacy, current);

  assert.equal(result.match, false);
  assert.deepEqual(result.differences.map(item => item.path), [
    'groups.gol|primary|sm|light',
    'groups.gol|secondary|sm|light',
  ]);
});

test('comparador falha fechado quando storyId canonico esta ausente', () => {
  const malformed = group({storyId: undefined, sceneId: 'primary'});

  assert.throws(
    () => compareEngineManifests({groups: [malformed]}, {groups: [malformed]}),
    /storyId canonico ausente/,
  );
});
