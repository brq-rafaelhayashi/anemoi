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

// Serializa dados para embutir com seguranca dentro de <script> (evita fechar a tag).
function embedJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

// Layout "matriz": uma linha por celula visual, uma coluna por framework, com
// filtros (story/tema/viewport), badges de paridade e lightbox navegavel por teclado.
function renderHtml(manifest) {
  const tool = manifest.tool || 'Anemoi';
  const axes = manifest.axes || {};
  const frameworks = (axes.frameworks && axes.frameworks.length)
    ? axes.frameworks
    : ['wc', 'react', 'angular'];
  const groups = manifest.groups || [];

  // Cada grupo expoe label ("brand · story · viewport · theme") + relPaths por framework + parity[].
  const cells = groups.map((g) => {
    const cell = {label: g.label, parity: g.parity || []};
    for (const fw of frameworks) cell[fw] = g[fw] || null;
    return cell;
  });

  const data = {
    tool,
    component: manifest.component,
    card: manifest.card,
    mode: manifest.mode,
    status: manifest.status || 'passed',
    generatedAt: manifest.generatedAt,
    cellCount: manifest.cellCount,
    parityLabel: manifest.parityLabel || 'Paridade vs wc',
    frameworks,
    cells,
  };

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(tool)} — ${escapeHtml(manifest.component)} (${escapeHtml(manifest.card)})</title>
<style>
  :root { --ink:#1a1a1a; --sub:#6b6b6b; --line:#e3e5e8; --bg:#fff; --soft:#f4f5f7; --accent:#e85d04; --ok:#177245; --okbg:#e7f4ed; --bad:#b02a1e; --badbg:#fbeae8; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,system-ui,'Segoe UI',sans-serif; background:var(--bg); color:var(--ink); }
  .masthead { padding:32px 28px 20px; border-bottom:1px solid var(--line); }
  .masthead .crumb { font-size:12px; color:var(--sub); letter-spacing:.08em; text-transform:uppercase; font-weight:600; }
  .masthead h1 { font-size:32px; margin:6px 0 0; font-weight:700; letter-spacing:-.02em; line-height:1.15; }
  .masthead h1 code { font-family:ui-monospace,'SF Mono','SFMono-Regular',Menlo,monospace; font-size:.92em; }
  .masthead h1 .sub { color:var(--sub); font-weight:600; }
  .masthead .summary { display:inline-block; margin-top:16px; font-size:12px; padding:5px 12px; border-radius:99px; font-weight:600; background:var(--soft); color:var(--sub); }
  .masthead .summary.ok { background:var(--okbg); color:var(--ok); }
  .masthead .summary.bad { background:var(--badbg); color:var(--bad); }
  .masthead .summary.chips { background:none; padding:0; display:flex; flex-wrap:wrap; gap:6px; }
  .schip { font-size:12px; font-weight:700; padding:5px 12px; border-radius:99px; border:0; background:var(--badbg); color:var(--bad); cursor:pointer; font-family:inherit; }
  .schip:hover { text-decoration:underline; }
  .filters { background:var(--bg); border-bottom:1px solid var(--line); padding:14px 28px; display:flex; flex-direction:column; gap:8px; }
  .frow { display:grid; grid-template-columns:78px 1fr; align-items:start; gap:12px; }
  .frow .lbl { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--sub); font-weight:600; padding-top:7px; }
  .frow .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip { font-size:12px; font-weight:600; padding:5px 12px; border-radius:99px; border:1px solid var(--line); background:var(--bg); cursor:pointer; font-family:inherit; color:var(--ink); }
  .chip.on { background:var(--ink); color:#fff; border-color:var(--ink); }
  table { width:100%; border-collapse:collapse; }
  thead th { position:sticky; top:0; background:var(--soft); z-index:5; font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--sub); text-align:left; padding:10px 16px; border-bottom:1px solid var(--line); }
  tbody td { padding:12px 16px; border-bottom:1px solid var(--line); vertical-align:middle; }
  tbody tr:hover { background:var(--soft); }
  .id .story { font-weight:650; font-size:14px; }
  .id .dims { font-size:12px; color:var(--sub); margin-top:2px; }
  .shot { width:150px; cursor:zoom-in; border:1px solid var(--line); border-radius:6px; background:#fff; display:block; transition:transform .12s; }
  .shot:hover { transform:scale(1.04); border-color:var(--accent); }
  td.dark-bg .shot { background:#1c1c22; }
  .missing { width:150px; font-size:11px; color:var(--bad); border:1px dashed var(--line); border-radius:6px; padding:10px; text-align:center; }
  .pcell { white-space:nowrap; }
  .pill { display:inline-block; font-size:11px; font-weight:700; padding:3px 9px; border-radius:99px; margin:1px 0; }
  .pill.ok { background:var(--okbg); color:var(--ok); }
  .pill.bad { background:var(--badbg); color:var(--bad); }
  .pill.na { background:var(--soft); color:var(--sub); }
  button.pill { border:0; cursor:pointer; font-family:inherit; }
  button.pill:hover { text-decoration:underline; }
  tr.hidden { display:none; }
  #lb { position:fixed; inset:0; background:rgba(12,12,16,.88); display:none; align-items:center; justify-content:center; z-index:100; flex-direction:column; gap:14px; }
  #lb.open { display:flex; }
  #lb img { max-width:86vw; max-height:74vh; border-radius:8px; background:#fff; }
  #lb .cap { color:#fff; font-size:14px; }
  #lb .hint { color:#9aa; font-size:12px; }
  #lb .fwnav { display:flex; gap:8px; }
  #lb .fwnav button { background:#2a2d36; color:#dde; border:1px solid #444a58; border-radius:8px; padding:6px 16px; font-size:13px; cursor:pointer; font-family:inherit; }
  #lb .fwnav button.on { background:var(--accent); border-color:var(--accent); color:#fff; }
</style>
</head>
<body>
<header class="masthead">
  <div class="crumb" id="crumb"></div>
  <h1 id="title"></h1>
  <span class="summary" id="paritySummary"></span>
</header>
<section class="filters" id="filters"></section>
<table>
  <thead><tr id="head"></tr></thead>
  <tbody id="rows"></tbody>
</table>
<div id="lb">
  <div class="fwnav" id="lbNav"></div>
  <img id="lbImg" src="" alt="" />
  <div class="cap" id="lbCap"></div>
  <div class="hint">← → troca visão · ↑ ↓ troca célula · esc fecha</div>
</div>
<script>
  const DATA = ${embedJson(data)};
  const FWS = DATA.frameworks;
  const FW_LABEL = { wc: 'Web Component', react: 'React', angular: 'Angular' };
  const fwLabel = (fw) => FW_LABEL[fw] || fw;

  // label = "brand · story · viewport · theme" (story pode conter espacos).
  function parse(label) {
    const parts = String(label).split(' · ');
    if (parts.length < 4) return { brand: '', story: label, viewport: '', theme: '' };
    return {
      brand: parts[0],
      theme: parts[parts.length - 1],
      viewport: parts[parts.length - 2],
      story: parts.slice(1, parts.length - 2).join(' · '),
    };
  }
  const CELLS = DATA.cells.map((c) => ({ ...c, ...parse(c.label) }));
  const hasParity = CELLS.some((c) => (c.parity || []).length);

  const uniq = (key) => [...new Set(CELLS.map((c) => c[key]))].filter(Boolean);
  const AXES = { story: uniq('story'), theme: uniq('theme'), viewport: uniq('viewport') };
  const state = { story: new Set(AXES.story), theme: new Set(AXES.theme), viewport: new Set(AXES.viewport) };

  function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // '✓' | 'Npx' (manifests antigos sem area) | percentual pt-BR ('2,1%', '<0,1%').
  function fmtParity(p) {
    if (p.mismatch === 0) return '✓';
    if (!p.width || !p.height) return p.mismatch + 'px';
    const pct = (p.mismatch / (p.width * p.height)) * 100;
    return pct < 0.1 ? '<0,1%' : pct.toFixed(1).replace('.', ',') + '%';
  }

  // Header
  document.getElementById('crumb').textContent = DATA.tool + ' · ' + DATA.card;
  document.getElementById('title').innerHTML =
    '<code>' + esc(DATA.component) + '</code> <span class="sub">— evidência visual</span>';

  // Stories com ao menos uma celula divergente -> chips clicaveis que filtram a story.
  const failingByStory = new Map();
  for (const c of CELLS) {
    if ((c.parity || []).some((p) => p.mismatch > 0)) {
      failingByStory.set(c.story, (failingByStory.get(c.story) || 0) + 1);
    }
  }
  const ps = document.getElementById('paritySummary');
  if (!hasParity) {
    ps.className = 'summary'; ps.textContent = DATA.cellCount + ' prints · sem paridade (framework único)';
  } else if (failingByStory.size === 0) {
    ps.className = 'summary ok'; ps.textContent = '✓ paridade total (' + DATA.cellCount + ' prints)';
  } else {
    ps.className = 'summary chips';
    ps.innerHTML = [...failingByStory].map(([story, n]) =>
      '<button class="schip" data-story="' + esc(story) + '">✗ ' + esc(story) +
      ' (' + n + (n === 1 ? ' célula' : ' células') + ')</button>').join('');
  }
  ps.addEventListener('click', (e) => {
    const chip = e.target.closest('.schip');
    if (!chip) return;
    state.story = new Set([chip.dataset.story]);
    document.querySelectorAll('.chip[data-f="story"]').forEach((b) =>
      b.classList.toggle('on', b.dataset.v === chip.dataset.story));
    render();
  });

  // Filtros — linhas alinhadas (label + chips)
  document.getElementById('filters').innerHTML = ['story', 'theme', 'viewport']
    .filter((f) => AXES[f].length)
    .map((f) => '<div class="frow"><span class="lbl">' +
      { story: 'Story', theme: 'Tema', viewport: 'Viewport' }[f] + '</span>' +
      '<div class="chips">' +
      AXES[f].map((v) => '<button class="chip on" data-f="' + f + '" data-v="' + esc(v) + '">' + esc(v) + '</button>').join('') +
      '</div></div>').join('');

  // Cabecalho da tabela
  document.getElementById('head').innerHTML =
    '<th style="width:180px">Célula</th>' +
    FWS.map((fw) => '<th>' + fwLabel(fw) + '</th>').join('') +
    (hasParity ? '<th style="width:160px">' + esc(DATA.parityLabel) + '</th>' : '');

  function render() {
    document.getElementById('rows').innerHTML = CELLS.map((c, i) => {
      const hide = !state.story.has(c.story) || !state.theme.has(c.theme) || !state.viewport.has(c.viewport);
      const tds = FWS.map((fw) => {
        const cls = c.theme === 'dark' ? ' class="dark-bg"' : '';
        if (!c[fw]) return '<td' + cls + '><div class="missing">ausente</div></td>';
        return '<td' + cls + '><img class="shot" loading="lazy" src="' + esc(c[fw]) +
          '" data-i="' + i + '" data-fw="' + fw + '" alt="' + esc(c.label + ' ' + fw) + '"/></td>';
      }).join('');
      let pcell = '';
      if (hasParity) {
        const pills = (c.parity || []).length
          ? c.parity.map((p, k) => {
              const ok = p.mismatch === 0;
              const txt = esc(p.against) + ' ' + esc(fmtParity(p));
              if (ok || !p.diffPath) {
                return '<span class="pill ' + (ok ? 'ok' : 'bad') + '">' + txt + '</span>';
              }
              return '<button class="pill bad diff" data-i="' + i + '" data-k="' + k +
                '" title="ver diff">' + txt + '</button>';
            }).join('<br>')
          : '<span class="pill na">—</span>';
        pcell = '<td class="pcell">' + pills + '</td>';
      }
      return '<tr class="' + (hide ? 'hidden' : '') + '">' +
        '<td class="id"><div class="story">' + esc(c.story) + '</div><div class="dims">' +
        esc([c.viewport, c.theme].filter(Boolean).join(' · ')) + '</div></td>' +
        tds + pcell + '</tr>';
    }).join('');
  }

  document.getElementById('filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const set = state[chip.dataset.f];
    set.has(chip.dataset.v) ? set.delete(chip.dataset.v) : set.add(chip.dataset.v);
    chip.classList.toggle('on');
    render();
  });

  // Lightbox — navega por "views": frameworks + 'Diff <fw>' por parity divergente com diffPath.
  const lb = document.getElementById('lb');
  let lbCell = 0, lbView = 0;
  function viewsOf(c) {
    const v = FWS.map((fw) => ({label: fwLabel(fw), src: c[fw]}));
    for (const p of (c.parity || [])) {
      if (p.diffPath && p.mismatch > 0) v.push({label: 'Diff ' + fwLabel(p.against), src: p.diffPath});
    }
    return v;
  }
  function openLb(i, view) { lbCell = i; lbView = view; paintLb(); lb.classList.add('open'); }
  function paintLb() {
    const c = CELLS[lbCell], views = viewsOf(c);
    if (lbView >= views.length) lbView = 0;
    const v = views[lbView];
    document.getElementById('lbImg').src = v.src || '';
    document.getElementById('lbCap').textContent = c.label + ' — ' + v.label + (v.src ? '' : ' (ausente)');
    document.getElementById('lbNav').innerHTML = views.map((vv, j) =>
      '<button class="' + (j === lbView ? 'on' : '') + '" data-j="' + j + '">' + esc(vv.label) + '</button>').join('');
  }
  document.getElementById('rows').addEventListener('click', (e) => {
    const img = e.target.closest('.shot');
    if (img) return openLb(Number(img.dataset.i), Math.max(0, FWS.indexOf(img.dataset.fw)));
    const b = e.target.closest('button.pill.diff');
    if (b) {
      const i = Number(b.dataset.i);
      const p = CELLS[i].parity[Number(b.dataset.k)];
      const idx = viewsOf(CELLS[i]).findIndex((v) => v.label === 'Diff ' + fwLabel(p.against));
      openLb(i, Math.max(0, idx));
    }
  });
  document.getElementById('lbNav').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { lbView = Number(b.dataset.j); paintLb(); }
  });
  lb.addEventListener('click', (e) => { if (e.target === lb) lb.classList.remove('open'); });
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('open')) return;
    const n = viewsOf(CELLS[lbCell]).length;
    if (e.key === 'Escape') lb.classList.remove('open');
    if (e.key === 'ArrowRight') { lbView = (lbView + 1) % n; paintLb(); }
    if (e.key === 'ArrowLeft') { lbView = (lbView + n - 1) % n; paintLb(); }
    if (e.key === 'ArrowDown') { lbCell = Math.min(lbCell + 1, CELLS.length - 1); paintLb(); }
    if (e.key === 'ArrowUp') { lbCell = Math.max(lbCell - 1, 0); paintLb(); }
  });

  render();
</script>
</body>
</html>
`;
}

module.exports = {escapeHtml, writeManifest, writeSummary, renderHtml};
