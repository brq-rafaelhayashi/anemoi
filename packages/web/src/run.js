'use strict';
// CLI orquestrador do Anemoi Web (WC/React/Angular).
// Uso: anemoi-web --component tgr-button [opções]

const fs = require('node:fs');
const path = require('node:path');

const {
  buildMatrix,
  serveStatic,
  captureCells,
  writeManifest,
  writeSummary,
  renderHtml,
} = require('@gol-smiles/anemoi-core');

const {VIEWPORT_WIDTHS} = require('./brands');
const {readIndexJson, filterStoriesForComponent} = require('./stories');
const {groupByCell, computeParity} = require('./parity');
const {resolveStoryArgs} = require('./storyArgs');
const {runDoctor, assertCaptureReady} = require('./doctor');
const {runTangerinaBuilds} = require('./tangerina');
const {writeFailureManifest} = require('./failure');
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
async function ensureStorybookIndex(wcHost, repo, sbDir) {
  if (!fs.existsSync(path.join(sbDir, 'index.json'))) {
    console.log('⬛ Buildando Storybook para obter index.json…');
    const built = (await wcHost.build(repo, sbDir)) || sbDir;
    return wcHost.indexDir ? wcHost.indexDir(built) : built;
  }
  return wcHost.indexDir(sbDir);
}

// Captura o estado atual para um único framework.
async function captureFramework(host, repo, cells, runDir) {
  const buildDir = path.join(runDir, 'build', host.framework);
  console.log(`\n⬛ Buildando harness ${host.framework}…`);
  const served = host.build(repo, buildDir) || buildDir;
  console.log(`⬛ Servindo ${host.framework} de: ${served}`);
  const server = await serveStatic(served);
  try {
    console.log(`⬛ Capturando ${cells.length} célula(s) para ${host.framework}…`);
    const captures = await captureCells(cells, host, server.url, runDir, {
      onProgress: (i, total, relPath) => {
        process.stdout.write(`  [${i}/${total}] ${relPath}\n`);
      },
    });
    return captures;
  } finally {
    await server.close();
  }
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
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runDir = path.join(repo, 'outputs', 'anemoi-web', card, component, ts);
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
    const indexDir = await ensureStorybookIndex(wcHost, repo, sbDir);
    const index = readIndexJson(indexDir);

    // Filtra stories do componente
    let stories = filterStoriesForComponent(index, component, {throwIfEmpty: true});
    if (storiesFilter) {
      stories = stories.filter(s => storiesFilter.includes(s.name));
      if (stories.length === 0) {
        throw new Error(`Nenhuma story correspondente ao filtro --stories "${args.stories}".`);
      }
    }

    // --list-stories
    if (args['list-stories']) {
      console.log(`Stories disponíveis para "${component}":`);
      for (const s of stories) console.log(`  - ${s.name} (${s.id})`);
      return;
    }

    console.log(`Stories encontradas: ${stories.map(s => s.name).join(', ')}`);

    // Resolve args de cada story via CSF (fonte única = type-stripping Node 24)
    const argsById = await resolveStoryArgs(repo, stories);

    // Captura por framework
    stage = 'capture';
    const allCaptures = [];

    for (const framework of frameworks) {
      const factory = HOST_FACTORIES[framework];
      if (!factory) {
        throw new Error(`Framework desconhecido: "${framework}". Use wc, react ou angular.`);
      }
      const host = factory(repo);

      // Monta células injetando component e args por framework
      let cells = buildMatrix({
        frameworks: [framework],
        stories,
        brands,
        themes,
        viewports,
        viewportWidths: VIEWPORT_WIDTHS,
      });

      cells = cells.map(c => ({
        ...c,
        component,
        // WC: sem args na URL (usa storyId nativo do Storybook, evita coerção de tipos)
        // React: cell.args passado como JSON na URL (resolvido pelo CLI — mesma fonte do Angular)
        // Angular: cell.args é passado como JSON na URL
        args: c.framework === 'wc' ? {} : (argsById[c.storyId] || {}),
      }));

      // WC já foi buildado — reutiliza
      if (framework === 'wc') {
        const served = indexDir;
        const server = await serveStatic(served);
        try {
          console.log(`\n⬛ Capturando ${cells.length} célula(s) para wc…`);
          const caps = await captureCells(cells, host, server.url, runDir, {
            onProgress: (i, total, relPath) => {
              process.stdout.write(`  [${i}/${total}] ${relPath}\n`);
            },
          });
          allCaptures.push(...caps);
        } finally {
          await server.close();
        }
      } else {
        const caps = await captureFramework(host, repo, cells, runDir);
        allCaptures.push(...caps);
      }
    }

    // Paridade
    stage = 'parity';
    console.log('\n⬛ Computando paridade…');
    const groups = computeParity(groupByCell(allCaptures), runDir);

    // Manifesto
    stage = 'output';
    const manifest = {
      tool: 'Anemoi Web',
      status: 'passed',
      card,
      component,
      mode: 'current',
      layout: 'parity',
      axes: {
        frameworks,
        stories: stories.map(s => s.name),
        themes,
        viewports,
        brands,
      },
      cellCount: allCaptures.length,
      groups,
      generatedAt: new Date().toISOString(),
      runDir,
    };

    writeManifest(runDir, manifest);
    writeSummary(runDir, manifest);
    fs.writeFileSync(path.join(runDir, 'index.html'), renderHtml(manifest), 'utf8');

    console.log(`\n✅ Concluído! ${allCaptures.length} prints em: ${runDir}`);
    console.log(`   Galeria: ${path.join(runDir, 'index.html')}`);
  } catch (error) {
    writeFailureManifest(runDir, {stage, card, component}, error);
    throw error;
  }
}

module.exports = {prepareCapture, runCurrentState};
