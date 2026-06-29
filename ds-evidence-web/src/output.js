const fs = require('node:fs');
const path = require('node:path');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function writeManifest(runDir, manifest) {
  const manifestPath = path.join(runDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifestPath;
}

function writeSummary(runDir, manifest) {
  const summaryPath = path.join(runDir, 'summary.md');
  const {axes} = manifest;
  const lines = [
    `# Anemoi Web - ${manifest.component}`,
    '',
    `- Card: ${manifest.card}`,
    `- Modo: ${manifest.mode}`,
    `- Gerado em: ${manifest.generatedAt}`,
    `- Brands: ${axes.brands.join(', ')}`,
    `- Stories: ${axes.stories.join(', ')}`,
    `- Viewports: ${axes.viewports.join(', ')}`,
    `- Modes: ${axes.modes.length ? axes.modes.join(', ') : '(default)'}`,
    `- Prints: ${manifest.cellCount}`,
    '',
    '## Saida',
    '',
    '- Manifest: manifest.json',
    '- Galeria: index.html',
    '',
    '> Anexe os prints manualmente no card. O motor nunca faz upload no Jira.',
    '',
  ];
  fs.writeFileSync(summaryPath, lines.join('\n'));
  return summaryPath;
}

function imageFigure(src, caption) {
  return `
      <figure>
        <figcaption>${escapeHtml(caption)}</figcaption>
        <img src="${escapeHtml(src)}" alt="${escapeHtml(caption)}"
             onerror="this.style.display='none';this.nextElementSibling.style.display='block';" />
        <div class="missing" style="display:none;">Imagem ausente:<br><code>${escapeHtml(src)}</code></div>
      </figure>`;
}

function renderCapture(manifest, capture) {
  const label = `${capture.brand} · ${capture.storyName} · ${capture.viewport}${capture.mode ? ' · ' + capture.mode : ''}`;
  if (manifest.mode === 'before-after') {
    return `
    <section class="cell">
      <h3>${escapeHtml(label)} <span class="mismatch">(${capture.mismatch} px diff)</span></h3>
      <div class="threeup">
        ${imageFigure(capture.beforePath, 'before')}
        ${imageFigure(capture.afterPath, 'after')}
        ${imageFigure(capture.diffPath, 'diff')}
      </div>
    </section>`;
  }
  return `
    <section class="cell">
      <h3>${escapeHtml(label)}</h3>
      <div class="single">
        ${imageFigure(capture.path, label)}
      </div>
    </section>`;
}

function renderHtml(manifest) {
  const cells = manifest.captures.map(c => renderCapture(manifest, c)).join('\n');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Anemoi Web — ${escapeHtml(manifest.component)} (${escapeHtml(manifest.card)})</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; background: #fafafa; color: #211e1c; }
  header { margin-bottom: 24px; }
  .badge { display:inline-block; background:#211e1c; color:#fff; padding:2px 8px; border-radius:4px; font-size:12px; }
  .cell { background:#fff; border:1px solid #eee; border-radius:8px; padding:16px; margin-bottom:16px; }
  .threeup { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; }
  .single img, .threeup img { max-width:100%; border:1px solid #eee; background:#fff; }
  figcaption { font-size:12px; color:#666; margin-bottom:4px; }
  .mismatch { font-size:12px; color:#b00; font-weight:normal; }
  .missing { font-size:12px; color:#b00; }
</style>
</head>
<body>
<header>
  <span class="badge">Anemoi Web · ${escapeHtml(manifest.card)}</span>
  <h1>${escapeHtml(manifest.component)}</h1>
  <p>Modo: ${escapeHtml(manifest.mode)} · Prints: ${manifest.cellCount} · Gerado em ${escapeHtml(manifest.generatedAt)}</p>
  <p>Brands: ${escapeHtml(manifest.axes.brands.join(', '))} · Viewports: ${escapeHtml(manifest.axes.viewports.join(', '))}</p>
</header>
${cells}
</body>
</html>
`;
}

module.exports = {escapeHtml, writeManifest, writeSummary, renderHtml};
