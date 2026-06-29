const {test} = require('node:test');
const assert = require('node:assert');
const {
  BRAND_GLOBALS,
  VIEWPORT_WIDTHS,
  buildMatrix,
  countCells,
} = require('../src/matrix');

test('BRAND_GLOBALS e VIEWPORT_WIDTHS expostos', () => {
  assert.equal(BRAND_GLOBALS['gol'], 'gol|default_theme');
  assert.equal(BRAND_GLOBALS['smiles'], 'smiles|default_theme');
  assert.equal(BRAND_GLOBALS['smiles-club'], 'smiles|club');
  assert.equal(VIEWPORT_WIDTHS.xs, 320);
  assert.equal(VIEWPORT_WIDTHS.xl, 1440);
});

test('buildMatrix: default sem modes nem args', () => {
  const cells = buildMatrix({
    stories: [{id: 'badge--badge', name: 'Badge'}],
    brands: ['gol', 'smiles'],
    viewports: ['xs', 'md'],
    modes: [],
    args: {},
  });
  // 1 story x 2 brands x 2 viewports x (sem mode) = 4
  assert.equal(cells.length, 4);
  const first = cells[0];
  assert.equal(first.brand, 'gol');
  assert.equal(first.brandGlobal, 'gol|default_theme');
  assert.equal(first.storyId, 'badge--badge');
  assert.equal(first.viewport, 'xs');
  assert.equal(first.width, 320);
  assert.equal(first.mode, undefined);
});

test('buildMatrix: com modes light/dark multiplica', () => {
  const cells = buildMatrix({
    stories: [{id: 'badge--badge', name: 'Badge'}],
    brands: ['gol'],
    viewports: ['xs'],
    modes: ['light', 'dark'],
    args: {},
  });
  assert.equal(cells.length, 2);
  assert.deepEqual(cells.map(c => c.mode), ['light', 'dark']);
});

test('buildMatrix: args sao anexados a cada celula', () => {
  const cells = buildMatrix({
    stories: [{id: 'badge--badge', name: 'Badge'}],
    brands: ['gol'],
    viewports: ['xs'],
    modes: [],
    args: {inverse: true},
  });
  assert.deepEqual(cells[0].args, {inverse: true});
});

test('countCells: produto dos eixos', () => {
  assert.equal(
    countCells({stories: 4, brands: 3, viewports: 5, modes: 0}),
    60,
  );
  assert.equal(
    countCells({stories: 4, brands: 3, viewports: 5, modes: 2}),
    120,
  );
});
