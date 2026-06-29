const {test} = require('node:test');
const assert = require('node:assert');
const {buildIframeUrl} = require('../src/url');

test('buildIframeUrl: minimo (id + brand)', () => {
  const url = buildIframeUrl('http://localhost:7007', {
    storyId: 'content-country-flag--country-flag',
    brandGlobal: 'gol|default_theme',
  });
  assert.equal(
    url,
    'http://localhost:7007/iframe.html?id=content-country-flag--country-flag&globals=themes:gol|default_theme',
  );
});

test('buildIframeUrl: com mode dark', () => {
  const url = buildIframeUrl('http://localhost:7007', {
    storyId: 'action-button-primary--button-primary',
    brandGlobal: 'smiles|club',
    mode: 'dark',
  });
  assert.equal(
    url,
    'http://localhost:7007/iframe.html?id=action-button-primary--button-primary&globals=themes:smiles|club;backgrounds:dark',
  );
});

test('buildIframeUrl: com args', () => {
  const url = buildIframeUrl('http://localhost:7007', {
    storyId: 'action-button-primary--button-primary',
    brandGlobal: 'gol|default_theme',
    args: {inverse: true, onBrand: true},
  });
  assert.equal(
    url,
    'http://localhost:7007/iframe.html?id=action-button-primary--button-primary&globals=themes:gol|default_theme&args=inverse:true;onBrand:true',
  );
});
