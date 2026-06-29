const fs = require('node:fs');
const path = require('node:path');
const {
  parseArgs,
  buildMatrix,
  countCells,
  serveStatic,
  captureCells,
  writeDiff,
  writeManifest,
  writeSummary,
  renderHtml,
  runDoctor,
  assertNoOrphanStash,
  ensureWorkingTreeDiff,
  pushStash,
  popStash,
} = require('@gol-smiles/ds-evidence-core');
const {readIndexJson, filterStoriesForComponent, buildStorybook} = require('./storybook');
const {storybookHost, BRAND_GLOBALS, VIEWPORT_WIDTHS} = require('./host');

const DEFAULT_BRANDS = ['gol', 'smiles', 'smiles-club'];
const DEFAULT_VIEWPORTS = ['xs', 'sm', 'md', 'lg', 'xl'];

function assertKnownBrands(brands) {
  for (const brand of brands) {
    if (!(brand in BRAND_GLOBALS)) {
      throw new Error(
        `Brand desconhecida: "${brand}". Use uma de: ${Object.keys(BRAND_GLOBALS).join(', ')}.`,
      );
    }
  }
}

function splitList(value, fallback) {
  if (!value || value === true) return fallback;
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

function parseArgPairs(value) {
  // "inverse:true;onBrand:true" => {inverse:true, onBrand:true}
  if (!value || value === true) return {};
  const out = {};
  for (const pair of value.split(';')) {
    const [k, v] = pair.split(':');
    if (!k) continue;
    out[k.trim()] = v === 'true' ? true : v === 'false' ? false : v;
  }
  return out;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, {recursive: true, force: true});
  } catch (e) {
    // best-effort: nao falha a execucao por causa de limpeza
  }
}

function resolveStories(indexDir, component, storiesArg) {
  const index = readIndexJson(indexDir);
  const all = filterStoriesForComponent(index, component);
  if (all.length === 0) {
    throw new Error(
      `Nenhuma story encontrada para o componente "${component}" no index.json. Confira o nome (snake_flat) e se ha .stories no src/components/${component}/.`,
    );
  }
  if (!storiesArg || storiesArg === true) return all;
  const wanted = new Set(splitList(storiesArg, []));
  return all.filter(s => wanted.has(s.id));
}

async function captureMatrix(cells, indexDir, destDir) {
  const server = await serveStatic(indexDir);
  try {
    return await captureCells(cells, storybookHost, server.url, destDir, {
      onProgress: (n, total, rel) => console.log(`  [${n}/${total}] ${rel}`),
    });
  } finally {
    await server.close();
  }
}

// O web sempre captura web components (framework 'wc'). O core agora exige
// `frameworks`/`themes`/`viewportWidths` explicitos; `modes` (CLI antigo) vira
// `themes` (default light quando vazio) e o map de larguras vem do storybookHost.
function buildWebMatrix({stories, brands, viewports, modes, args}) {
  assertKnownBrands(brands);
  return buildMatrix({
    frameworks: ['wc'],
    stories,
    brands,
    themes: modes.length ? modes : ['light'],
    viewports,
    viewportWidths: VIEWPORT_WIDTHS,
    args,
  });
}

async function runCurrentState(args) {
  const repo = path.resolve(args.repo);
  const component = args.component;
  const card = args.card || 'NO-CARD';
  const runDir = path.join(repo, 'outputs/ds-evidence-web', card, component, timestamp());
  fs.mkdirSync(runDir, {recursive: true});

  const buildDir = path.join(runDir, '.storybook-static');
  try {
    console.log('Buildando Storybook (estado atual)...');
    buildStorybook(repo, buildDir, {logPath: path.join(runDir, 'storybook-build.log')});

    const stories = resolveStories(buildDir, component, args.stories);
    const brands = splitList(args.brands, DEFAULT_BRANDS);
    const viewports = splitList(args.viewports, DEFAULT_VIEWPORTS);
    const modes = splitList(args.modes, []);
    const argPairs = parseArgPairs(args.args);

    const cells = buildWebMatrix({stories, brands, viewports, modes, args: argPairs});
    console.log(`Capturando ${cells.length} prints...`);
    const captured = await captureMatrix(cells, buildDir, runDir);

    finalize(runDir, {
      card, component, mode: 'current',
      axes: {brands, stories: stories.map(s => s.name), viewports, themes: modes.length ? modes : ['light'], args: argPairs},
      cellCount: cells.length,
      captures: captured.map(c => ({
        brand: c.brand, storyName: c.storyName, viewport: c.viewport, mode: c.theme,
        path: c.relPath,
      })),
    });
  } finally {
    cleanupDir(buildDir);
  }
}

async function runBeforeAfter(args) {
  const repo = path.resolve(args.repo);
  const component = args.component;
  const card = args.card || 'NO-CARD';
  const runDir = path.join(repo, 'outputs/ds-evidence-web', card, component, timestamp());
  fs.mkdirSync(runDir, {recursive: true});

  assertNoOrphanStash(repo);
  ensureWorkingTreeDiff(repo);

  const afterBuild = path.join(runDir, '.storybook-static-after');
  const beforeBuild = path.join(runDir, '.storybook-static-before');

  try {
    console.log('Buildando Storybook (after = working tree)...');
    buildStorybook(repo, afterBuild, {logPath: path.join(runDir, 'storybook-after.log')});

    let stash;
    try {
      stash = pushStash(repo, card, component);
      console.log('Buildando Storybook (before = HEAD)...');
      buildStorybook(repo, beforeBuild, {logPath: path.join(runDir, 'storybook-before.log')});
    } finally {
      popStash(stash);
    }

    const stories = resolveStories(afterBuild, component, args.stories);
    const brands = splitList(args.brands, DEFAULT_BRANDS);
    const viewports = splitList(args.viewports, DEFAULT_VIEWPORTS);
    const modes = splitList(args.modes, []);
    const argPairs = parseArgPairs(args.args);

    const cells = buildWebMatrix({stories, brands, viewports, modes, args: argPairs});
    console.log(`Capturando ${cells.length} prints (after)...`);
    const afterCaps = await captureMatrix(cells, afterBuild, path.join(runDir, 'after'));
    console.log(`Capturando ${cells.length} prints (before)...`);
    const beforeCaps = await captureMatrix(cells, beforeBuild, path.join(runDir, 'before'));

    const captures = afterCaps.map((after, i) => {
      const before = beforeCaps[i];
      const diffRel = path.join('diff', after.relPath);
      const diffAbs = path.join(runDir, diffRel);
      fs.mkdirSync(path.dirname(diffAbs), {recursive: true});
      const {mismatch} = writeDiff(
        path.join(runDir, 'before', before.relPath),
        path.join(runDir, 'after', after.relPath),
        diffAbs,
      );
      return {
        brand: after.brand, storyName: after.storyName, viewport: after.viewport, mode: after.theme,
        beforePath: path.join('before', before.relPath),
        afterPath: path.join('after', after.relPath),
        diffPath: diffRel,
        mismatch,
      };
    });

    finalize(runDir, {
      card, component, mode: 'before-after',
      axes: {brands, stories: stories.map(s => s.name), viewports, themes: modes.length ? modes : ['light'], args: argPairs},
      cellCount: cells.length,
      captures,
    });
  } finally {
    cleanupDir(afterBuild);
    cleanupDir(beforeBuild);
  }
}

function finalize(runDir, partial) {
  const manifest = {...partial, generatedAt: new Date().toISOString(), runDir};
  writeManifest(runDir, manifest);
  writeSummary(runDir, manifest);
  fs.writeFileSync(path.join(runDir, 'index.html'), renderHtml(manifest));
  console.log(`\nEvidencias geradas em:\n${runDir}`);
  console.log('Arquivos: index.html, manifest.json, summary.md');
}

function runListStories(args) {
  // Exige um build existente (--index-dir) OU builda rapido.
  const repo = path.resolve(args.repo);
  const tmp = path.join(repo, 'outputs/ds-evidence-web', '_list', timestamp());
  fs.mkdirSync(tmp, {recursive: true});
  try {
    buildStorybook(repo, tmp, {logPath: path.join(tmp, 'build.log')});
    const stories = resolveStories(tmp, args.component, undefined);
    for (const s of stories) {
      console.log(`${s.id} | ${s.title} | ${s.name}`);
    }
  } finally {
    cleanupDir(tmp);
  }
}

async function runCli(argv, cwd = process.cwd()) {
  const args = parseArgs(argv);

  if (!args.repo) {
    args.repo = cwd;
  }

  if (args.doctor) {
    runDoctor(path.resolve(args.repo), {beforeAfter: Boolean(args['before-after'])});
    return;
  }

  if (args['list-stories']) {
    runListStories(args);
    return;
  }

  if (!args.component) {
    throw new Error('Faltou --component <snake_flat>.');
  }

  if (args['before-after']) {
    await runBeforeAfter(args);
    return;
  }

  await runCurrentState(args);
}

module.exports = {runCli, countCells};
