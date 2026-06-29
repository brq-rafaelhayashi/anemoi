const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {buildIframeUrl} = require('./url');

// Caminho relativo (dentro do runDir/phaseDir) de uma celula.
// <brand>/<story>/<viewport>[/<mode>].png
function cellRelPath(cell) {
  const parts = [cell.brand, cell.storyName, cell.viewport];
  const fileName = cell.mode ? `${cell.mode}.png` : `${cell.viewport}.png`;
  if (cell.mode) {
    return path.join(...parts, fileName);
  }
  // sem mode: o viewport ja e o ultimo nivel; o arquivo e <viewport>.png
  return path.join(cell.brand, cell.storyName, `${cell.viewport}.png`);
}

// Captura todas as celulas servidas em baseUrl, gravando em <destDir>/<cellRelPath>.
// Retorna [{...cell, relPath, brandApplied}] para o manifest.
async function captureCells(cells, baseUrl, destDir, {onProgress} = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({deviceScaleFactor: 2});
  const results = [];

  try {
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      const relPath = cellRelPath(cell);
      const outPath = path.join(destDir, relPath);
      fs.mkdirSync(path.dirname(outPath), {recursive: true});

      const page = await context.newPage();
      try {
        await page.setViewportSize({width: cell.width, height: 900});

        const url = buildIframeUrl(baseUrl, {
          storyId: cell.storyId,
          brandGlobal: cell.brandGlobal,
          mode: cell.mode,
          args: cell.args,
        });
        await page.goto(url, {waitUntil: 'networkidle', timeout: 30000});

        // Verifica que o tema foi aplicado no <body> (data-tgr-brand).
        const expectedBrand = cell.brandGlobal.split('|')[0];
        const brandApplied = await page.getAttribute('body', 'data-tgr-brand');
        if (brandApplied !== expectedBrand) {
          console.warn(
            `[aviso] tema nao aplicado em ${relPath}: esperado data-tgr-brand="${expectedBrand}", obtido "${brandApplied}". Verifique o formato da URL de globals.`,
          );
        }

        const root = page.locator('#storybook-root');
        await root.screenshot({path: outPath});

        results.push({...cell, relPath, brandApplied});
        if (onProgress) onProgress(i + 1, cells.length, relPath);
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return results;
}

module.exports = {captureCells, cellRelPath};
