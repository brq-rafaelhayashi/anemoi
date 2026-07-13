'use strict';
// wcHost — Storybook estático (Web Components / Stencil baseline)
//
// Formato de URL confirmado por spike (Storybook 8.6.18, tangerina-web-core):
//   iframe.html?id=<storyId>&globals=themes:<brand>;backgrounds.value:%23<hex>
//   - brand  : valor do global `themes` (gol|smiles|clube-smiles); "gol" = sem data-brand (default)
//   - dark   : backgrounds.value=%23211E1C  (%23 = '#' percent-encoded)
//   - light  : sem backgrounds.value (ou qualquer outra cor) → sem data-theme
//   - args   : &args=key:value;key2:value2  (mesmo encoding semicolon/colon)
//
// O decorator do preview.ts aplica:
//   themes:gol        → remove data-brand
//   themes:<outro>    → data-brand=<outro>
//   backgrounds.value:#211E1C → data-theme=dark
//   outro background  → remove data-theme
//
// Seletor de recorte: #storybook-root  (contém o custom element hidratado)

const { spawnSync } = require('node:child_process');
const { VIEWPORT_WIDTHS, THEME_ATTR, brandGlobal } = require('../brands');

// Cor de background dark (sem '#') usada pelo Storybook para acionar data-theme=dark.
const DARK_BG_HEX = '211E1C';

// Codifica um objeto de args no formato SB: key:value;key2:value2
function encodeArgs(args) {
  if (!args || typeof args !== 'object') return '';
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${encodeURIComponent(k)}:${encodeURIComponent(v)}`).join(';');
}

// Monta a URL do iframe para uma cell.
// Formato confirmado no spike: backgrounds.value=%23<hex> (percent-encoded '#')
function urlFor(cell, baseUrl) {
  const brand = brandGlobal(cell.brand);   // valida a brand
  const globals = [`themes:${brand}`];

  if (THEME_ATTR[cell.theme] === 'dark') {
    // '#' encoded como %23 — formato que o SB 8.6.18 deste repo aceita
    globals.push(`backgrounds.value:%23${DARK_BG_HEX}`);
  }

  let url = `${baseUrl}/iframe.html?id=${cell.storyId}&globals=${globals.join(';')}`;

  const argsStr = encodeArgs(cell.args);
  if (argsStr) {
    url += `&args=${argsStr}`;
  }

  return url;
}

function selectorFor(_cell) {
  return '#storybook-root';
}

// Aguarda hidratação do custom element referenciado pelo storyId.
// Estratégia: customElements.whenDefined('tgr-*') via page.evaluate,
// com fallback para checar shadowRoot no primeiro filho de #storybook-root.
async function verify(page, _cell) {
  const timeout = 10000;

  // Busca recursivamente o primeiro descendente custom element (tagName com '-')
  // dentro de #storybook-root e aguarda seu shadowRoot estar hidratado.
  // Cobre o caso em que a story é embrulhada em um elemento wrapper (ex.: decorator de div).
  await page.waitForFunction(
    () => {
      const root = document.querySelector('#storybook-root');
      if (!root) return false;
      const ce = [...root.querySelectorAll('*')].find(e => e.tagName.includes('-'));
      return ce ? ce.shadowRoot !== null : false;
    },
    { timeout }
  );
}

// Roda o build estático do Storybook do tangerina-web-core.
// repo    : path do repositório do DS (onde tem o package.json com "build-storybook")
// outDir  : diretório de saída (criado pelo Storybook)
function build(repo, outDir) {
  const result = spawnSync(
    'pnpm',
    ['build-storybook', '-o', outDir],
    {
      cwd: repo,
      stdio: 'inherit',
      env: { ...process.env },
      shell: false,
    }
  );
  if (result.status !== 0) {
    throw new Error(
      `build-storybook falhou (exit ${result.status}). ` +
      `Verifique o repo "${repo}" e tente: pnpm build-storybook -o ${outDir}`
    );
  }
}

// O Storybook emite index.json na raiz do output — indexDir retorna outDir.
function indexDir(outDir) {
  return outDir;
}

// Factory que retorna o objeto host compatível com captureCells do core.
function makeWcHost() {
  return {
    framework: 'wc',
    viewportWidths: VIEWPORT_WIDTHS,
    urlFor,
    selectorFor,
    verify,
    build,
    indexDir,
  };
}

module.exports = { makeWcHost };
