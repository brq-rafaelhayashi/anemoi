const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

// Coleta os checks de pre-flight (puro o suficiente para testar). So reporta.
function collectChecks(repoPath, {beforeAfter} = {}) {
  const checks = [];
  const exists = rel => fs.existsSync(path.join(repoPath, rel));

  checks.push({
    id: 'repo',
    label: 'Repo web resolvivel',
    ok: exists('package.json'),
    detail: repoPath,
  });

  checks.push({
    id: 'storybook',
    label: 'Storybook configurado (.storybook + script build:storybook)',
    ok: exists('.storybook') && hasBuildScript(repoPath),
    detail: '.storybook/ e package.json#scripts["build:storybook"]',
  });

  checks.push({
    id: 'node_modules',
    label: 'node_modules instalado no repo web',
    ok: exists('node_modules'),
    detail: 'rode `yarn` no repo web se faltar',
  });

  const gitPresent = exists('.git');
  checks.push({
    id: 'git',
    label: beforeAfter
      ? '.git presente (exigido no modo before/after)'
      : '.git presente (dispensavel no modo estado atual)',
    ok: beforeAfter ? gitPresent : true,
    detail: gitPresent ? 'ok' : 'sem .git/ — before/after indisponivel',
  });

  checks.push({
    id: 'playwright',
    label: 'Browser chromium do Playwright instalado',
    ok: playwrightChromiumInstalled(),
    detail: 'rode `npx playwright install chromium` no motor se faltar',
  });

  return checks;
}

function hasBuildScript(repoPath) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(repoPath, 'package.json'), 'utf8'),
    );
    return Boolean(pkg.scripts && pkg.scripts['build:storybook']);
  } catch (e) {
    return false;
  }
}

function playwrightChromiumInstalled() {
  const result = childProcess.spawnSync(
    'node',
    ['-e', "const {chromium}=require('playwright'); process.stdout.write(require('node:fs').existsSync(chromium.executablePath())?'1':'0')"],
    {cwd: __dirname, encoding: 'utf8'},
  );
  return result.stdout === '1';
}

function runDoctor(repoPath, options) {
  const checks = collectChecks(repoPath, options);
  console.log('Doctor — anemoi-web\n');
  for (const c of checks) {
    console.log(`${c.ok ? '✅' : '⚠️ '} ${c.label}\n   ${c.detail}`);
  }
  const failed = checks.filter(c => !c.ok);
  console.log(
    failed.length === 0
      ? '\nTudo certo para capturar.'
      : `\n${failed.length} item(ns) a resolver antes de capturar.`,
  );
  return checks;
}

module.exports = {collectChecks, runDoctor};
