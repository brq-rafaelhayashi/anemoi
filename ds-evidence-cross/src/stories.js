const fs = require('node:fs');
const path = require('node:path');

function readIndexJson(outputDir) {
  const indexPath = path.join(outputDir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`index.json nao encontrado em ${outputDir}. O build do Storybook gerou a saida?`);
  }
  return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
}

// component = nome do dir (ex.: 'tgr-button'). Casa pelo importPath conter /<component>/.
function filterStoriesForComponent(index, component, {throwIfEmpty = false} = {}) {
  const needle = `/${component}/`;
  const stories = Object.values(index.entries || {})
    .filter(e => e.type === 'story' && e.importPath && e.importPath.includes(needle))
    .map(e => ({id: e.id, name: e.name, title: e.title, importPath: e.importPath}));
  if (throwIfEmpty && stories.length === 0) {
    throw new Error(`Nenhuma story encontrada para "${component}" no index.json. Confira o dir src/components/${component}/ e o .stories.`);
  }
  return stories;
}

module.exports = {readIndexJson, filterStoriesForComponent};
