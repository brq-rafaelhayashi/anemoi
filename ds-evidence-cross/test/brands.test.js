const test = require('node:test');
const assert = require('node:assert');
const {BRAND_ATTR, THEME_ATTR, VIEWPORT_WIDTHS, brandGlobal} = require('../src/brands');

test('maps de brand/tema/viewport batem com .storybook/preview.ts', () => {
  assert.equal(VIEWPORT_WIDTHS.sm, 360);
  assert.equal(VIEWPORT_WIDTHS.xl, 1440);
  assert.equal(BRAND_ATTR.gol, null);          // gol = sem data-brand
  assert.equal(BRAND_ATTR.smiles, 'smiles');
  assert.equal(BRAND_ATTR['clube-smiles'], 'clube-smiles');
  assert.equal(THEME_ATTR.dark, 'dark');
  assert.equal(THEME_ATTR.light, null);          // light = sem data-theme
  assert.equal(brandGlobal('gol'), 'gol');        // global do Storybook
});

test('brandGlobal lanca erro claro para brand desconhecida', () => {
  assert.throws(() => brandGlobal('xyz'), /Brand desconhecida/);
});
