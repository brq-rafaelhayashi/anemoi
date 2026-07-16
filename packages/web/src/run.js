'use strict';
// CLI orquestrador do Anemoi Web (WC/React/Angular).
// Uso: anemoi-web --component tgr-button [opções]

const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

const {
  buildMatrix,
  serveStatic,
  assertSafePathSegment,
} = require('@gol-smiles/anemoi-core');

const {VIEWPORT_WIDTHS} = require('./brands');
const {readIndexJson, filterStoriesForComponent} = require('./stories');
const {capturePipeline} = require('./pipeline');
const {resolveStoryArgs} = require('./storyArgs');
const {runDoctor, assertCaptureReady} = require('./doctor');
const {runTangerinaBuilds} = require('./tangerina');
const {writeFailureManifest} = require('./failure');
const {collectProvenance} = require('./provenance');
const {makeWcHost} = require('./hosts/wc');
const {makeReactHost} = require('./hosts/react');
const {makeAngularHost} = require('./hosts/angular');

// Mapa de framework → factory
const HOST_FACTORIES = {
  wc: () => makeWcHost(),
  react: repo => makeReactHost(repo),
  angular: repo => makeAngularHost(repo),
};

// Garante que o storybook estático (wc) seja buildado para obter index.json,
// mesmo que 'wc' não esteja nos frameworks solicitados.
async function ensureStorybookIndex(wcHost, repo, sbDir, {logPath} = {}) {
  if (!fs.existsSync(path.join(sbDir, 'index.json'))) {
    console.log('⬛ Buildando Storybook para obter index.json…');
    const built = (await wcHost.build(repo, sbDir, {logPath})) || sbDir;
    return wcHost.indexDir ? wcHost.indexDir(built) : built;
  }
  return wcHost.indexDir(sbDir);
}

function createRunDir(repo, card, component, {
  now = new Date(),
  nonce = randomUUID().slice(0, 8),
} = {}) {
  const safeCard = assertSafePathSegment(card, 'card');
  const safeComponent = assertSafePathSegment(component, 'component');
  const safeNonce = assertSafePathSegment(nonce, 'nonce');
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return path.join(repo, 'outputs', 'anemoi-web', safeCard, safeComponent, `${timestamp}-${safeNonce}`);
}

function prepareCapture(repo, {
  skipBuild = false,
  logDir,
  runBuilds = runTangerinaBuilds,
  assertReady = assertCaptureReady,
} = {}) {
  runBuilds(repo, {skipBuild, logDir});
  return assertReady(repo);
}

// Codigo de saida do gate de paridade: 1 apenas quando --fail-on-diff esta
// ligado e a paridade divergiu. Erros de execucao saem com 2 via bin (throw).
function resolveExitCode(manifest, {failOnDiff = false} = {}) {
  return failOnDiff && manifest.status === 'failed' ? 1 : 0;
}

async function runCurrentState(args, cwd) {

  // --doctor
  if (args.doctor) {
    const repo = args.repo || cwd;
    runDoctor(repo);
    return;
  }

  // Exige --component
  if (!args.component) {
    console.error('Erro: informe --component <nome> (ex.: tgr-button).');
    process.exit(1);
  }

  // Rejeita --before-after
  if (args['before-after']) {
    console.error('Erro: before/after ainda nao implementado. Use o modo estado-atual (padrão).');
    process.exit(1);
  }

  const repo = args.repo || cwd;
  const component = args.component;
  const card = args.card || 'sem-card';

  // Defaults
  const frameworks = (args.frameworks || 'wc,react,angular').split(',').map(f => f.trim());
  if (!frameworks.includes('wc') && (frameworks.includes('react') || frameworks.includes('angular'))) {
    console.log('ℹ️  Incluindo "wc" nos frameworks: o baseline WC é necessário para o diff de paridade.');
    frameworks.unshift('wc');
  }
  const themes = (args.themes || 'light,dark').split(',').map(t => t.trim());
  const viewports = (args.viewports || 'sm,lg').split(',').map(v => v.trim());
  const brands = (args.brands || 'gol').split(',').map(b => b.trim());
  const storiesFilter = args.stories ? args.stories.split(',').map(s => s.trim()) : null;

  // Timestamp do run
  const runDir = createRunDir(repo, card, component);
  fs.mkdirSync(runDir, {recursive: true});

  let stage = 'tangerina-builds';
  try {
    prepareCapture(repo, {
      skipBuild: Boolean(args['skip-build']),
      logDir: path.join(runDir, 'logs', 'tangerina'),
    });

    console.log(`\nAnemoi Web — estado atual`);
    console.log(`Componente: ${component} | Card: ${card}`);
    console.log(`Frameworks: ${frameworks.join(', ')} | Brands: ${brands.join(', ')} | Themes: ${themes.join(', ')} | Viewports: ${viewports.join(', ')}`);
    console.log(`RunDir: ${runDir}\n`);

    // Builda Storybook WC para obter index.json (necessário para listar stories)
    stage = 'storybook-build';
    const wcHost = makeWcHost();
    const sbDir = path.join(runDir, 'build', 'wc');
    const indexDir = await ensureStorybookIndex(wcHost, repo, sbDir, {
      logPath: path.join(runDir, 'logs', 'storybook-build.log'),
    });
    const index = readIndexJson(indexDir);

    // Filtra stories do componente
    let stories = filterStoriesForComponent(index, component, {throwIfEmpty: true});
    if (storiesFilter) {
      stories = stories.filter(s => storiesFilter.includes(s.name));
      if (stories.length === 0) {
        throw new Error(`Nenhuma story correspondente ao filtro --stories "${args.stories}".`);
      }
    }
    for (const story of stories) {
      assertSafePathSegment(story.name, `story ${story.id}`);
    }

    // --list-stories
    if (args['list-stories']) {
      console.log(`Stories disponíveis para "${component}":`);
      for (const s of stories) console.log(`  - ${s.name} (${s.id})`);
      return;
    }

    console.log(`Stories encontradas: ${stories.map(s => s.name).join(', ')}`);

    // Resolve args de cada story via CSF (fonte única = type-stripping Node 24)
    stage = 'story-args';
    const argsById = await resolveStoryArgs(repo, stories);

    // Captura + paridade + galeria via pipeline compartilhado
    stage = 'capture';
    for (const framework of frameworks) {
      if (!HOST_FACTORIES[framework]) {
        throw new Error(`Framework desconhecido: "${framework}". Use wc, react ou angular.`);
      }
    }

    const cells = buildMatrix({
      frameworks,
      stories,
      brands,
      themes,
      viewports,
      viewportWidths: VIEWPORT_WIDTHS,
    }).map(c => ({
      ...c,
      component,
      // WC: sem args na URL (usa storyId nativo do Storybook, evita coercao de tipos)
      // React/Angular: cell.args passado como JSON na URL (resolvido pelo CLI)
      args: c.framework === 'wc' ? {} : (argsById[c.storyId] || {}),
    }));

    const acquireHost = async (framework) => {
      const host = HOST_FACTORIES[framework](repo);
      let served;
      if (framework === 'wc') {
        served = indexDir; // Storybook ja buildado para obter o index.json
      } else {
        const buildDir = path.join(runDir, 'build', host.framework);
        console.log(`\n⬛ Buildando harness ${host.framework}…`);
        served = host.build(repo, buildDir, {
          logPath: path.join(runDir, 'logs', `${host.framework}-harness-build.log`),
        }) || buildDir;
      }
      console.log(`⬛ Servindo ${framework} de: ${served}`);
      const server = await serveStatic(served);
      console.log(`⬛ Capturando ${cells.filter(c => c.framework === framework).length} célula(s) para ${framework}…`);
      return {host, url: server.url, release: () => server.close()};
    };

    const {manifest, captures} = await capturePipeline({
      cells,
      acquireHost,
      runDir,
      statusFromParity: true,
      manifestMeta: {
        tool: 'Anemoi Web',
        card,
        component,
        mode: 'current',
        provenance: collectProvenance({repo}),
        axes: {
          frameworks,
          stories: stories.map(s => s.name),
          themes,
          viewports,
          brands,
        },
      },
      onStage: (s) => {
        stage = s;
        if (s === 'parity') console.log('\n⬛ Computando paridade…');
      },
      onProgress: ({index, total, relPath}) => {
        process.stdout.write(`  [${index}/${total}] ${relPath}\n`);
      },
    });

    if (manifest.status === 'failed') {
      console.log(`\n❌ Paridade divergente — ${captures.length} prints em: ${runDir}`);
    } else {
      console.log(`\n✅ Concluído! ${captures.length} prints em: ${runDir}`);
    }
    console.log(`   Galeria: ${path.join(runDir, 'index.html')}`);
    const exitCode = resolveExitCode(manifest, {failOnDiff: Boolean(args['fail-on-diff'])});
    if (exitCode !== 0) process.exitCode = exitCode;
  } catch (error) {
    try {
      writeFailureManifest(runDir, {stage, card, component}, error);
    } catch (_manifestError) {
      // Ignorado: gravar o manifesto de falha e best-effort e nunca pode mascarar o erro original.
    }
    throw error;
  }
}

module.exports = {createRunDir, prepareCapture, resolveExitCode, runCurrentState};
