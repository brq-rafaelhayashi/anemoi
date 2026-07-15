'use strict';
// Pool de harnesses do motor proprio do Anemoi (react/angular).
//
// O `verifyPanel` do Koba dispara paridade renderizando o COMPONENTE ISOLADO
// pelos harnesses do anemoi-web — nao fotografando a UI viva do Koba. Cada
// harness (vite build p/ react, ng build p/ angular) e agnostico de componente:
// le `?c=<tag>&args=<JSON>&slots=<JSON>` da URL. Logo, buildamos UMA vez por
// (framework, dsRepo), mantemos o server estatico vivo e so re-fotografamos nos
// runs seguintes. Invalida por mtime dos artefatos do DS: se o `dist/` mudou, o
// harness buildado esta stale e e reconstruido.
//
// O build usa spawnSync (bloqueante). A fila do servico roda 1 job por vez, entao
// o build serializa naturalmente; o cliente do Koba tolera ate 3min de polling.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {serveStatic: defaultServeStatic} = require('@gol-smiles/anemoi-core');
const {makeReactHost} = require('@gol-smiles/anemoi-web/src/hosts/react');
const {makeAngularHost} = require('@gol-smiles/anemoi-web/src/hosts/angular');
const {assertCaptureReady} = require('@gol-smiles/anemoi-web/src/doctor');

const DEFAULT_HOST_FACTORIES = {react: makeReactHost, angular: makeAngularHost};

// Artefatos-sentinela do DS: se algum for mais novo que o build do harness,
// o harness bundlou uma versao antiga do DS e precisa ser reconstruido.
const DS_SENTINELS = [
  'packages/components/dist/components/index.js',
  'packages/components-react/dist/index.mjs',
  'packages/components-angular/dist/index.d.ts',
  'packages/tokens/dist/tokens.css',
  'packages/fonts/dist/fonts.css',
];

function latestSentinelMtime(dsRepo) {
  let latest = 0;
  for (const rel of DS_SENTINELS) {
    try {
      const mtime = fs.statSync(path.join(dsRepo, rel)).mtimeMs;
      if (mtime > latest) latest = mtime;
    } catch {
      // Ausente → o doctor (assertReady) trata na hora do build; aqui ignoramos.
    }
  }
  return latest;
}

function repoHash(dsRepo) {
  return createHash('sha256').update(dsRepo).digest('hex').slice(0, 12);
}

function createHarnessPool({
  cacheRoot = path.join(os.tmpdir(), 'anemoi-harness'),
  serveStatic = defaultServeStatic,
  hostFactories = DEFAULT_HOST_FACTORIES,
  assertReady = assertCaptureReady,
  sentinelMtime = latestSentinelMtime,
  now = () => Date.now(),
  onLog = () => {},
} = {}) {
  // key `${framework}:${dsRepo}` → {host, server, builtAt}
  const entries = new Map();

  async function build(framework, dsRepo) {
    const factory = hostFactories[framework];
    if (!factory) {
      throw new Error(`Sem harness para o framework "${framework}". Use react ou angular.`);
    }
    // Falha clara se o DS nao estiver buildado (evita erro criptico do vite/ng build).
    assertReady(dsRepo);

    const host = factory(dsRepo);
    const buildDir = path.join(cacheRoot, `${framework}-${repoHash(dsRepo)}`);
    fs.rmSync(buildDir, {recursive: true, force: true});
    fs.mkdirSync(buildDir, {recursive: true});

    onLog(`buildando harness ${framework}…`);
    const served = host.build(dsRepo, buildDir, {
      logPath: path.join(cacheRoot, `${framework}-${repoHash(dsRepo)}.build.log`),
    }) || buildDir;

    const server = await serveStatic(served);
    return {host, server, builtAt: now()};
  }

  return {
    // Retorna {host, url} de um harness buildado+servido, buildando na 1a vez
    // e reusando depois. Reconstroi se o dist/ do DS mudou desde o build.
    async acquire(framework, dsRepo) {
      const key = `${framework}:${dsRepo}`;
      const existing = entries.get(key);
      if (existing && sentinelMtime(dsRepo) <= existing.builtAt) {
        return {host: existing.host, url: existing.server.url};
      }
      if (existing) {
        await existing.server.close();
        entries.delete(key);
      }
      const fresh = await build(framework, dsRepo);
      entries.set(key, fresh);
      return {host: fresh.host, url: fresh.server.url};
    },

    // Fecha todos os servers vivos (chamado no shutdown do servico).
    async closeAll() {
      for (const {server} of entries.values()) {
        await server.close();
      }
      entries.clear();
    },
  };
}

module.exports = {createHarnessPool, DS_SENTINELS};
