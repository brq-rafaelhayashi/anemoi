const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {runAxeAudit, captureAriaSnapshot} = require('./a11y');
const {
  assertSafePathSegment,
  assertSafeRelativePath,
  resolveContainedPath,
} = require('./path');

function cellRelPath(cell) {
  const segments = [];
  if (cell.browser) segments.push(assertSafePathSegment(cell.browser, 'browser'));
  segments.push(
    assertSafePathSegment(cell.framework, 'framework'),
    assertSafePathSegment(cell.brand, 'brand'),
    assertSafePathSegment(cell.storyId || cell.sceneId, cell.storyId ? 'storyId' : 'sceneId'),
    assertSafePathSegment(cell.viewport, 'viewport'),
    `${assertSafePathSegment(cell.theme, 'theme')}.png`,
  );
  return path.join(...segments);
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
    fs.writeFileSync(
      resolveContainedPath(destDir, relPath, 'a11y artifact path'),
      JSON.stringify(audit, null, 2) + '\n',
    );
    fs.writeFileSync(
      resolveContainedPath(destDir, ariaRelPath, 'aria artifact path'),
      ariaSnapshot.endsWith('\n') ? ariaSnapshot : ariaSnapshot + '\n',
    );
    return {
      relPath,
      ariaRelPath,
      ruleset: audit.ruleset,
      violations: audit.violations,
      needsReview: audit.needsReview,
      ariaSnapshot,
    };
  } catch (error) {
    // throw de string produz message undefined; throw de null quebraria dentro
    // do catch — normaliza para uma string sempre presente.
    return {error: String(error?.message ?? error)};
  }
}

async function captureCellOnPage(
  page,
  cell,
  host,
  baseUrl,
  destDir,
  {collectA11y = true} = {},
) {
  const relPath = cellRelPath(cell);
  const outPath = resolveContainedPath(destDir, relPath, 'capture path');
  fs.mkdirSync(path.dirname(outPath), {recursive: true});
  await page.setViewportSize({width: cell.width, height: 900});
  await page.goto(host.urlFor(cell, baseUrl), {waitUntil: 'networkidle', timeout: 30000});
  if (host.verify) await host.verify(page, cell);
  const selector = host.selectorFor(cell);
  await page.locator(selector).screenshot({path: outPath, animations: 'disabled'});
  const result = {...cell, storyId: cell.storyId || cell.sceneId, relPath};
  if (collectA11y) {
    result.a11y = await collectCellA11y(page, selector, destDir, relPath);
  }
  return result;
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
      const page = await context.newPage();
      try {
        const result = await captureCellOnPage(page, cell, host, baseUrl, destDir, {collectA11y});
        results.push(result);
        if (onProgress) onProgress(i + 1, cells.length, result.relPath);
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

module.exports = {
  captureCells,
  captureCellOnPage,
  cellRelPath,
  assertSafePathSegment,
  assertSafeRelativePath,
  resolveContainedPath,
};
