const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

function assertSafePathSegment(value, label = 'segment') {
  const segment = String(value ?? '');
  if (
    segment.length === 0 ||
    segment === '.' ||
    segment === '..' ||
    /[\\/\u0000-\u001f\u007f]/.test(segment)
  ) {
    throw new Error(`${label}: segmento de caminho invalido: ${JSON.stringify(segment)}.`);
  }
  return segment;
}

// <framework>/<brand>/<story>/<viewport>/<theme>.png
function cellRelPath(cell) {
  const framework = assertSafePathSegment(cell.framework, 'framework');
  const brand = assertSafePathSegment(cell.brand, 'brand');
  const storyName = assertSafePathSegment(cell.storyName, 'storyName');
  const viewport = assertSafePathSegment(cell.viewport, 'viewport');
  const theme = assertSafePathSegment(cell.theme, 'theme');
  return path.join(framework, brand, storyName, viewport, `${theme}.png`);
}

// host: { urlFor(cell, baseUrl), selectorFor(cell), verify?(page, cell) }
async function captureCells(cells, host, baseUrl, destDir, {onProgress, browserType = chromium} = {}) {
  const browser = await browserType.launch();
  let context;
  const results = [];
  try {
    context = await browser.newContext({deviceScaleFactor: 2});
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
    if (context) await context.close();
    await browser.close();
  }
  return results;
}

module.exports = {captureCells, cellRelPath, assertSafePathSegment};
