const fs = require('node:fs');
const path = require('node:path');

const CONFIG_FILE = '.anemoi.local.json';
const ALIAS_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function validateAlias(alias) {
  if (!ALIAS_PATTERN.test(String(alias || ''))) {
    throw new Error('Alias invalido. Use letras minusculas, numeros e hifens simples.');
  }
  return alias;
}

function configPath(rootDir) {
  return path.join(rootDir, CONFIG_FILE);
}

function readLocalConfig(rootDir) {
  const filePath = configPath(rootDir);
  if (!fs.existsSync(filePath)) return {repositories: {}};
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {...value, repositories: value.repositories || {}};
}

function configureRepository({rootDir, cwd, alias, repoPath, makeDefault = false}) {
  validateAlias(alias);
  if (!repoPath) throw new Error('Informe --repo <caminho>.');
  const absolutePath = path.resolve(cwd, repoPath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Repositorio nao encontrado: ${absolutePath}`);
  const config = readLocalConfig(rootDir);
  config.repositories[alias] = {path: absolutePath};
  if (!config.defaultRepository || makeDefault) config.defaultRepository = alias;
  fs.writeFileSync(configPath(rootDir), `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

function isPathLike(value) {
  return path.isAbsolute(value) || value.startsWith('.') || value.includes('/') || value.includes('\\');
}

function resolveRepository({rootDir, cwd, repoArg}) {
  const config = readLocalConfig(rootDir);
  if (repoArg && Object.hasOwn(config.repositories, repoArg)) {
    return path.resolve(config.repositories[repoArg].path);
  }
  if (repoArg && (isPathLike(repoArg) || fs.existsSync(path.resolve(cwd, repoArg)))) {
    return path.resolve(cwd, repoArg);
  }
  if (repoArg) {
    const aliases = Object.keys(config.repositories);
    throw new Error(`Alias desconhecido: ${repoArg}. Configurados: ${aliases.join(', ') || '(nenhum)'}.`);
  }
  if (config.defaultRepository && config.repositories[config.defaultRepository]) {
    return path.resolve(config.repositories[config.defaultRepository].path);
  }
  throw new Error('Repositorio nao configurado. Rode npm run web:configure -- --alias <alias> --repo <caminho>.');
}

module.exports = {
  CONFIG_FILE,
  validateAlias,
  readLocalConfig,
  configureRepository,
  resolveRepository,
};
