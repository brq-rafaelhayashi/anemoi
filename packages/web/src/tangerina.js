'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {runLogged} = require('./process');

const BUILD_SCRIPTS = [
  'build:tokens',
  'build:assets',
  'build:fonts',
  'build:assets-react',
  'build:assets-angular',
  'build:components',
  'build:react',
  'build:angular',
];

const PNPM_ACTION = 'Instale/ative pnpm >=9 e confirme com `pnpm --version` antes de executar os builds';

function probePnpmVersion({cwd, logPath, run = runLogged} = {}) {
  let result;
  try {
    result = run('pnpm', ['--version'], {
      cwd,
      logPath,
      echo: true,
    });
  } catch (error) {
    throw new Error(
      `Nao foi possivel consultar a versao runtime do pnpm com \`pnpm --version\`: ${error.message}. ${PNPM_ACTION}.`,
      {cause: error},
    );
  }

  if (result.error || result.signal || result.status !== 0) {
    const detail = result.error
      ? result.error.message
      : result.signal
        ? `processo encerrado por ${result.signal}`
        : `exit ${result.status}`;
    throw new Error(
      `Nao foi possivel consultar a versao runtime do pnpm com \`pnpm --version\`: ${detail}. ${PNPM_ACTION}.`
    );
  }

  const version = String(result.stdout || '').trim();
  if (!/^\d+(?:\.\d+){1,2}(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(
      `Nao foi possivel interpretar a versao runtime retornada por \`pnpm --version\`: ${version || '(vazia)'}. ${PNPM_ACTION}.`
    );
  }
  return version;
}

function validatePnpmRuntime({
  cwd,
  declared,
  logPath,
  run = runLogged,
  probe = probePnpmVersion,
} = {}) {
  let version;
  try {
    version = probe({cwd, logPath, run});
  } catch (error) {
    if (error.message.includes(PNPM_ACTION)) throw error;
    throw new Error(
      `Falha ao validar a versao runtime do pnpm: ${error.message}. ${PNPM_ACTION}.`,
      {cause: error},
    );
  }

  const major = Number(version.split('.')[0]);
  if (major < 9) {
    throw new Error(
      `Versao runtime do pnpm incompatível: ${version}; package.json#packageManager = ${declared || '(ausente)'}. ` +
      `O processo efetivo precisa ser pnpm >=9. ${PNPM_ACTION}.`,
    );
  }
  return {version, major};
}

function checkPnpmRequirement(pkg) {
  const declared = pkg?.packageManager;
  const match = typeof declared === 'string' && declared.match(/^pnpm@(\d+)(?:\.\d+){0,2}(?:\+.*)?$/);
  const major = match ? Number(match[1]) : null;
  const label = 'pnpm declaration >=9 (package.json#packageManager opcional)';

  if (declared === undefined) {
    return {
      id: 'pnpm-declaration',
      label,
      ok: true,
      detail: 'package.json#packageManager ausente; declaracao estrutural valida; confirme a versao efetiva com `pnpm --version` antes de build/Storybook',
    };
  }

  if (major !== null && major >= 9) {
    return {
      id: 'pnpm-declaration',
      label,
      ok: true,
      detail: `package.json#packageManager = ${declared}; declaracao estrutural valida; confirme a versao efetiva com \`pnpm --version\` antes de build/Storybook`,
    };
  }

  return {
    id: 'pnpm-declaration',
    label,
    ok: false,
    detail: `package.json#packageManager = ${declared}; declare pnpm@9 ou superior`,
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

function runTangerinaBuilds(repoPath, {
  skipBuild = false,
  logDir,
  run = runLogged,
} = {}) {
  const pkg = validateTangerinaRepo(repoPath);
  validatePnpmRuntime({
    cwd: repoPath,
    declared: pkg.packageManager,
    logPath: path.join(logDir, 'pnpm-version.log'),
    run,
  });
  if (skipBuild) return;
  for (const script of BUILD_SCRIPTS) {
    run('pnpm', [script], {
      cwd: repoPath,
      logPath: path.join(logDir, `${script.replace(':', '-')}.log`),
      echo: true,
    });
  }
}

module.exports = {
  BUILD_SCRIPTS,
  checkPnpmRequirement,
  probePnpmVersion,
  validatePnpmRuntime,
  validateTangerinaRepo,
  runTangerinaBuilds,
};
