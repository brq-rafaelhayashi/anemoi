const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const {resolveStoryArgs, assertSerializableArgs} = require('../src/storyArgs');

const PACKAGE_DIR = path.join(__dirname, '..');

const supportsTs = Boolean(process.features?.typescript) || Number(process.versions.node.split('.')[0]) >= 24;

test('rejeita funcao e informa story, arquivo e propriedade', () => {
  assert.throws(
    () => assertSerializableArgs(
      {label: 'Salvar', onClick: () => {}},
      {storyName: 'Primary', sourcePath: 'tgr-button.stories.ts'},
    ),
    /Primary.*tgr-button\.stories\.ts.*onClick/s,
  );
});

test('rejeita referencia circular', () => {
  const args = {label: 'Salvar'};
  args.self = args;
  assert.throws(
    () => assertSerializableArgs(args, {storyName: 'Primary', sourcePath: 'sample.stories.ts'}),
    /referencia circular/i,
  );
});

test('mescla meta.args + story.args para cada storyId', { skip: supportsTs ? false : 'requer Node >=24 (type-stripping nativo de .ts)' }, async () => {
  const stories = [
    {id: 'action-button--primary', name: 'Primary', importPath: './test/fixtures/sample.stories.ts'},
    {id: 'action-button--disabled', name: 'Disabled', importPath: './test/fixtures/sample.stories.ts'},
  ];
  const got = await resolveStoryArgs(PACKAGE_DIR, stories, {
    storiesRoot: path.join(PACKAGE_DIR, 'test', 'fixtures'),
  });

  assert.deepEqual(got['action-button--primary'], {label: 'Salvar', variant: 'primary', disabled: false});
  assert.deepEqual(got['action-button--disabled'], {label: 'Salvar', variant: 'primary', disabled: true});
});

test('retorna objeto vazio para storyId nao encontrado na story', { skip: supportsTs ? false : 'requer Node >=24 (type-stripping nativo de .ts)' }, async () => {
  const stories = [
    {id: 'action-button--nope', name: 'Nope', importPath: './test/fixtures/sample.stories.ts'},
  ];
  const got = await resolveStoryArgs(PACKAGE_DIR, stories, {
    storiesRoot: path.join(PACKAGE_DIR, 'test', 'fixtures'),
  });
  // Usa somente meta.args (story nao encontrada = storyArgs vazio)
  assert.deepEqual(got['action-button--nope'], {label: 'Salvar', variant: 'primary', disabled: false});
});

test('rejeita importPath fora da raiz de stories permitida', async () => {
  await assert.rejects(
    resolveStoryArgs(PACKAGE_DIR, [{
      id: 'outside--story',
      name: 'Outside',
      importPath: '../package.json',
    }], {storiesRoot: path.join(PACKAGE_DIR, 'test', 'fixtures')}),
    /fora da raiz de stories permitida/,
  );
});
