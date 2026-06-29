const test = require('node:test');
const assert = require('node:assert');
const {cellRelPath} = require('../src/capture');

test('cellRelPath organiza por framework/brand/story/viewport/theme', () => {
  const rel = cellRelPath({framework: 'react', brand: 'gol', storyName: 'Primary', viewport: 'sm', theme: 'dark'});
  assert.equal(rel, 'react/gol/Primary/sm/dark.png');
});
