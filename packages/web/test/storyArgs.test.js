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
    {id: 'action-button--full-width', name: 'Full Width', importPath: './test/fixtures/sample.stories.ts'},
    {id: 'action-button--on-brand', name: 'On Brand', importPath: './test/fixtures/sample.stories.ts'},
  ];
  const got = await resolveStoryArgs(PACKAGE_DIR, stories, {
    storiesRoot: path.join(PACKAGE_DIR, 'test', 'fixtures'),
  });

  assert.deepEqual(got['action-button--primary'].args, {label: 'Salvar', variant: 'primary', disabled: false});
  assert.deepEqual(got['action-button--disabled'].args, {label: 'Salvar', variant: 'primary', disabled: true});
  assert.deepEqual(got['action-button--full-width'].args, {
    label: 'Continuar',
    variant: 'primary',
    disabled: false,
    fullWidth: true,
  });
  assert.deepEqual(got['action-button--on-brand'].args, {
    label: 'Entrar',
    variant: 'primary',
    disabled: false,
    brand: true,
  });
});

test('falha com contexto quando storyId nao corresponde a um export', { skip: supportsTs ? false : 'requer Node >=24 (type-stripping nativo de .ts)' }, async () => {
  const stories = [
    {id: 'action-button--nope', name: 'Nope', importPath: './test/fixtures/sample.stories.ts'},
  ];
  await assert.rejects(
    resolveStoryArgs(PACKAGE_DIR, stories, {
      storiesRoot: path.join(PACKAGE_DIR, 'test', 'fixtures'),
    }),
    /Nope.*action-button--nope.*sample\.stories\.ts/s,
  );
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

test('retorna slots da convencao parameters.anemoi.slots', { skip: supportsTs ? false : 'requer Node >=24 (type-stripping nativo de .ts)' }, async () => {
  const stories = [
    {id: 'action-button--com-icone', name: 'Com Icone', importPath: './test/fixtures/sample.stories.ts'},
    {id: 'action-button--primary', name: 'Primary', importPath: './test/fixtures/sample.stories.ts'},
  ];
  const got = await resolveStoryArgs(PACKAGE_DIR, stories, {
    storiesRoot: path.join(PACKAGE_DIR, 'test', 'fixtures'),
  });
  assert.deepEqual(got['action-button--com-icone'].slots, {icon: {icon: 'add'}});
  assert.deepEqual(got['action-button--com-icone'].args, {label: 'Baixar', variant: 'primary', disabled: false});
  assert.deepEqual(got['action-button--primary'].slots, {});
});

test('rejeita slot que nao e string nem {icon: string}', { skip: supportsTs ? false : 'requer Node >=24 (type-stripping nativo de .ts)' }, async () => {
  const stories = [
    {id: 'action-button--slot-invalido', name: 'Slot Invalido', importPath: './test/fixtures/sample.stories.ts'},
  ];
  await assert.rejects(
    resolveStoryArgs(PACKAGE_DIR, stories, {
      storiesRoot: path.join(PACKAGE_DIR, 'test', 'fixtures'),
    }),
    /slot "icon" invalido/i,
  );
});
