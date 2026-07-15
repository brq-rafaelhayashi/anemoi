# Relatório HTML — Badge %, Chips por Story e Prints 1:1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o relatório de paridade legível: badge com percentual clicável que abre o PNG de diff, cabeçalho com chips por story divergente, e prints exibidos em tamanho real (1:1 CSS px).

**Architecture:** O relatório é um HTML único gerado por `renderHtml` (`packages/core/src/output.js`) — template estático + payload JSON embutido; a tabela é montada por JS client-side. Os dados de paridade vêm de `computeParity` (`packages/web/src/parity.js`), que usa `writeDiff` (`packages/core/src/diff.js`, pixelmatch). Os testes só rodam em Node (sem DOM), então validam o payload embutido e strings do template — este é o padrão existente.

**Tech Stack:** Node 24 (`node --test`), pngjs (hoisted na raiz do workspace), pixelmatch.

**Spec:** `docs/superpowers/specs/2026-07-15-relatorio-html-ui-design.md`

## Global Constraints

- Textos do relatório em pt-BR; percentual com vírgula decimal (`2,1%`), abaixo de 0,1% exibe `<0,1%`.
- Entradas de `parity` sem `width`/`height` (manifests antigos) caem no formato antigo `Npx` — nunca `NaN%`.
- Estados do cabeçalho `✓ paridade total (N prints)` e `N prints · sem paridade (framework único)` permanecem inalterados.
- Captura tem `deviceScaleFactor: 2` → tamanho real em CSS px = `naturalWidth / 2`.
- Threshold do pixelmatch (0.1) e fluxo de captura não mudam.
- Commits com mensagens em pt-BR seguindo o padrão do repo (`feat(web): ...`, `feat(core): ...`).

---

### Task 1: `computeParity` guarda `width`/`height`

**Files:**
- Modify: `packages/web/src/parity.js:33-37`
- Test: `packages/web/test/parity.test.js`

**Interfaces:**
- Consumes: `writeDiff(aPath, bPath, outPath, opts)` → `{mismatch, width, height}` (já existe em `@gol-smiles/anemoi-core`).
- Produces: entradas de `parity` no shape `{against, mismatch, width, height, diffPath}` — as Tasks 2–3 dependem de `width`, `height` e `diffPath` no payload.

- [ ] **Step 1: Write the failing test**

Adicionar ao final de `packages/web/test/parity.test.js` (e incluir os requires que faltam no topo do arquivo):

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {PNG} = require('pngjs');
const {groupByCell, computeParity} = require('../src/parity');

function writeSolidPng(runDir, rel, fill) {
  const abs = path.join(runDir, rel);
  fs.mkdirSync(path.dirname(abs), {recursive: true});
  const png = new PNG({width: 4, height: 4});
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = fill;
    png.data[i + 1] = fill;
    png.data[i + 2] = fill;
    png.data[i + 3] = 255;
  }
  fs.writeFileSync(abs, PNG.sync.write(png));
}

test('computeParity guarda mismatch, width, height e diffPath por comparacao', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-'));
  writeSolidPng(runDir, 'wc.png', 10);
  writeSolidPng(runDir, 'react.png', 240);
  const groups = [{
    label: 'gol · Primary · sm · light',
    wc: 'wc.png',
    react: 'react.png',
    _cell: {brand: 'gol', storyId: 'button--primary', viewport: 'sm', theme: 'light'},
  }];
  const [g] = computeParity(groups, runDir);
  assert.equal(g.parity.length, 1);
  assert.equal(g.parity[0].against, 'react');
  assert.ok(g.parity[0].mismatch > 0);
  assert.equal(g.parity[0].width, 4);
  assert.equal(g.parity[0].height, 4);
  assert.match(g.parity[0].diffPath, /react-vs-wc/);
});
```

Nota: o `require` de `groupByCell` já existe na linha 3 — substituir por `{groupByCell, computeParity}`. `pngjs` resolve pelo hoisting do workspace (verificado).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/web/test/parity.test.js`
Expected: FAIL — `assert.equal(g.parity[0].width, 4)` com `undefined !== 4`.

- [ ] **Step 3: Write minimal implementation**

Em `packages/web/src/parity.js`, trocar:

```js
        const {mismatch} = writeDiff(
          path.join(runDir, g.wc), path.join(runDir, g[fw]), ensureDir(path.join(runDir, diffRel)),
          {fit: 'intersection'},
        );
        parity.push({against: fw, mismatch, diffPath: diffRel});
```

por:

```js
        const {mismatch, width, height} = writeDiff(
          path.join(runDir, g.wc), path.join(runDir, g[fw]), ensureDir(path.join(runDir, diffRel)),
          {fit: 'intersection'},
        );
        parity.push({against: fw, mismatch, width, height, diffPath: diffRel});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/web/test/parity.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/parity.js packages/web/test/parity.test.js
git commit -m "feat(web): parity guarda width/height da area comparada"
```

---

### Task 2: Badge de paridade em percentual

**Files:**
- Modify: `packages/core/src/output.js` (template embutido: função `fmtParity` + render das pills)
- Test: `packages/core/test/output.test.js`

**Interfaces:**
- Consumes: entradas de `parity` `{against, mismatch, width, height, diffPath}` (Task 1). Entradas antigas sem `width`/`height` também chegam aqui.
- Produces: função client-side `fmtParity(p)` no template — retorna `'✓'` se `mismatch === 0`; `'Npx'` se faltar `width`/`height`; senão percentual pt-BR (`'2,1%'`, `'<0,1%'`). A Task 3 reutiliza as pills geradas aqui.

- [ ] **Step 1: Write the failing test**

Adicionar ao final de `packages/core/test/output.test.js`:

```js
test('renderHtml: badge de paridade usa percentual com fallback px', () => {
  const html = renderHtml({
    component: 'tgr-button', card: 'c', mode: 'current', cellCount: 1,
    generatedAt: '2026-07-15T00:00:00.000Z',
    axes: {frameworks: ['wc', 'react']},
    groups: [{
      label: 'gol · Primary · sm · light',
      wc: 'a.png', react: 'b.png',
      parity: [{against: 'react', mismatch: 8, width: 40, height: 40, diffPath: 'diff/react-vs-wc/x.png'}],
    }],
  });
  // payload embutido carrega width/height/diffPath para o client-side
  assert.ok(html.includes('"width":40'));
  assert.ok(html.includes('"height":40'));
  assert.ok(html.includes('"diffPath":"diff/react-vs-wc/x.png"'));
  // template contem o formatador com percentual pt-BR e fallback px
  assert.match(html, /function fmtParity/);
  assert.match(html, /<0,1%/);
  assert.match(html, /toFixed\(1\)\.replace\('\.', ','\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/core/test/output.test.js`
Expected: FAIL em `assert.match(html, /function fmtParity/)`.

- [ ] **Step 3: Write minimal implementation**

Em `packages/core/src/output.js`, no `<script>` do template, adicionar logo após a função `esc` (linha ~177):

```js
  // '✓' | 'Npx' (manifests antigos sem area) | percentual pt-BR ('2,1%', '<0,1%').
  function fmtParity(p) {
    if (p.mismatch === 0) return '✓';
    if (!p.width || !p.height) return p.mismatch + 'px';
    const pct = (p.mismatch / (p.width * p.height)) * 100;
    return pct < 0.1 ? '<0,1%' : pct.toFixed(1).replace('.', ',') + '%';
  }
```

E trocar o render das pills (dentro de `render()`):

```js
        const pills = (c.parity || []).length
          ? c.parity.map((p) => '<span class="pill ' + (p.mismatch === 0 ? 'ok' : 'bad') + '">' +
              esc(p.against) + ' ' + (p.mismatch === 0 ? '✓' : p.mismatch + 'px') + '</span>').join('<br>')
          : '<span class="pill na">—</span>';
```

por:

```js
        const pills = (c.parity || []).length
          ? c.parity.map((p) => '<span class="pill ' + (p.mismatch === 0 ? 'ok' : 'bad') + '">' +
              esc(p.against) + ' ' + esc(fmtParity(p)) + '</span>').join('<br>')
          : '<span class="pill na">—</span>';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/core/test/output.test.js`
Expected: PASS (todos os testes, incluindo os pré-existentes).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/output.js packages/core/test/output.test.js
git commit -m "feat(core): badge de paridade em percentual da area comparada"
```

---

### Task 3: Badge clicável abre o diff no lightbox (aba Diff)

**Files:**
- Modify: `packages/core/src/output.js` (CSS `button.pill`, pills clicáveis, lightbox baseado em "views")
- Test: `packages/core/test/output.test.js`

**Interfaces:**
- Consumes: pills da Task 2; `diffPath` no payload (Task 1).
- Produces: função client-side `viewsOf(c)` → `[{label, src, missing?}]` = frameworks + uma view `'Diff <fw>'` por entrada de parity com `diffPath` e `mismatch > 0`. Lightbox navega por índice de view (`lbView`), não mais por índice de framework.

- [ ] **Step 1: Write the failing test**

Adicionar ao final de `packages/core/test/output.test.js`:

```js
test('renderHtml: badge divergente e clicavel e lightbox tem aba Diff', () => {
  const html = renderHtml({
    component: 'tgr-button', card: 'c', mode: 'current', cellCount: 1,
    generatedAt: '2026-07-15T00:00:00.000Z',
    axes: {frameworks: ['wc', 'react']},
    groups: [{
      label: 'gol · Primary · sm · light',
      wc: 'a.png', react: 'b.png',
      parity: [{against: 'react', mismatch: 8, width: 40, height: 40, diffPath: 'diff/react-vs-wc/x.png'}],
    }],
  });
  assert.match(html, /function viewsOf/);
  assert.match(html, /'Diff ' \+ fwLabel/);
  assert.match(html, /button class="pill bad diff"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/core/test/output.test.js`
Expected: FAIL em `assert.match(html, /function viewsOf/)`.

- [ ] **Step 3: Write minimal implementation**

Em `packages/core/src/output.js`:

**(a)** CSS — adicionar após a regra `.pill.na`:

```css
  button.pill { border:0; cursor:pointer; font-family:inherit; }
  button.pill:hover { text-decoration:underline; }
```

**(b)** Pills — trocar o bloco da Task 2 por (pill divergente com `diffPath` vira `<button>`):

```js
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
```

**(c)** Lightbox — substituir o bloco inteiro entre `// Lightbox` e o fim do handler de `keydown` por:

```js
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
```

Nota: a dica do lightbox (`← → troca framework`) passa a ser imprecisa — atualizar o texto para `← → troca visão · ↑ ↓ troca célula · esc fecha`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/core/test/output.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/output.js packages/core/test/output.test.js
git commit -m "feat(core): badge divergente abre o PNG de diff no lightbox"
```

---

### Task 4: Cabeçalho com chips por story divergente

**Files:**
- Modify: `packages/core/src/output.js` (CSS `.schip`, bloco do `paritySummary`, handler de clique)
- Test: `packages/core/test/output.test.js`

**Interfaces:**
- Consumes: `CELLS` com `story` (do `parse(label)`) e `parity`; `state.story` + chips de filtro `data-f="story"` já existentes.
- Produces: chips `button.schip[data-story]` no `#paritySummary`; clique liga só aquela story no filtro existente.

- [ ] **Step 1: Write the failing test**

Adicionar ao final de `packages/core/test/output.test.js`:

```js
test('renderHtml: cabecalho lista stories divergentes como chips clicaveis', () => {
  const html = renderHtml({
    component: 'tgr-button', card: 'c', mode: 'current', cellCount: 2,
    generatedAt: '2026-07-15T00:00:00.000Z',
    axes: {frameworks: ['wc', 'react']},
    groups: [
      {label: 'gol · Com Icone · sm · light', wc: 'a.png', react: 'b.png',
        parity: [{against: 'react', mismatch: 8, width: 40, height: 40, diffPath: 'd.png'}]},
      {label: 'gol · Loading · sm · light', wc: 'c.png', react: 'd2.png',
        parity: [{against: 'react', mismatch: 0, width: 40, height: 40, diffPath: 'd3.png'}]},
    ],
  });
  assert.match(html, /class="schip"/);
  assert.match(html, /failingByStory/);
  // nao ha mais soma global de pixels no cabecalho
  assert.ok(!html.includes("'px de divergência'"));
  assert.ok(!html.includes('totalDiff'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/core/test/output.test.js`
Expected: FAIL em `assert.match(html, /class="schip"/)`.

- [ ] **Step 3: Write minimal implementation**

Em `packages/core/src/output.js`:

**(a)** CSS — adicionar após `.masthead .summary.bad`:

```css
  .masthead .summary.chips { background:none; padding:0; display:flex; flex-wrap:wrap; gap:6px; }
  .schip { font-size:12px; font-weight:700; padding:5px 12px; border-radius:99px; border:0; background:var(--badbg); color:var(--bad); cursor:pointer; font-family:inherit; }
  .schip:hover { text-decoration:underline; }
```

**(b)** Substituir o bloco do resumo (de `const totalDiff = ...` até o `else { ps.className = 'summary bad'; ... }`) por:

```js
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
```

Atenção à ordem: este bloco referencia `state` e `render()`. `state` já é declarado antes (linha ~172); o `addEventListener` só dispara após `render()` existir, então a ordem atual do script (resumo antes de `render`) continua válida — apenas garantir que o bloco fique onde o antigo estava.

Nota: o `<span class="summary">` do `#paritySummary` (linha 137 do template) passa a receber `innerHTML` com botões — manter como `<span>` funciona, mas o CSS `.summary.chips` acima zera o fundo do container.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/core/test/output.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/output.js packages/core/test/output.test.js
git commit -m "feat(core): cabecalho aponta stories divergentes com chips que filtram"
```

---

### Task 5: Prints em tamanho real (1:1 CSS px)

**Files:**
- Modify: `packages/core/src/output.js` (CSS da tabela/shots, markup do `<img>` com wrapper e `onload`)
- Test: `packages/core/test/output.test.js`

**Interfaces:**
- Consumes: markup dos `<td>` de framework gerado em `render()`.
- Produces: `<div class="shotwrap"><img class="shot" onload="..."></div>`; tabela com `table-layout:fixed` para o overflow-x funcionar por célula.

- [ ] **Step 1: Write the failing test**

Adicionar ao final de `packages/core/test/output.test.js`:

```js
test('renderHtml: prints em tamanho real com scroll por celula', () => {
  const html = renderHtml({
    component: 'tgr-button', card: 'c', mode: 'current', cellCount: 1,
    generatedAt: '2026-07-15T00:00:00.000Z',
    axes: {frameworks: ['wc', 'react']},
    groups: [{label: 'gol · Primary · sm · light', wc: 'a.png', react: 'b.png', parity: []}],
  });
  assert.ok(!html.includes('width:150px'));
  assert.match(html, /table-layout:fixed/);
  assert.match(html, /class="shotwrap"/);
  assert.match(html, /naturalWidth\s*\/\s*2/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/core/test/output.test.js`
Expected: FAIL em `assert.ok(!html.includes('width:150px'))`.

- [ ] **Step 3: Write minimal implementation**

Em `packages/core/src/output.js`:

**(a)** CSS — trocar:

```css
  table { width:100%; border-collapse:collapse; }
```
por:
```css
  table { width:100%; border-collapse:collapse; table-layout:fixed; }
```

Trocar o bloco `.shot` / `td.dark-bg` / `.missing`:

```css
  tbody td { padding:12px 16px; border-bottom:1px solid var(--line); vertical-align:middle; }
  ...
  .shot { width:150px; cursor:zoom-in; border:1px solid var(--line); border-radius:6px; background:#fff; display:block; transition:transform .12s; }
  .shot:hover { transform:scale(1.04); border-color:var(--accent); }
  td.dark-bg .shot { background:#1c1c22; }
  .missing { width:150px; font-size:11px; color:var(--bad); border:1px dashed var(--line); border-radius:6px; padding:10px; text-align:center; }
```
por:
```css
  tbody td { padding:8px 12px; border-bottom:1px solid var(--line); vertical-align:middle; }
  ...
  .shotwrap { overflow-x:auto; }
  .shot { cursor:zoom-in; border:1px solid var(--line); border-radius:6px; background:#fff; display:block; max-width:none; }
  .shot:hover { border-color:var(--accent); }
  td.dark-bg .shot { background:#1c1c22; }
  .missing { max-width:150px; font-size:11px; color:var(--bad); border:1px dashed var(--line); border-radius:6px; padding:10px; text-align:center; }
```

(O `transform:scale` do hover sai: com scroll horizontal dentro da célula ele causaria clipping.)

**(b)** Markup do `<img>` em `render()` — trocar:

```js
        if (!c[fw]) return '<td' + cls + '><div class="missing">ausente</div></td>';
        return '<td' + cls + '><img class="shot" loading="lazy" src="' + esc(c[fw]) +
          '" data-i="' + i + '" data-fw="' + fw + '" alt="' + esc(c.label + ' ' + fw) + '"/></td>';
```
por:
```js
        if (!c[fw]) return '<td' + cls + '><div class="missing">ausente</div></td>';
        return '<td' + cls + '><div class="shotwrap"><img class="shot" loading="lazy" src="' + esc(c[fw]) +
          '" data-i="' + i + '" data-fw="' + fw + '" alt="' + esc(c.label + ' ' + fw) +
          '" onload="this.style.width=(this.naturalWidth/2)+\\'px\\'"/></div></td>';
```

Atenção: dentro do template literal de `renderHtml`, o `onload` precisa de aspas simples escapadas (`\\'`) — o snippet acima já está no formato que vai dentro do template literal do arquivo (que usa backticks).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/core/test/output.test.js`
Expected: PASS.

- [ ] **Step 5: Run full suite**

Run: `npm test` (na raiz `/Users/user/Developer/projects/anemoi`)
Expected: todos os workspaces passam.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/output.js packages/core/test/output.test.js
git commit -m "feat(core): prints em tamanho real 1:1 com scroll por celula"
```

---

### Task 6: Verificação visual com relatório de amostra

**Files:**
- Create: `/private/tmp/claude-502/-Users-user-Developer-projects-anemoi/e80816cb-5868-4659-a82b-483c88eb8c93/scratchpad/sample-report.js` (script descartável, fora do repo)

**Interfaces:**
- Consumes: `renderHtml` final.
- Produces: HTML de amostra aberto para inspeção humana — critério de aceite visual das 3 melhorias.

- [ ] **Step 1: Gerar relatório de amostra**

Script no scratchpad (gera PNGs sólidos de tamanhos diferentes + diff real e chama `renderHtml`):

```js
const fs = require('node:fs');
const path = require('node:path');
const {PNG} = require(path.join(process.env.REPO, 'node_modules/pngjs'));
const {renderHtml} = require(path.join(process.env.REPO, 'packages/core/src/output'));
const {writeDiff} = require(path.join(process.env.REPO, 'packages/core/src/diff'));

const out = path.join(__dirname, 'sample-report');
const png = (rel, w, h, fill) => {
  const p = path.join(out, rel);
  fs.mkdirSync(path.dirname(p), {recursive: true});
  const img = new PNG({width: w, height: h});
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = fill[0]; img.data[i + 1] = fill[1]; img.data[i + 2] = fill[2]; img.data[i + 3] = 255;
  }
  fs.writeFileSync(p, PNG.sync.write(img));
  return p;
};

// célula 1: full-width (1560x96 = 780 css px @2x), react divergente
png('wc/full.png', 1560, 96, [232, 93, 4]);
png('react/full.png', 1560, 96, [232, 120, 40]);
// célula 2: botão sm (300x72), paridade ok
png('wc/sm.png', 300, 72, [232, 93, 4]);
png('react/sm.png', 300, 72, [232, 93, 4]);

const d1 = writeDiff(path.join(out, 'wc/full.png'), path.join(out, 'react/full.png'),
  (fs.mkdirSync(path.join(out, 'diff/react-vs-wc'), {recursive: true}), path.join(out, 'diff/react-vs-wc/full.png')),
  {fit: 'intersection'});
const d2 = writeDiff(path.join(out, 'wc/sm.png'), path.join(out, 'react/sm.png'),
  path.join(out, 'diff/react-vs-wc/sm.png'), {fit: 'intersection'});

const html = renderHtml({
  tool: 'Anemoi Web', component: 'tgr-button', card: 'AMOSTRA', mode: 'current', cellCount: 2,
  generatedAt: new Date().toISOString(),
  axes: {frameworks: ['wc', 'react'], stories: ['Full Width', 'Com Icone'], themes: ['light'], viewports: ['780px'], brands: ['gol']},
  groups: [
    {label: 'gol · Full Width · 780px · light', wc: 'wc/full.png', react: 'react/full.png',
      parity: [{against: 'react', mismatch: d1.mismatch, width: d1.width, height: d1.height, diffPath: 'diff/react-vs-wc/full.png'}]},
    {label: 'gol · Com Icone · 780px · light', wc: 'wc/sm.png', react: 'react/sm.png',
      parity: [{against: 'react', mismatch: d2.mismatch, width: d2.width, height: d2.height, diffPath: 'diff/react-vs-wc/sm.png'}]},
  ],
});
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log(path.join(out, 'index.html'));
```

Run: `REPO=/Users/user/Developer/projects/anemoi node <scratchpad>/sample-report.js`
Expected: imprime o caminho do `index.html`.

- [ ] **Step 2: Inspecionar no navegador**

Abrir o `index.html` gerado e verificar:
1. Badge `react N,N%` (não `px`) na célula divergente; `react ✓` na célula ok.
2. Clique no badge divergente abre o lightbox já na aba `Diff React`, com navegação ← → passando por WC, React e Diff.
3. Cabeçalho mostra chip `✗ Full Width (1 célula)`; clique no chip filtra a tabela para essa story.
4. Print full-width exibido em ~780 CSS px (1:1); print sm em ~150 CSS px — proporção real, sem estilo `width:150px`.
5. Em janela estreita, a célula do full-width ganha scroll horizontal sem quebrar a matriz.

Sem commit — artefato descartável no scratchpad.

---

## Self-Review (executado)

- **Cobertura do spec:** badge % + fallback px (Task 2), clique → diff no lightbox (Task 3), chips por story com filtro (Task 4), 1:1 + overflow + padding (Task 5), width/height no manifest (Task 1), verificação visual (Task 6). Estados `✓`/`sem paridade` preservados (Task 4). ✓
- **Placeholders:** nenhum — todo step tem código ou comando concreto. ✓
- **Consistência de tipos:** `parity = {against, mismatch, width, height, diffPath}` usado igual nas Tasks 1–4; `fmtParity`/`viewsOf` definidos antes de usados; `data-i`/`data-k` consistentes entre pill e handler. ✓
