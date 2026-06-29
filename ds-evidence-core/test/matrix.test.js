const test = require('node:test');
const assert = require('node:assert');
const {buildMatrix, countCells} = require('../src/matrix');

test('buildMatrix gera uma celula por combinacao incluindo framework', () => {
  const cells = buildMatrix({
    frameworks: ['wc', 'react'],
    stories: [{id: 'a--primary', name: 'Primary'}],
    brands: ['gol'],
    themes: ['light', 'dark'],
    viewports: ['sm'],
    viewportWidths: {sm: 360},
    args: {},
  });
  assert.equal(cells.length, 2 * 1 * 2 * 1); // fw × stories × themes × viewports
  assert.deepEqual(
    cells.map(c => `${c.framework}/${c.theme}`).sort(),
    ['react/dark', 'react/light', 'wc/dark', 'wc/light'],
  );
  assert.equal(cells[0].width, 360);
});

test('countCells multiplica os eixos', () => {
  assert.equal(countCells({frameworks: 2, stories: 3, brands: 1, themes: 2, viewports: 2}), 24);
});

test('buildMatrix rejeita viewport sem largura', () => {
  assert.throws(() => buildMatrix({
    frameworks: ['wc'], stories: [{id: 'a', name: 'A'}],
    brands: ['gol'], themes: ['light'], viewports: ['zz'], viewportWidths: {sm: 360}, args: {},
  }), /Viewport desconhecido/);
});
