'use strict';
// Doctor — checks de pre-flight para anemoi-web.
// Verifica que o repo tangerina-web-core está configurado e buildado corretamente.

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

// Coleta checks puros (sem efeitos — seguro para testar).
function collectChecks(repoPath) {
  const checks = [];
  const exists = rel => fs.existsSync(path.join(repoPath, rel));

  checks.push({
    id: 'repo',
    label: 'Repo web resolvível',
    ok: exists('package.json'),
    detail: repoPath,
  });

  checks.push({
    id: 'storybook',
    label: 'Storybook configurado (.storybook + script build-storybook)',
    ok: exists('.storybook') && hasBuildStorybookScript(repoPath),
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
    ok: playwrightChromiumInstalled(),
    detail: 'rode `npx playwright install chromium` no motor se faltar',
  });

  return checks;
}

function hasBuildStorybookScript(repoPath) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(repoPath, 'package.json'), 'utf8')
    );
    return Boolean(pkg.scripts && pkg.scripts['build-storybook']);
  } catch (e) {
    return false;
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

function runDoctor(repoPath) {
  const checks = collectChecks(repoPath);
  console.log('Doctor — anemoi-web\n');
  for (const c of checks) {
    console.log(`${c.ok ? '✅' : '⚠️ '} ${c.label}\n   ${c.detail}`);
  }
  const failed = checks.filter(c => !c.ok);
  console.log(
    failed.length === 0
      ? '\nTudo certo para capturar.'
      : `\n${failed.length} item(ns) a resolver antes de capturar.`
  );
  return checks;
}

module.exports = {collectChecks, runDoctor};
