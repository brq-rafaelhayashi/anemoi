const {test} = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const {cellRelPath} = require('../src/capture');

test('cellRelPath: sem mode -> <brand>/<story>/<viewport>.png', () => {
  assert.equal(
    cellRelPath({brand: 'gol', storyName: 'Country Flag', viewport: 'xs'}),
    path.join('gol', 'Country Flag', 'xs.png'),
  );
});

test('cellRelPath: com mode -> <brand>/<story>/<viewport>/<mode>.png', () => {
  assert.equal(
    cellRelPath({brand: 'gol', storyName: 'Country Flag', viewport: 'xs', mode: 'dark'}),
    path.join('gol', 'Country Flag', 'xs', 'dark.png'),
  );
});
