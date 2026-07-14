'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {runLogged} = require('./process');

const BUILD_SCRIPTS = [
  'build:tokens',
  'build:assets',
  'build:fonts',
  'build:components',
  'build:react',
  'build:angular',
];

function readPackage(repoPath) {
  const packagePath = path.join(repoPath, 'package.json');
  if (!fs.existsSync(packagePath)) throw new Error(`package.json nao encontrado em ${repoPath}.`);
  return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
}

function validateTangerinaRepo(repoPath) {
  const pkg = readPackage(repoPath);
  if (pkg.name !== 'tangerina-web-core') {
    throw new Error(`Repositorio invalido: esperado tangerina-web-core, encontrado ${pkg.name || '(sem nome)'}.`);
  }
  const missing = BUILD_SCRIPTS.filter(name => !pkg.scripts?.[name]);
  if (missing.length) throw new Error(`Scripts obrigatorios ausentes: ${missing.join(', ')}.`);
  return pkg;
}

function runTangerinaBuilds(repoPath, {skipBuild = false, logDir, run = runLogged} = {}) {
  validateTangerinaRepo(repoPath);
  if (skipBuild) return;
  for (const script of BUILD_SCRIPTS) {
    run('pnpm', [script], {
      cwd: repoPath,
      logPath: path.join(logDir, `${script.replace(':', '-')}.log`),
      echo: true,
    });
  }
}

module.exports = {BUILD_SCRIPTS, validateTangerinaRepo, runTangerinaBuilds};
