'use strict';
// Doctor — checks de pre-flight para anemoi-web.
// Verifica que o repo tangerina-web-core está configurado e buildado corretamente.

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {BUILD_SCRIPTS} = require('./tangerina');

const PNPM_ACTION = 'Instale/ative pnpm >=9 e confirme com `pnpm --version` antes de executar os builds';

function pnpmCheck(detail, ok = false) {
  return {
    id: 'pnpm',
    label: 'pnpm runtime >=9 (`pnpm --version`)',
    ok,
    detail,
  };
}

function checkPnpmRuntime(repoPath, {spawnSync = childProcess.spawnSync} = {}) {
  let result;
  try {
    result = spawnSync('pnpm', ['--version'], {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: 'pipe',
      shell: false,
    });
  } catch (error) {
    return pnpmCheck(
      `Não foi possível consultar a versão efetiva do pnpm no consumidor ${repoPath} com `
      + `\`pnpm --version\`: ${error.message}. ${PNPM_ACTION}.`,
    );
  }

  if (result.error || result.signal || result.status !== 0) {
    const detail = result.error
      ? result.error.message
      : result.signal
        ? `processo encerrado por ${result.signal}`
        : `exit ${result.status}`;
    return pnpmCheck(
      `Não foi possível consultar a versão efetiva do pnpm no consumidor ${repoPath} com `
      + `\`pnpm --version\`: ${detail}. ${PNPM_ACTION}.`,
    );
  }

  const version = String(result.stdout || '').trim();
  const match = version.match(/^(\d+)(?:\.\d+){1,2}(?:[-+][0-9A-Za-z.-]+)?$/);
  if (!match) {
    return pnpmCheck(
      `Não foi possível interpretar a versão retornada por \`pnpm --version\` no consumidor `
      + `${repoPath}: ${version || '(vazia)'}. ${PNPM_ACTION}.`,
    );
  }

  const major = Number(match[1]);
  if (major < 9) {
    return pnpmCheck(
      `A versão efetiva do pnpm no consumidor é ${version}; o processo precisa ser pnpm >=9. `
      + `${PNPM_ACTION}.`,
    );
  }

  return pnpmCheck(`A versão efetiva do pnpm no consumidor é ${version}; runtime pnpm >=9 confirmado.`, true);
}

// Coleta checks puros (sem efeitos — seguro para testar).
function collectChecks(
  repoPath,
  {
    playwrightInstalled = playwrightChromiumInstalled,
    pnpmRuntime = checkPnpmRuntime,
  } = {},
) {
  const checks = [];
  const exists = rel => fs.existsSync(path.join(repoPath, rel));
  const pkg = readPackage(repoPath);

  checks.push({
    id: 'repo',
    label: 'Repositorio Tangerina identificado (package.json#name)',
    ok: pkg?.name === 'tangerina-web-core',
    detail: `${repoPath}/package.json#name = tangerina-web-core`,
  });

  for (const script of BUILD_SCRIPTS) {
    checks.push({
      id: `script-${script.replace(':', '-')}`,
      label: `Script Tangerina configurado (${script})`,
      ok: Boolean(pkg?.scripts?.[script]),
      detail: `package.json#scripts["${script}"]`,
    });
  }

  checks.push(pnpmRuntime(repoPath));

  checks.push({
    id: 'storybook',
    label: 'Storybook configurado (.storybook + script build-storybook)',
    ok: exists('.storybook') && Boolean(pkg?.scripts?.['build-storybook']),
    detail: '.storybook/ e package.json#scripts["build-storybook"]',
  });

  checks.push({
    id: 'react-pkg',
    label: 'Wrapper React buildado (packages/components-react/dist/index.mjs)',
    ok: exists('packages/components-react/dist/index.mjs'),
    detail: 'rode pnpm build:react',
  });

  checks.push({
    id: 'angular-pkg',
    label: 'Wrapper Angular buildado (packages/components-angular/dist/index.d.ts)',
    ok: exists('packages/components-angular/dist/index.d.ts'),
    detail: 'rode pnpm build:angular',
  });

  checks.push({
    id: 'components',
    label: 'Web Components buildados (packages/components/dist/components/index.js)',
    ok: exists('packages/components/dist/components/index.js'),
    detail: 'rode pnpm build:components',
  });

  checks.push({
    id: 'playwright',
    label: 'Browser Chromium do Playwright instalado',
    ok: playwrightInstalled(),
    detail: 'rode `npx playwright install chromium` no motor se faltar',
  });

  return checks;
}

function assertCaptureReady(repoPath, {collect = collectChecks} = {}) {
  const checks = collect(repoPath);
  const failed = checks.filter(check => !check.ok);
  if (failed.length === 0) return checks;

  const details = failed.map(check => `- ${check.label}: ${check.detail}`).join('\n');
  const error = new Error(
    `Pre-flight bloqueou a captura. Corrija os itens abaixo antes de Storybook/captura:\n${details}\n\n` +
    'Execute anemoi-web --doctor para ver o diagnostico completo.'
  );
  error.checks = checks;
  error.failedChecks = failed;
  throw error;
}

function readPackage(repoPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoPath, 'package.json'), 'utf8'));
  } catch (e) {
    return null;
  }
}

function playwrightChromiumInstalled() {
  // playwright é dependência do @gol-smiles/anemoi-core (usado por captureCells),
  // não do Web — resolve a partir do dir do core para detectar o chromium do mesmo jeito.
  let cwd = __dirname;
  try {
    cwd = path.dirname(require.resolve('@gol-smiles/anemoi-core/package.json'));
  } catch (e) {
    // mantém __dirname como fallback
  }
  const result = childProcess.spawnSync(
    'node',
    ['-e', "const {chromium}=require('playwright'); process.stdout.write(require('node:fs').existsSync(chromium.executablePath())?'1':'0')"],
    {cwd, encoding: 'utf8'}
  );
  return result.stdout === '1';
}

function runDoctor(repoPath, {collect = collectChecks, write = console.log} = {}) {
  const checks = collect(repoPath);
  write('Doctor — anemoi-web\n');
  for (const c of checks) {
    write(`${c.ok ? '✅' : '⚠️ '} ${c.label}\n   ${c.detail}`);
  }
  const failed = checks.filter(c => !c.ok);
  write(
    failed.length === 0
      ? '\nTudo certo para capturar.'
      : `\n${failed.length} item(ns) a resolver antes de capturar.`
  );
  return checks;
}

module.exports = {collectChecks, assertCaptureReady, runDoctor, checkPnpmRuntime};
