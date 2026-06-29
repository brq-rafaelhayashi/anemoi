const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

// Le o index.json gerado pelo `storybook build` (SB9 emite na raiz do output).
function readIndexJson(outputDir) {
  const indexPath = path.join(outputDir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `index.json nao encontrado em ${outputDir}. O build do Storybook gerou a saida?`,
    );
  }
  return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
}

// Retorna as stories (type === 'story') cujo importPath contem o dir do componente.
// component e snake_flat (ex.: 'country_flag').
function filterStoriesForComponent(index, component) {
  const needle = `/${component}/`;
  return Object.values(index.entries || {})
    .filter(entry => entry.type === 'story')
    .filter(entry => entry.importPath && entry.importPath.includes(needle))
    .map(entry => ({id: entry.id, name: entry.name, title: entry.title}));
}

// Builda o Storybook do repo web num output-dir dedicado.
// Roda `yarn build:storybook --output-dir <outputDir>` com cwd = repo web.
function buildStorybook(repoPath, outputDir, {logPath} = {}) {
  const result = childProcess.spawnSync(
    'yarn',
    ['build:storybook', '--output-dir', outputDir],
    {cwd: repoPath, encoding: 'utf8', stdio: 'pipe'},
  );

  if (logPath) {
    fs.writeFileSync(logPath, (result.stdout || '') + (result.stderr || ''));
  }

  if (result.status !== 0) {
    throw new Error(
      `Build do Storybook falhou (status ${result.status}). Veja o log: ${logPath || '(stdout acima)'}\n${result.stderr || ''}`,
    );
  }

  return outputDir;
}

module.exports = {
  readIndexJson,
  filterStoriesForComponent,
  buildStorybook,
};
