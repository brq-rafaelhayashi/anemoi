'use strict';
// Resolve args por storyId importando as CSF (.stories.ts) — Node 24 faz type-stripping nativo.
// stories: [{id,name,importPath}] (importPath relativo ao repo, ex.: ./packages/.../tgr-button.stories.ts)

const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const {storyNameFromExport, toId} = require('@storybook/csf');

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

function resolveStorySource(repo, importPath, storiesRoot) {
  const root = path.resolve(storiesRoot);
  const candidate = path.resolve(repo, importPath);
  const lexicalRelative = path.relative(root, candidate);
  if (lexicalRelative.startsWith('..') || path.isAbsolute(lexicalRelative)) {
    throw new Error(`Story importPath fora da raiz de stories permitida: ${importPath}.`);
  }

  const realRoot = fs.realpathSync(root);
  const realCandidate = fs.realpathSync(candidate);
  const realRelative = path.relative(realRoot, realCandidate);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(`Story importPath fora da raiz de stories permitida: ${importPath}.`);
  }
  return realCandidate;
}

async function resolveStoryArgs(repo, stories, {
  storiesRoot = path.join(repo, 'packages', 'components'),
} = {}) {
  const byPath = new Map(); // abs path -> módulo
  const out = {};

  for (const s of stories) {
    const abs = resolveStorySource(repo, s.importPath, storiesRoot);
    if (!byPath.has(abs)) byPath.set(abs, await import(pathToFileURL(abs).href));
    const mod = byPath.get(abs);
    const meta = mod.default || {};
    // O Storybook humaniza exports camelCase antes de gerar o storyId.
    // Ex.: FullWidth -> "Full Width" -> action-button--full-width.
    let storyExport;
    for (const [exp, val] of Object.entries(mod)) {
      if (exp === 'default') continue;
      if (toId(meta.title, storyNameFromExport(exp)) === s.id) {
        storyExport = val;
        break;
      }
    }
    if (!storyExport) {
      throw new Error(`Story "${s.name}" (${s.id}) nao encontrou export em ${s.importPath}.`);
    }
    const storyArgs = storyExport.args || {};
    const mergedArgs = {...(meta.args || {}), ...storyArgs};
    assertSerializableArgs(mergedArgs, {storyName: s.name, sourcePath: s.importPath});
    out[s.id] = mergedArgs;
  }

  return out;
}

module.exports = {resolveStoryArgs, assertSerializableArgs, resolveStorySource};
