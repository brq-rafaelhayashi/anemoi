'use strict';
// angularHost — harness Angular standalone (Angular 20)
//
// Monta o wrapper Angular do componente Stencil por querystring:
//   index.html?c=tgr-button&story=...&brand=gol&theme=light&viewport=sm&args=%7B%7D
//
// Estratégia de resolução de @gol-smiles/* (gerada em build-time pelo host):
//   1. tsconfig.paths.generated.json — paths absolutos para os dists do workspace DS
//   2. src/styles.generated.css — @import absolutos de tokens.css e fonts.css
//   O angular.json referencia ambos (já versionado).
//
// O Angular application builder (Angular 17+/20) emite saída em <outDir>/browser/ por padrão.
// Configuramos outputPath.browser: '' no angular.json para achatar (index.html em <outDir>).

const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { VIEWPORT_WIDTHS } = require('../brands');

// Diretório do harness Angular (relativo a este arquivo)
const HARNESS = path.join(__dirname, '..', '..', 'harness', 'angular');

/**
 * Gera os arquivos dependentes de caminho absoluto antes de `ng build`.
 * @param {string} repo  - path absoluto do repositório tangerina-web-core
 */
function generateFiles(repo) {
  // 1. tsconfig.paths.generated.json — resolvido pelo Angular application builder via tsconfig
  //
  // CRITICAL: @angular/core (e rxjs) devem resolver para o mesmo node_modules do harness.
  // O pacote @gol-smiles/tangerina-angular tem seu próprio node_modules com @angular/core@20.3.24
  // que difere da versão do harness (20.3.25). Dois módulos Angular = contexto de injeção separado
  // = NG0203 em qualquer createComponent. Forçar resolução única via paths.
  const harnessNodeModules = path.join(HARNESS, 'node_modules');
  const tsconfigPaths = {
    compilerOptions: {
      paths: {
        // Angular packages — força resolução pelo node_modules DO HARNESS (versão única)
        '@angular/core': [path.join(harnessNodeModules, '@angular/core')],
        '@angular/common': [path.join(harnessNodeModules, '@angular/common')],
        '@angular/compiler': [path.join(harnessNodeModules, '@angular/compiler')],
        '@angular/platform-browser': [path.join(harnessNodeModules, '@angular/platform-browser')],
        '@angular/animations': [path.join(harnessNodeModules, '@angular/animations')],
        'rxjs': [path.join(harnessNodeModules, 'rxjs')],
        'rxjs/*': [path.join(harnessNodeModules, 'rxjs', '*')],
        'zone.js': [path.join(harnessNodeModules, 'zone.js')],
        'tslib': [path.join(harnessNodeModules, 'tslib')],
        // DS packages — path absoluto para os dists do workspace tangerina-web-core
        '@gol-smiles/tangerina-angular': [
          path.join(repo, 'packages/components-angular/dist'),
        ],
        '@gol-smiles/tangerina-web-core/components/*': [
          path.join(repo, 'packages/components/dist/components/*'),
        ],
        '@gol-smiles/tangerina-web-core/dist/components': [
          path.join(repo, 'packages/components/dist/components'),
        ],
        '@gol-smiles/tangerina-web-core/dist/*': [
          path.join(repo, 'packages/components/dist/*'),
        ],
      },
    },
  };
  fs.writeFileSync(
    path.join(HARNESS, 'tsconfig.paths.generated.json'),
    JSON.stringify(tsconfigPaths, null, 2),
    'utf8'
  );

  // 2. src/styles.generated.css — carrega tokens e fonts via @import absoluto
  //    O esbuild do Angular resolve @import de caminhos absolutos de sistema de arquivos.
  const tokensPath = path.join(repo, 'packages/tokens/dist/tokens.css');
  const fontsPath = path.join(repo, 'packages/fonts/dist/fonts.css');
  const stylesCss = `@import "${tokensPath}";\n@import "${fontsPath}";\n`;
  fs.writeFileSync(
    path.join(HARNESS, 'src', 'styles.generated.css'),
    stylesCss,
    'utf8'
  );
}

/**
 * Builda o harness Angular via `ng build`.
 * @param {string} repo   - path absoluto do repositório tangerina-web-core
 * @param {string} outDir - diretório de saída (deve conter index.html depois do build)
 * @returns {string}      - path do diretório que contém index.html
 */
function build(repo, outDir) {
  // Gera arquivos com caminhos absolutos antes do build
  generateFiles(repo);

  const result = spawnSync(
    'npx',
    ['ng', 'build', '--output-path', outDir],
    {
      cwd: HARNESS,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      shell: false,
    }
  );

  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.toString() : '';
    const stdout = result.stdout ? result.stdout.toString() : '';
    throw new Error(
      `ng build do harness Angular falhou (exit ${result.status}).\n` +
        `stdout:\n${stdout}\n` +
        `stderr:\n${stderr}`
    );
  }

  // angular.json configura outputPath.browser: '' → index.html fica em outDir diretamente.
  // Verifica se index.html está em outDir (achatar) ou em outDir/browser/ (padrão Angular).
  const indexDirect = path.join(outDir, 'index.html');
  const indexBrowser = path.join(outDir, 'browser', 'index.html');
  if (fs.existsSync(indexDirect)) {
    return outDir;
  } else if (fs.existsSync(indexBrowser)) {
    return path.join(outDir, 'browser');
  } else {
    throw new Error(
      `ng build concluiu mas index.html não encontrado em "${outDir}" nem em "${path.join(outDir, 'browser')}".`
    );
  }
}

/**
 * Monta a URL do harness para uma cell.
 * Args são passados como JSON encodado na querystring (não há glob de stories no Angular).
 */
function urlFor(cell, baseUrl) {
  const c = encodeURIComponent(cell.component);
  const story = encodeURIComponent(cell.storyId ?? '');
  const brand = encodeURIComponent(cell.brand ?? 'gol');
  const theme = encodeURIComponent(cell.theme ?? 'light');
  const viewport = encodeURIComponent(cell.viewport ?? 'sm');
  const args = encodeURIComponent(JSON.stringify(cell.args || {}));
  return `${baseUrl}/index.html?c=${c}&story=${story}&brand=${brand}&theme=${theme}&viewport=${viewport}&args=${args}`;
}

/** Seletor da raiz montada pelo Angular. */
function selectorFor(_cell) {
  return '#evidence-root';
}

/**
 * Aguarda o Angular montar um custom element com shadowRoot dentro de #evidence-root.
 * Timeout de 20s — Angular boota mais devagar que React (compilação JIT/zone.js).
 */
async function verify(page, _cell) {
  await page.waitForFunction(
    () => {
      const root = document.querySelector('#evidence-root');
      if (!root) return false;
      const ce = [...root.querySelectorAll('*')].find(e =>
        e.tagName.includes('-')
      );
      return ce ? ce.shadowRoot !== null : false;
    },
    { timeout: 20000 }
  );
}

/**
 * Factory que retorna o objeto host compatível com captureCells do core.
 * @param {string} repo - path absoluto do repositório tangerina-web-core
 */
function makeAngularHost(repo) {
  return {
    framework: 'angular',
    viewportWidths: VIEWPORT_WIDTHS,
    build: (r, outDir) => build(r ?? repo, outDir),
    urlFor,
    selectorFor,
    verify,
  };
}

module.exports = { makeAngularHost };
