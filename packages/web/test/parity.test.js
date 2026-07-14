const test = require('node:test');
const assert = require('node:assert');
const {groupByCell} = require('../src/parity');

test('groupByCell agrupa as 3 capturas por (brand,story,viewport,theme)', () => {
  const caps = [
    {framework: 'wc', brand: 'gol', storyName: 'Primary', viewport: 'sm', theme: 'light', relPath: 'wc/gol/Primary/sm/light.png'},
    {framework: 'react', brand: 'gol', storyName: 'Primary', viewport: 'sm', theme: 'light', relPath: 'react/gol/Primary/sm/light.png'},
    {framework: 'angular', brand: 'gol', storyName: 'Primary', viewport: 'sm', theme: 'light', relPath: 'angular/gol/Primary/sm/light.png'},
  ];
  const groups = groupByCell(caps);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].wc, 'wc/gol/Primary/sm/light.png');
  assert.equal(groups[0].react, 'react/gol/Primary/sm/light.png');
  assert.equal(groups[0].label, 'gol · Primary · sm · light');
});
