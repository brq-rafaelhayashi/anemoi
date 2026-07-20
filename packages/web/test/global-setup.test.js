const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/serverLifecycle.ts')).href);
}

const frameworks = ['wc', 'react', 'angular'];
const builds = {wc: '/build/wc', react: '/build/react', angular: '/build/angular'};

test('falha ao subir segundo servidor fecha o primeiro e preserva o erro original', async () => {
  const {startStaticHosts} = await subject();
  const closed = [];
  const startError = new Error('start react');

  await assert.rejects(
    startStaticHosts({
      frameworks,
      builds,
      hostsPath: '/run/hosts.json',
      serveStatic: async build => {
        if (build === builds.react) throw startError;
        return {url: 'http://wc', close: async () => closed.push('wc')};
      },
      writeHosts: () => assert.fail('hosts nao devem ser escritos'),
    }),
    error => error === startError,
  );

  assert.deepEqual(closed, ['wc']);
});

test('falha ao escrever hosts fecha todos os servidores adquiridos', async () => {
  const {startStaticHosts} = await subject();
  const closed = [];
  const writeError = new Error('write hosts');

  await assert.rejects(
    startStaticHosts({
      frameworks,
      builds,
      hostsPath: '/run/hosts.json',
      serveStatic: async build => ({
        url: `http://${path.basename(build)}`,
        close: async () => closed.push(path.basename(build)),
      }),
      writeHosts: () => { throw writeError; },
    }),
    error => error === writeError,
  );

  assert.deepEqual(closed.sort(), ['angular', 'react', 'wc']);
});

test('teardown tenta fechar todos e agrega falhas sincronas e assincronas', async () => {
  const {startStaticHosts} = await subject();
  const closed = [];
  const servers = {
    wc: {url: 'http://wc', close: () => { closed.push('wc'); throw new Error('close wc'); }},
    react: {url: 'http://react', close: async () => { closed.push('react'); throw new Error('close react'); }},
    angular: {url: 'http://angular', close: async () => { closed.push('angular'); }},
  };

  const teardown = await startStaticHosts({
    frameworks,
    builds,
    hostsPath: '/run/hosts.json',
    serveStatic: async build => servers[path.basename(build)],
    writeHosts: () => {},
  });

  await assert.rejects(teardown(), error => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors.map(item => item.message).sort(), ['close react', 'close wc']);
    return true;
  });
  assert.deepEqual(closed.sort(), ['angular', 'react', 'wc']);
});
