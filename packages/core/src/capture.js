const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {runAxeAudit, captureAriaSnapshot} = require('./a11y');

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
  const storyId = assertSafePathSegment(cell.storyId, 'storyId');
  const viewport = assertSafePathSegment(cell.viewport, 'viewport');
  const theme = assertSafePathSegment(cell.theme, 'theme');
  return path.join(framework, brand, storyId, viewport, `${theme}.png`);
}

// Coleta axe + snapshot ARIA na mesma page da captura, gravando os artefatos
// irmaos do png (<theme>.a11y.json e <theme>.aria.yaml). Nunca lanca: falha na
// coleta vira {error} — o screenshot ja gravado permanece valido e nenhum
// artefato parcial fica em disco.
async function collectCellA11y(page, selector, destDir, pngRelPath) {
  const base = pngRelPath.replace(/\.png$/, '');
  const relPath = `${base}.a11y.json`;
  const ariaRelPath = `${base}.aria.yaml`;
  try {
    const audit = await runAxeAudit(page, selector);
    const ariaSnapshot = await captureAriaSnapshot(page, selector);
    fs.writeFileSync(path.join(destDir, relPath), JSON.stringify(audit, null, 2) + '\n');
    fs.writeFileSync(
      path.join(destDir, ariaRelPath),
      ariaSnapshot.endsWith('\n') ? ariaSnapshot : ariaSnapshot + '\n',
    );
    return {relPath, ariaRelPath, ruleset: audit.ruleset, violations: audit.violations, ariaSnapshot};
  } catch (error) {
    // throw de string produz message undefined; throw de null quebraria dentro
    // do catch — normaliza para uma string sempre presente.
    return {error: String(error?.message ?? error)};
  }
}

// host: { urlFor(cell, baseUrl), selectorFor(cell), verify?(page, cell) }
async function captureCells(cells, host, baseUrl, destDir, {onProgress, browserType = chromium, collectA11y = true} = {}) {
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
        await page.locator(host.selectorFor(cell)).screenshot({
          path: outPath,
          animations: 'disabled',
        });
        const result = {...cell, relPath};
        if (collectA11y) {
          result.a11y = await collectCellA11y(page, host.selectorFor(cell), destDir, relPath);
        }
        results.push(result);
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
