const {test} = require('node:test');
const assert = require('node:assert');
const {storybookHost, BRAND_GLOBALS, VIEWPORT_WIDTHS} = require('../src/host');

test('storybookHost.selectorFor sempre aponta para #storybook-root', () => {
  assert.equal(storybookHost.selectorFor({}), '#storybook-root');
});

test('storybookHost.urlFor monta a iframe url com o brand global e tema', () => {
  const url = storybookHost.urlFor(
    {storyId: 'a--primary', brand: 'gol', theme: 'light', args: {}},
    'http://localhost:7007',
  );
  assert.equal(
    url,
    'http://localhost:7007/iframe.html?id=a--primary&globals=themes:gol|default_theme',
  );
});

test('storybookHost.urlFor adiciona backgrounds:dark quando theme=dark', () => {
  const url = storybookHost.urlFor(
    {storyId: 'a--primary', brand: 'smiles-club', theme: 'dark', args: {}},
    'http://localhost:7007',
  );
  assert.equal(
    url,
    'http://localhost:7007/iframe.html?id=a--primary&globals=themes:smiles|club;backgrounds:dark',
  );
});

test('maps de brand e viewport expostos pelo host', () => {
  assert.equal(BRAND_GLOBALS.gol, 'gol|default_theme');
  assert.equal(VIEWPORT_WIDTHS.xl, 1440);
});
