const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const {resolveStoryArgs} = require('../src/storyArgs');

const PACKAGE_DIR = path.join(__dirname, '..');

test('mescla meta.args + story.args para cada storyId', async () => {
  const stories = [
    {id: 'action-button--primary', name: 'Primary', importPath: './test/fixtures/sample.stories.ts'},
    {id: 'action-button--disabled', name: 'Disabled', importPath: './test/fixtures/sample.stories.ts'},
  ];
  const got = await resolveStoryArgs(PACKAGE_DIR, stories);

  assert.deepEqual(got['action-button--primary'], {label: 'Salvar', variant: 'primary', disabled: false});
  assert.deepEqual(got['action-button--disabled'], {label: 'Salvar', variant: 'primary', disabled: true});
});

test('retorna objeto vazio para storyId nao encontrado na story', async () => {
  const stories = [
    {id: 'action-button--nope', name: 'Nope', importPath: './test/fixtures/sample.stories.ts'},
  ];
  const got = await resolveStoryArgs(PACKAGE_DIR, stories);
  // Usa somente meta.args (story nao encontrada = storyArgs vazio)
  assert.deepEqual(got['action-button--nope'], {label: 'Salvar', variant: 'primary', disabled: false});
});
