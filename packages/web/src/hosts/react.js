'use strict';
// reactHost — harness Vite (React 18 + wrappers @stencil/react-output-target)
//
// Monta o wrapper React do componente Stencil por querystring:
//   index.html?c=tgr-button&story=action-button--primary&brand=gol&theme=light&viewport=sm
//
// Aliases absolutos no vite.config.ts garantem que @gol-smiles/* resolva para o
// dist do workspace tangerina-web-core, mesmo o harness vivendo fora do workspace.

const path = require('node:path');
const {runLogged} = require('../process');
const { VIEWPORT_WIDTHS } = require('../brands');

// Diretório do harness React (relativo a este arquivo)
const HARNESS = path.join(__dirname, '..', '..', 'harness', 'react');

/**
 * Builda o harness Vite React.
 * @param {string} repo  - path absoluto do repositório tangerina-web-core
 * @param {string} outDir - diretório de saída (criado pelo Vite)
 */
function build(repo, outDir, {
  logPath = path.join(path.dirname(outDir), 'react-harness-build.log'),
  run = runLogged,
} = {}) {
  run(
    'npx',
    ['vite', 'build', '--outDir', outDir],
    {
      cwd: HARNESS,
      env: {
        ...process.env,
        DS_REPO: repo,
      },
      logPath,
      echo: true,
    }
  );
}

/**
 * Monta a URL do harness para uma cell.
 * Usa cell.component (injetado pelo CLI da Fase 4).
 */
function urlFor(cell, baseUrl) {
  const c = encodeURIComponent(cell.component);
  const story = encodeURIComponent(cell.storyId);
  const brand = encodeURIComponent(cell.brand ?? 'gol');
  const theme = encodeURIComponent(cell.theme ?? 'light');
  const viewport = encodeURIComponent(cell.viewport ?? 'sm');
  const args = encodeURIComponent(JSON.stringify(cell.args || {}));
  const slots = encodeURIComponent(JSON.stringify(cell.slots || {}));
  return `${baseUrl}/index.html?c=${c}&story=${story}&brand=${brand}&theme=${theme}&viewport=${viewport}&args=${args}&slots=${slots}`;
}

/** Seletor da raiz montada pelo React. */
function selectorFor(_cell) {
  return '#evidence-root';
}

/**
 * Aguarda o React montar pelo menos um filho em #evidence-root.
 * Timeout de 15 s para cubrir cold-start do Vite-built JS.
 */
async function verify(page, _cell) {
  await page.waitForSelector('#evidence-root > *', { timeout: 15000 });
}

/**
 * Factory que retorna o objeto host compatível com captureCells do core.
 * @param {string} repo - path absoluto do repositório tangerina-web-core
 */
function makeReactHost(repo, options = {}) {
  return {
    framework: 'react',
    viewportWidths: VIEWPORT_WIDTHS,
    build: (r, outDir, buildOptions = {}) => build(r ?? repo, outDir, {...options, ...buildOptions}),
    urlFor,
    selectorFor,
    verify,
  };
}

module.exports = { makeReactHost };
