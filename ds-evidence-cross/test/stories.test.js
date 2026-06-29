const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const {filterStoriesForComponent, readIndexJson} = require('../src/stories');

const FIX = path.join(__dirname, 'fixtures');

test('filtra stories (type=story) pelo dir do componente tgr-*', () => {
  const index = readIndexJson(FIX);
  const stories = filterStoriesForComponent(index, 'tgr-button');
  assert.deepEqual(stories.map(s => s.id), ['action-button--primary', 'action-button--disabled']);
  assert.equal(stories[0].name, 'Primary');
});

test('erro claro quando nenhuma story bate', () => {
  const index = readIndexJson(FIX);
  assert.throws(() => filterStoriesForComponent(index, 'tgr-nope', {throwIfEmpty: true}), /Nenhuma story/);
});
