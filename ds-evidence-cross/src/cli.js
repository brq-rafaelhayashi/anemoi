'use strict';
// CLI orquestrador do ds-evidence-cross — estado atual (WC/React/Angular).
// Uso: ds-evidence-cross --component tgr-button [opções]

const fs = require('node:fs');
const path = require('node:path');

const {
  parseArgs,
  buildMatrix,
  serveStatic,
  captureCells,
  writeManifest,
  writeSummary,
  renderHtml,
} = require('@gol-smiles/ds-evidence-core');

const {VIEWPORT_WIDTHS} = require('./brands');
const {readIndexJson, filterStoriesForComponent} = require('./stories');
const {groupByCell, computeParity} = require('./parity');
const {resolveStoryArgs} = require('./storyArgs');
const {runDoctor} = require('./doctor');
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

async function runCurrentState(argv, cwd) {
  const args = Array.isArray(argv) ? parseArgs(argv) : argv;

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
  const themes = (args.themes || 'light,dark').split(',').map(t => t.trim());
  const viewports = (args.viewports || 'sm,lg').split(',').map(v => v.trim());
  const brands = (args.brands || 'gol').split(',').map(b => b.trim());
  const storiesFilter = args.stories ? args.stories.split(',').map(s => s.trim()) : null;

  // Timestamp do run
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runDir = path.join(repo, 'outputs', 'ds-evidence-cross', card, component, ts);
  fs.mkdirSync(runDir, {recursive: true});

  console.log(`\nAnemoi Cross — estado atual`);
  console.log(`Componente: ${component} | Card: ${card}`);
  console.log(`Frameworks: ${frameworks.join(', ')} | Brands: ${brands.join(', ')} | Themes: ${themes.join(', ')} | Viewports: ${viewports.join(', ')}`);
  console.log(`RunDir: ${runDir}\n`);

  // Builda Storybook WC para obter index.json (necessário para listar stories)
  const wcHost = makeWcHost();
  const sbDir = path.join(runDir, 'build', 'wc');
  const indexDir = await ensureStorybookIndex(wcHost, repo, sbDir);
  const index = readIndexJson(indexDir);

  // Filtra stories do componente
  let stories = filterStoriesForComponent(index, component, {throwIfEmpty: true});
  if (storiesFilter) {
    stories = stories.filter(s => storiesFilter.includes(s.name));
    if (stories.length === 0) {
      console.error(`Nenhuma story correspondente ao filtro --stories "${args.stories}".`);
      process.exit(1);
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
  const allCaptures = [];

  for (const framework of frameworks) {
    const factory = HOST_FACTORIES[framework];
    if (!factory) {
      console.error(`Framework desconhecido: "${framework}". Use wc, react ou angular.`);
      process.exit(1);
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
      // React: args ignorados pelo urlFor (harness carrega próprios args)
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
  console.log('\n⬛ Computando paridade…');
  const groups = computeParity(groupByCell(allCaptures), runDir);

  // Manifesto
  const manifest = {
    tool: 'Anemoi Cross',
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
}

// Ponto de entrada da CLI — retorna a Promise para o chamador (bin) tratar erros.
function runCli(argv, cwd) {
  return runCurrentState(argv, cwd);
}

module.exports = {runCli, runCurrentState};

// Executa diretamente se for o módulo principal
if (require.main === module) {
  runCli(process.argv.slice(2), process.cwd()).catch(err => {
    console.error('Erro fatal:', err.message || err);
    process.exit(1);
  });
}
