'use strict';
// Resolve args por storyId importando as CSF (.stories.ts) — Node 24 faz type-stripping nativo.
// stories: [{id,name,importPath}] (importPath relativo ao repo, ex.: ./packages/.../tgr-button.stories.ts)

const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {toId} = require('@storybook/csf');

async function resolveStoryArgs(repo, stories) {
  const byPath = new Map(); // abs path -> módulo
  const out = {};

  for (const s of stories) {
    const abs = path.resolve(repo, s.importPath);
    if (!byPath.has(abs)) byPath.set(abs, await import(pathToFileURL(abs).href));
    const mod = byPath.get(abs);
    const meta = mod.default || {};
    // Encontra o export cujo toId(meta.title, exportName) === s.id (ou casa por s.name)
    let storyArgs = {};
    for (const [exp, val] of Object.entries(mod)) {
      if (exp === 'default') continue;
      if (toId(meta.title, exp) === s.id || exp === s.name) {
        storyArgs = (val && val.args) || {};
        break;
      }
    }
    out[s.id] = {...(meta.args || {}), ...storyArgs};
  }

  return out;
}

module.exports = {resolveStoryArgs};
