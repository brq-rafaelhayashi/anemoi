'use strict';
// Resolve args por storyId importando as CSF (.stories.ts) — Node 24 faz type-stripping nativo.
// stories: [{id,name,importPath}] (importPath relativo ao repo, ex.: ./packages/.../tgr-button.stories.ts)

const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {toId} = require('@storybook/csf');

function assertSerializableArgs(value, {storyName, sourcePath}) {
  const seen = new Set();

  function visit(current, propertyPath) {
    if (current === null || ['string', 'boolean'].includes(typeof current)) return;
    if (typeof current === 'number' && Number.isFinite(current)) return;
    if (['undefined', 'function', 'symbol', 'bigint'].includes(typeof current)) {
      throw new Error(`Story "${storyName}" (${sourcePath}) possui arg nao serializavel em ${propertyPath}.`);
    }
    if (typeof current !== 'object') {
      throw new Error(`Story "${storyName}" (${sourcePath}) possui arg invalido em ${propertyPath}.`);
    }
    if (seen.has(current)) {
      throw new Error(`Story "${storyName}" (${sourcePath}) possui referencia circular em ${propertyPath}.`);
    }
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${propertyPath}[${index}]`));
    } else {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error(`Story "${storyName}" (${sourcePath}) possui objeto nao serializavel em ${propertyPath}.`);
      }
      Object.entries(current).forEach(([key, item]) => visit(item, `${propertyPath}.${key}`));
    }
    seen.delete(current);
  }

  visit(value, 'args');
  return value;
}

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
    const mergedArgs = {...(meta.args || {}), ...storyArgs};
    assertSerializableArgs(mergedArgs, {storyName: s.name, sourcePath: s.importPath});
    out[s.id] = mergedArgs;
  }

  return out;
}

module.exports = {resolveStoryArgs, assertSerializableArgs};
