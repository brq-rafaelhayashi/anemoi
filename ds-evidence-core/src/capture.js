const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

// <framework>/<brand>/<story>/<viewport>/<theme>.png
function cellRelPath(cell) {
  return path.join(cell.framework, cell.brand, cell.storyName, cell.viewport, `${cell.theme}.png`);
}

// host: { urlFor(cell, baseUrl), selectorFor(cell), verify?(page, cell) }
async function captureCells(cells, host, baseUrl, destDir, {onProgress} = {}) {
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
        await page.goto(host.urlFor(cell, baseUrl), {waitUntil: 'networkidle', timeout: 30000});
        if (host.verify) await host.verify(page, cell);
        await page.locator(host.selectorFor(cell)).screenshot({path: outPath});
        results.push({...cell, relPath});
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
