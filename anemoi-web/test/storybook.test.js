const {test} = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const {readIndexJson, filterStoriesForComponent} = require('../src/storybook');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');

test('readIndexJson: le entries do arquivo', () => {
  const index = readIndexJson(FIXTURE_DIR);
  assert.ok(index.entries['content-country-flag--country-flag']);
});

test('filterStoriesForComponent: filtra por dir do importPath e ignora docs', () => {
  const index = readIndexJson(FIXTURE_DIR);
  const stories = filterStoriesForComponent(index, 'country_flag');
  assert.equal(stories.length, 1);
  assert.equal(stories[0].id, 'content-country-flag--country-flag');
  assert.equal(stories[0].name, 'Country Flag');
});

test('filterStoriesForComponent: componente sem match retorna vazio', () => {
  const index = readIndexJson(FIXTURE_DIR);
  assert.deepEqual(filterStoriesForComponent(index, 'inexistente'), []);
});
