const test = require('node:test');
const assert = require('node:assert');
const {groupByCell} = require('../src/parity');

test('groupByCell agrupa as 3 capturas por (brand,story,viewport,theme)', () => {
  const caps = [
    {framework: 'wc', brand: 'gol', storyId: 'action-button--primary', storyName: 'Primary', viewport: 'sm', theme: 'light', relPath: 'wc/gol/action-button--primary/sm/light.png'},
    {framework: 'react', brand: 'gol', storyId: 'action-button--primary', storyName: 'Primary', viewport: 'sm', theme: 'light', relPath: 'react/gol/action-button--primary/sm/light.png'},
    {framework: 'angular', brand: 'gol', storyId: 'action-button--primary', storyName: 'Primary', viewport: 'sm', theme: 'light', relPath: 'angular/gol/action-button--primary/sm/light.png'},
  ];
  const groups = groupByCell(caps);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].wc, 'wc/gol/action-button--primary/sm/light.png');
  assert.equal(groups[0].react, 'react/gol/action-button--primary/sm/light.png');
  assert.equal(groups[0].label, 'gol · Primary · sm · light');
});

test('groupByCell nao colapsa stories distintas com o mesmo display name', () => {
  const base = {brand: 'gol', storyName: 'Primary', viewport: 'sm', theme: 'light'};
  const groups = groupByCell([
    {...base, framework: 'wc', storyId: 'button--primary-a', relPath: 'a.png'},
    {...base, framework: 'wc', storyId: 'button--primary-b', relPath: 'b.png'},
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => group.wc), ['a.png', 'b.png']);
});
