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
  const tool = manifest.tool || 'Anemoi';
  const axes = manifest.axes || {};
  const joinAxis = (value) => (Array.isArray(value) && value.length ? value.join(', ') : '(default)');
  const lines = [
    `# ${tool} - ${manifest.component}`,
    '',
    `- Card: ${manifest.card}`,
    `- Modo: ${manifest.mode}`,
    `- Status: ${manifest.status || 'passed'}`,
    `- Gerado em: ${manifest.generatedAt}`,
    `- Brands: ${joinAxis(axes.brands)}`,
    `- Stories: ${joinAxis(axes.stories)}`,
    `- Viewports: ${joinAxis(axes.viewports)}`,
    `- Themes: ${joinAxis(axes.themes)}`,
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

function renderParityGroup(group) {
  const badges = (group.parity || []).map(p =>
    `<span class="parity ${p.mismatch === 0 ? 'ok' : 'diff'}">${escapeHtml(p.against)}: ${p.mismatch === 0 ? 'paridade OK' : p.mismatch + 'px'}</span>`
  ).join(' ');
  return `
    <section class="cell">
      <h3>${escapeHtml(group.label)} ${badges}</h3>
      <div class="threeup">
        ${imageFigure(group.wc, 'web component')}
        ${imageFigure(group.react, 'react')}
        ${imageFigure(group.angular, 'angular')}
      </div>
    </section>`;
}

function renderHtml(manifest) {
  const tool = manifest.tool || 'Anemoi';
  const body = (manifest.groups || []).map(renderParityGroup).join('\n');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(tool)} — ${escapeHtml(manifest.component)} (${escapeHtml(manifest.card)})</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; background: #fafafa; color: #211e1c; }
  .badge { display:inline-block; background:#211e1c; color:#fff; padding:2px 8px; border-radius:4px; font-size:12px; }
  .cell { background:#fff; border:1px solid #eee; border-radius:8px; padding:16px; margin-bottom:16px; }
  .threeup { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; }
  .single img, .threeup img { max-width:100%; border:1px solid #eee; background:#fff; }
  figcaption { font-size:12px; color:#666; margin-bottom:4px; }
  .parity { font-size:12px; font-weight:normal; padding:1px 6px; border-radius:4px; }
  .parity.ok { background:#e6f4ea; color:#137333; }
  .parity.diff { background:#fce8e6; color:#b00; }
  .mismatch { font-size:12px; color:#b00; font-weight:normal; }
  .missing { font-size:12px; color:#b00; }
</style>
</head>
<body>
<header>
  <span class="badge">${escapeHtml(tool)} · ${escapeHtml(manifest.card)}</span>
  <h1>${escapeHtml(manifest.component)}</h1>
  <p>Modo: ${escapeHtml(manifest.mode)} · Prints: ${manifest.cellCount} · Gerado em ${escapeHtml(manifest.generatedAt)}</p>
</header>
${body}
</body>
</html>
`;
}

module.exports = {escapeHtml, writeManifest, writeSummary, renderHtml};
