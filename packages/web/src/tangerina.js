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

function checkPnpmRequirement(pkg) {
  const declared = pkg?.packageManager;
  const match = typeof declared === 'string' && declared.match(/^pnpm@(\d+)(?:\.\d+){0,2}(?:\+.*)?$/);
  const major = match ? Number(match[1]) : null;

  if (major !== null && major >= 9) {
    return {
      id: 'pnpm',
      label: 'pnpm >=9 declarado (package.json#packageManager)',
      ok: true,
      detail: `package.json#packageManager = ${declared}`,
    };
  }

  return {
    id: 'pnpm',
    label: 'pnpm >=9 declarado (package.json#packageManager)',
    ok: false,
    detail: declared
      ? `package.json#packageManager = ${declared}; declare pnpm@9 ou superior`
      : 'package.json#packageManager ausente; declare pnpm@9 ou superior',
  };
}

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
  const pnpm = checkPnpmRequirement(pkg);
  if (!pnpm.ok) throw new Error(`pnpm >=9 obrigatorio: ${pnpm.detail}.`);
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

module.exports = {BUILD_SCRIPTS, checkPnpmRequirement, validateTangerinaRepo, runTangerinaBuilds};
