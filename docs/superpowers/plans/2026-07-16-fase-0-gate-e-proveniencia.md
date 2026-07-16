# Fase 0 — Gate de paridade e proveniência no CLI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O manifesto do CLI web passa a dizer a verdade (`failed` quando a paridade diverge, incluindo diferença de dimensão), o run pode bloquear CI via `--fail-on-diff`, e o manifesto registra proveniência (commits, browser, thresholds).

**Architecture:** Todas as mudanças ficam no repo anemoi (packages/core e packages/web) — nada toca o tangerina-web-core. O diff passa a usar a união das dimensões e a devolver os tamanhos originais das duas imagens; a paridade registra `sizeMatch` por par; o pipeline computa o veredito a partir de mismatch OU dimensão divergente; o CLI liga `statusFromParity` sempre (manifesto honesto) e a flag `--fail-on-diff` controla apenas o código de saída. Proveniência é coletada num módulo novo do web e flui pelo `manifestMeta` existente.

**Tech Stack:** Node >= 24, CommonJS, `node:test` + `node:assert/strict`, pixelmatch/pngjs (core), Playwright (testes de pipeline lançam Chromium real, como os testes existentes já fazem).

## Global Constraints

- Node >= 24; todos os pacotes são CommonJS (`'use strict'`, `require`).
- Testes com `node --test`; suíte completa: `npm test` na raiz de `/Users/user/Developer/projects/anemoi`.
- Nenhuma dependência nova.
- Commits em conventional commits pt-BR, como os existentes (`feat(web): …`, `feat(core): …`).
- Identidade git: rafaelhayashi@brq.com (conta gh brq-rafaelhayashi). Verifique com `git config user.email` antes do primeiro commit.
- Não alterar `packages/service` (fora de escopo; o runner do service continua funcionando porque a interface de `capturePipeline` não muda — só o cálculo interno do veredito).
- O barrel `packages/web/src/index.js` tem exports enforced por teste — módulos internos novos (provenance.js) NÃO entram no barrel; `run.js` os importa por caminho relativo.
- Compatibilidade retroativa de manifesto: parity entries antigos sem `sizeMatch` nunca podem passar a divergir por causa da ausência do campo (`p.sizeMatch === false`, nunca `!p.sizeMatch`).

---

### Task 1: `writeDiff` devolve dimensões originais, `sizeMatch` e threshold aplicado

**Files:**
- Modify: `packages/core/src/diff.js`
- Test: `packages/core/test/diff.test.js`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `writeDiff(beforePath, afterPath, outPath, opts?)` retorna `{mismatch, width, height, threshold, sizeMatch, beforeSize: {width, height}, afterSize: {width, height}}`; `opts.threshold` (default `DEFAULT_THRESHOLD = 0.1`); export novo `DEFAULT_THRESHOLD` (sai automaticamente no barrel do core, que faz spread de `./diff`). Tasks 2 e 5 dependem exatamente desses nomes.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `packages/core/test/diff.test.js` (os helpers `writePng` e `writePngSized` já existem no arquivo):

```js
test('writeDiff: retorna sizeMatch true e dimensoes originais quando tamanhos coincidem', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-size-'));
  const a = path.join(dir, 'a.png');
  const b = path.join(dir, 'b.png');
  const out = path.join(dir, 'd.png');
  writePng(a, {r: 10, g: 20, b: 30});
  writePng(b, {r: 10, g: 20, b: 30});

  const result = writeDiff(a, b, out);
  assert.equal(result.sizeMatch, true);
  assert.deepEqual(result.beforeSize, {width: 4, height: 4});
  assert.deepEqual(result.afterSize, {width: 4, height: 4});
  assert.equal(result.threshold, 0.1);
});

test('writeDiff: sizeMatch false com tamanhos originais quando dimensoes divergem', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-size2-'));
  const a = path.join(dir, 'a.png');
  const b = path.join(dir, 'b.png');
  const out = path.join(dir, 'd.png');
  writePngSized(a, 4, 4, {r: 200, g: 0, b: 0});
  writePngSized(b, 6, 4, {r: 200, g: 0, b: 0});

  const result = writeDiff(a, b, out);
  assert.equal(result.sizeMatch, false);
  assert.deepEqual(result.beforeSize, {width: 4, height: 4});
  assert.deepEqual(result.afterSize, {width: 6, height: 4});
});

test('writeDiff: threshold customizado e aplicado e registrado no retorno', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-thr-'));
  const a = path.join(dir, 'a.png');
  const b = path.join(dir, 'b.png');
  const out = path.join(dir, 'd.png');
  writePng(a, {r: 0, g: 0, b: 0});
  writePng(b, {r: 255, g: 255, b: 255});

  // threshold 1 = tolerancia maxima do pixelmatch: preto vs branco nao conta.
  const result = writeDiff(a, b, out, {threshold: 1});
  assert.equal(result.mismatch, 0);
  assert.equal(result.threshold, 1);
});

test('barrel do core exporta DEFAULT_THRESHOLD', () => {
  const core = require('../src/index');
  assert.equal(core.DEFAULT_THRESHOLD, 0.1);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test packages/core/test/diff.test.js`
Expected: FAIL — `sizeMatch`, `beforeSize`, `threshold` e `DEFAULT_THRESHOLD` são `undefined`.

- [ ] **Step 3: Implementar em `packages/core/src/diff.js`**

Substituir o conteúdo do arquivo por:

```js
const fs = require('node:fs');
const {PNG} = require('pngjs');
const pixelmatch = require('pixelmatch');

// Threshold default do pixelmatch. Exportado para a proveniencia registrar
// exatamente o valor aplicado no manifesto.
const DEFAULT_THRESHOLD = 0.1;

// Compara before vs after. Se as dimensoes diferem, normaliza conforme opts.fit:
//   'union' (default): dimensoes = Math.max; imagem menor recebe pad transparente top-left.
//   'intersection': dimensoes = Math.min; ambas as imagens sao recortadas para a menor area.
// Retorna tambem os tamanhos originais e sizeMatch, para que a dimensao possa
// fazer parte do veredito de paridade.
function writeDiff(beforePath, afterPath, outPath, opts = {}) {
  const before = PNG.sync.read(fs.readFileSync(beforePath));
  const after = PNG.sync.read(fs.readFileSync(afterPath));

  const fit = opts.fit || 'union';
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const width = fit === 'intersection'
    ? Math.min(before.width, after.width)
    : Math.max(before.width, after.width);
  const height = fit === 'intersection'
    ? Math.min(before.height, after.height)
    : Math.max(before.height, after.height);

  const a = resizeCanvas(before, width, height);
  const b = resizeCanvas(after, width, height);
  const diff = new PNG({width, height});

  const mismatch = pixelmatch(a.data, b.data, diff.data, width, height, {threshold});

  fs.writeFileSync(outPath, PNG.sync.write(diff));
  return {
    mismatch,
    width,
    height,
    threshold,
    sizeMatch: before.width === after.width && before.height === after.height,
    beforeSize: {width: before.width, height: before.height},
    afterSize: {width: after.width, height: after.height},
  };
}

// Coloca a imagem num canvas WxH (preenchido de transparente), top-left.
// Se o canvas for menor que a imagem (fit='intersection'), recorta para WxH.
function resizeCanvas(png, width, height) {
  if (png.width === width && png.height === height) {
    return png;
  }
  const canvas = new PNG({width, height});
  const copyW = Math.min(png.width, width);
  const copyH = Math.min(png.height, height);
  PNG.bitblt(png, canvas, 0, 0, copyW, copyH, 0, 0);
  return canvas;
}

module.exports = {writeDiff, DEFAULT_THRESHOLD};
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test packages/core/test/diff.test.js`
Expected: PASS (todos, incluindo os 4 testes pré-existentes de union/intersection).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/diff.js packages/core/test/diff.test.js
git commit -m "feat(core): writeDiff retorna sizeMatch, dimensoes originais e threshold aplicado"
```

---

### Task 2: `computeParity` usa união das dimensões e registra dimensão por par

**Files:**
- Modify: `packages/web/src/parity.js`
- Test: `packages/web/test/parity.test.js`

**Interfaces:**
- Consumes: `writeDiff` da Task 1 (`{mismatch, width, height, sizeMatch, beforeSize, afterSize}`).
- Produces: cada entry de `parity[]` passa a ser `{against, mismatch, width, height, sizeMatch, referenceSize: {width, height}, againstSize: {width, height}, diffPath}`. Tasks 3 e 6 dependem de `sizeMatch`, `referenceSize` e `againstSize` com exatamente esses nomes.

- [ ] **Step 1: Escrever o teste que falha**

Em `packages/web/test/parity.test.js`, primeiro trocar o helper `writeSolidPng` existente por uma versão com dimensões parametrizadas (assinatura retrocompatível — os testes existentes continuam chamando com 3 argumentos):

```js
function writeSolidPng(runDir, rel, fill, width = 4, height = 4) {
  const abs = path.join(runDir, rel);
  fs.mkdirSync(path.dirname(abs), {recursive: true});
  const png = new PNG({width, height});
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = fill;
    png.data[i + 1] = fill;
    png.data[i + 2] = fill;
    png.data[i + 3] = 255;
  }
  fs.writeFileSync(abs, PNG.sync.write(png));
}
```

Depois adicionar ao final do arquivo:

```js
test('computeParity: uniao das dimensoes e sizeMatch false quando tamanhos divergem', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-union-'));
  writeSolidPng(runDir, 'wc.png', 200, 4, 4);
  writeSolidPng(runDir, 'react.png', 200, 6, 4); // mesma cor, mais larga
  const groups = [{
    label: 'gol · Primary · sm · light',
    wc: 'wc.png',
    react: 'react.png',
    _cell: {brand: 'gol', storyId: 'button--primary', viewport: 'sm', theme: 'light'},
  }];
  const [g] = computeParity(groups, runDir);
  assert.equal(g.parity[0].width, 6);   // uniao (max), nao intersecao (min)
  assert.equal(g.parity[0].height, 4);
  assert.equal(g.parity[0].sizeMatch, false);
  assert.deepEqual(g.parity[0].referenceSize, {width: 4, height: 4});
  assert.deepEqual(g.parity[0].againstSize, {width: 6, height: 4});
  assert.ok(g.parity[0].mismatch > 0, 'area extra da uniao conta como divergencia');
});

test('computeParity: tamanhos iguais => sizeMatch true', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-eq-'));
  writeSolidPng(runDir, 'wc.png', 10);
  writeSolidPng(runDir, 'react.png', 10);
  const groups = [{
    label: 'gol · Primary · sm · light',
    wc: 'wc.png',
    react: 'react.png',
    _cell: {brand: 'gol', storyId: 'button--primary', viewport: 'sm', theme: 'light'},
  }];
  const [g] = computeParity(groups, runDir);
  assert.equal(g.parity[0].sizeMatch, true);
  assert.equal(g.parity[0].mismatch, 0);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test packages/web/test/parity.test.js`
Expected: FAIL — `width` vem 4 (interseção) em vez de 6, e `sizeMatch`/`referenceSize`/`againstSize` são `undefined`.

- [ ] **Step 3: Implementar em `packages/web/src/parity.js`**

Substituir o bloco do `computeParity` (a chamada de `writeDiff` e o `parity.push`) e o comentário acima da função. O trecho:

```js
// Compara cada par (reference x against) com writeDiff e GRAVA os PNGs de diff
// em <runDir>/diff/<against>-vs-<reference>/. Retorna os grupos com parity[].
function computeParity(groups, runDir, {pairs = DEFAULT_PAIRS} = {}) {
```

vira:

```js
// Compara cada par (reference x against) com writeDiff e GRAVA os PNGs de diff
// em <runDir>/diff/<against>-vs-<reference>/. Retorna os grupos com parity[].
// O diff usa a uniao das dimensoes (fit default do core): area que existe em
// apenas um dos lados conta como divergencia, e sizeMatch registra se as
// capturas tinham o mesmo tamanho.
function computeParity(groups, runDir, {pairs = DEFAULT_PAIRS} = {}) {
```

e o corpo do `if (g[reference] && g[against])`:

```js
        const brand = assertSafePathSegment(g._cell.brand, 'brand');
        const storyId = assertSafePathSegment(g._cell.storyId, 'storyId');
        const viewport = assertSafePathSegment(g._cell.viewport, 'viewport');
        const theme = assertSafePathSegment(g._cell.theme, 'theme');
        const diffRel = path.join('diff', `${against}-vs-${reference}`, `${brand}-${storyId}-${viewport}-${theme}.png`);
        const {mismatch, width, height, sizeMatch, beforeSize, afterSize} = writeDiff(
          path.join(runDir, g[reference]), path.join(runDir, g[against]),
          ensureDir(path.join(runDir, diffRel)),
        );
        parity.push({
          against, mismatch, width, height, sizeMatch,
          referenceSize: beforeSize, againstSize: afterSize,
          diffPath: diffRel,
        });
```

(A mudança essencial: some o `{fit: 'intersection'}` da chamada de `writeDiff` e entram os campos novos no push.)

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test packages/web/test/parity.test.js`
Expected: PASS (os 5 testes pré-existentes + os 2 novos).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/parity.js packages/web/test/parity.test.js
git commit -m "feat(web): paridade usa uniao das dimensoes e registra sizeMatch por par"
```

---

### Task 3: veredito do pipeline considera mismatch OU dimensão divergente

**Files:**
- Modify: `packages/web/src/pipeline.js`
- Test: `packages/web/test/pipeline.test.js`

**Interfaces:**
- Consumes: parity entries da Task 2 (`sizeMatch`, `referenceSize`, `againstSize`).
- Produces: `hasParityDivergence(parities) -> boolean` exportado de `pipeline.js` (junto de `capturePipeline`); o `status` do manifesto passa a acusar `failed` também quando só a dimensão diverge. Task 7 depende do status honesto.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `packages/web/test/pipeline.test.js` (os helpers `serveEvidence`, `fakeHost`, `cell` e `meta` já existem no arquivo). Primeiro, ajustar o import no topo:

```js
const {capturePipeline, hasParityDivergence} = require('../src/pipeline');
```

Depois os testes:

```js
test('hasParityDivergence: mismatch, sizeMatch e manifests antigos', () => {
  assert.equal(hasParityDivergence([{mismatch: 0, sizeMatch: true}]), false);
  assert.equal(hasParityDivergence([{mismatch: 3, sizeMatch: true}]), true);
  assert.equal(hasParityDivergence([{mismatch: 0, sizeMatch: false}]), true);
  // Entries antigos sem sizeMatch nao podem divergir pela ausencia do campo.
  assert.equal(hasParityDivergence([{mismatch: 0}]), false);
});

// #evidence-root inline-block: o screenshot abraca o conteudo, entao larguras
// diferentes produzem capturas de tamanhos diferentes.
const evidenceHtmlSized = (color, width) =>
  `<!doctype html><html><head><meta charset="utf-8"></head>`
  + `<body style="margin:0"><div id="evidence-root" style="display:inline-block">`
  + `<div style="width:${width}px;height:48px;background:${color}"></div></div></body></html>`;

test('pipeline: dimensoes divergentes acusam failed e registram sizeMatch', async () => {
  const react = await serveEvidence(evidenceHtmlSized('#f60', 120));
  const angular = await serveEvidence(evidenceHtmlSized('#f60', 140));
  try {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-pipeline-'));
    const {manifest} = await capturePipeline({
      cells: [cell('react'), cell('angular')],
      acquireHost: async (framework) => ({
        host: fakeHost(framework),
        url: framework === 'react' ? react.url : angular.url,
      }),
      runDir,
      pairs: [{reference: 'react', against: 'angular'}],
      statusFromParity: true,
      manifestMeta: meta(),
    });
    assert.equal(manifest.status, 'failed');
    const p = manifest.groups[0].parity[0];
    assert.equal(p.sizeMatch, false);
    assert.ok(p.againstSize.width > p.referenceSize.width);
  } finally {
    await react.close();
    await angular.close();
  }
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test packages/web/test/pipeline.test.js`
Expected: FAIL — `hasParityDivergence is not a function`.

- [ ] **Step 3: Implementar em `packages/web/src/pipeline.js`**

Trocar o cálculo do status:

```js
  const parities = groups.flatMap(group => group.parity);
  const status = statusFromParity && parities.some(parity => parity.mismatch > 0)
    ? 'failed'
    : 'passed';
```

por:

```js
  const parities = groups.flatMap(group => group.parity);
  const status = statusFromParity && hasParityDivergence(parities) ? 'failed' : 'passed';
```

e adicionar antes do `module.exports`:

```js
// Divergencia de paridade: pixels diferentes OU capturas com dimensoes
// distintas. sizeMatch ausente (parity entries antigos) nao diverge.
function hasParityDivergence(parities) {
  return parities.some(parity => parity.mismatch > 0 || parity.sizeMatch === false);
}
```

com export:

```js
module.exports = {capturePipeline, hasParityDivergence};
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test packages/web/test/pipeline.test.js`
Expected: PASS (3 testes pré-existentes + 2 novos; o teste de dimensões lança Chromium real, como os demais).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pipeline.js packages/web/test/pipeline.test.js
git commit -m "feat(web): veredito de paridade inclui divergencia de dimensao"
```

---

### Task 4: manifesto e summary aceitam e exibem proveniência

**Files:**
- Modify: `packages/core/src/manifest.js`
- Modify: `packages/core/src/output.js` (apenas `writeSummary`)
- Test: `packages/core/test/manifest.test.js`, `packages/core/test/output.test.js`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `buildManifest({..., provenance?})` inclui `provenance` verbatim no manifesto quando fornecido (mesmo padrão do `compareState` existente); `writeSummary` renderiza a seção `## Proveniência` quando `manifest.provenance` existe. Task 7 envia `provenance` via `manifestMeta` (o pipeline faz spread de `manifestMeta` no `buildManifest`, então nenhuma mudança no pipeline é necessária). O shape esperado do objeto é o produzido pela Task 5.

- [ ] **Step 1: Escrever os testes que falham**

Em `packages/core/test/manifest.test.js`, adicionar:

```js
test('buildManifest: provenance entra verbatim quando fornecida', () => {
  const provenance = {
    anemoi: {version: '1.0.0', commit: 'abc123'},
    tangerina: {commit: 'def456'},
    thresholds: {pixelmatch: 0.1, mismatchTolerance: 0, fit: 'union'},
  };
  const m = buildManifest({
    tool: 'Anemoi Web', card: 'CDCOM-1', component: 'tgr-button',
    mode: 'current', runDir: '/tmp/run', provenance, now: NOW,
  });
  assert.deepEqual(m.provenance, provenance);
});

test('buildManifest: sem provenance, a chave nao existe', () => {
  const m = buildManifest({
    tool: 'Anemoi Web', card: 'CDCOM-1', component: 'tgr-button',
    mode: 'current', runDir: '/tmp/run', now: NOW,
  });
  assert.ok(!('provenance' in m));
});
```

Em `packages/core/test/output.test.js`, adicionar (o helper `grid` já existe):

```js
test('writeSummary: renderiza secao de proveniencia quando presente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-prov-'));
  const p = writeSummary(dir, grid({
    cellCount: 1,
    runDir: dir,
    provenance: {
      anemoi: {version: '1.0.0', commit: 'abc123'},
      tangerina: {commit: 'def456'},
      environment: {os: 'darwin 25.5.0', node: 'v24.0.0', browser: 'chromium', playwright: '1.48.0'},
      thresholds: {pixelmatch: 0.1, mismatchTolerance: 0, fit: 'union'},
    },
  }));
  const md = fs.readFileSync(p, 'utf8');
  assert.match(md, /## Proveniência/);
  assert.match(md, /abc123/);
  assert.match(md, /def456/);
  assert.match(md, /pixelmatch 0\.1/);
});

test('writeSummary: sem proveniencia, secao nao aparece', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-noprov-'));
  const p = writeSummary(dir, grid({cellCount: 1, runDir: dir}));
  const md = fs.readFileSync(p, 'utf8');
  assert.ok(!md.includes('Proveniência'));
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test packages/core/test/manifest.test.js packages/core/test/output.test.js`
Expected: FAIL — `provenance` não entra no manifesto nem no summary.

- [ ] **Step 3: Implementar**

Em `packages/core/src/manifest.js`, adicionar `provenance` aos parâmetros do `buildManifest` (depois de `compareState`):

```js
function buildManifest({
  tool,
  status = 'passed',
  card,
  component,
  mode,
  layout = 'parity',
  parityLabel = 'Paridade vs wc',
  axes = {},
  cellCount = 0,
  groups = [],
  compareState,
  provenance,
  runDir,
  now = new Date(),
}) {
```

e no objeto retornado, logo após a linha do `compareState`:

```js
    ...(compareState !== undefined ? {compareState} : {}),
    ...(provenance !== undefined ? {provenance} : {}),
```

Em `packages/core/src/output.js`, substituir o `writeSummary` inteiro por:

```js
function writeSummary(runDir, manifest) {
  const summaryPath = path.join(runDir, 'summary.md');
  const tool = manifest.tool;
  const axes = manifest.axes;
  const joinAxis = (value) => (Array.isArray(value) && value.length ? value.join(', ') : '(default)');
  const lines = [
    `# ${tool} - ${manifest.component}`,
    '',
    `- Card: ${manifest.card}`,
    `- Modo: ${manifest.mode}`,
    `- Status: ${manifest.status}`,
    `- Gerado em: ${manifest.generatedAt}`,
    `- Brands: ${joinAxis(axes.brands)}`,
    `- Stories: ${joinAxis(axes.stories)}`,
    `- Viewports: ${joinAxis(axes.viewports)}`,
    `- Themes: ${joinAxis(axes.themes)}`,
    `- Prints: ${manifest.cellCount}`,
  ];
  if (manifest.provenance) {
    const p = manifest.provenance;
    lines.push(
      '',
      '## Proveniência',
      '',
      `- Anemoi: ${p.anemoi?.version ?? '?'} (commit ${p.anemoi?.commit ?? 'desconhecido'})`,
      `- Tangerina: commit ${p.tangerina?.commit ?? 'desconhecido'}`,
      `- Browser: ${p.environment?.browser ?? '?'} (playwright ${p.environment?.playwright ?? '?'})`,
      `- SO: ${p.environment?.os ?? '?'} | Node: ${p.environment?.node ?? '?'}`,
      `- Thresholds: pixelmatch ${p.thresholds?.pixelmatch ?? '?'} | fit ${p.thresholds?.fit ?? '?'} | tolerância de mismatch ${p.thresholds?.mismatchTolerance ?? '?'}`,
    );
  }
  lines.push(
    '',
    '## Saida',
    '',
    '- Manifest: manifest.json',
    '- Galeria: index.html',
    '',
    '> Anexe os prints manualmente no card. O motor nunca faz upload no Jira.',
    '',
  );
  fs.writeFileSync(summaryPath, lines.join('\n'));
  return summaryPath;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test packages/core/test/manifest.test.js packages/core/test/output.test.js`
Expected: PASS (incluindo os testes pré-existentes de summary — o formato das linhas existentes não muda).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/manifest.js packages/core/src/output.js packages/core/test/manifest.test.js packages/core/test/output.test.js
git commit -m "feat(core): manifesto e summary carregam proveniencia do run"
```

---

### Task 5: `collectProvenance` no web

**Files:**
- Create: `packages/web/src/provenance.js`
- Test: `packages/web/test/provenance.test.js` (novo)

**Interfaces:**
- Consumes: `DEFAULT_THRESHOLD` do core (Task 1), via barrel `@gol-smiles/anemoi-core`.
- Produces: `collectProvenance({repo, anemoiDir?}) -> {anemoi: {version, commit}, tangerina: {commit}, environment: {os, node, browser, playwright}, capture: {deviceScaleFactor, viewportHeight, waitUntil, animations}, thresholds: {pixelmatch, mismatchTolerance, fit}}`. Campos indisponíveis viram `null` (best-effort, nunca lança). Task 7 chama `collectProvenance({repo})`. NÃO adicionar ao barrel `src/index.js` (módulo interno).

- [ ] **Step 1: Escrever os testes que falham**

Criar `packages/web/test/provenance.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {collectProvenance} = require('../src/provenance');

function git(cwd, ...args) {
  execFileSync('git', ['-c', 'user.email=t@t.dev', '-c', 'user.name=t', ...args], {cwd, stdio: 'ignore'});
}

test('collectProvenance: repo sem git => commit null, resto preenchido', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-'));
  const p = collectProvenance({repo});
  assert.equal(p.tangerina.commit, null);
  assert.equal(p.environment.node, process.version);
  assert.equal(p.environment.browser, 'chromium');
  assert.equal(p.thresholds.pixelmatch, 0.1);
  assert.equal(p.thresholds.mismatchTolerance, 0);
  assert.equal(p.thresholds.fit, 'union');
  assert.equal(p.capture.deviceScaleFactor, 2);
  assert.equal(p.capture.viewportHeight, 900);
});

test('collectProvenance: repo git => commit hex de 40 chars', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-git-'));
  git(repo, 'init');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'x');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'x');
  const p = collectProvenance({repo});
  assert.match(p.tangerina.commit, /^[0-9a-f]{40}$/);
});

test('collectProvenance: versao do anemoi vem do package.json do web', () => {
  const p = collectProvenance({repo: os.tmpdir()});
  assert.equal(p.anemoi.version, require('../package.json').version);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test packages/web/test/provenance.test.js`
Expected: FAIL — `Cannot find module '../src/provenance'`.

- [ ] **Step 3: Criar `packages/web/src/provenance.js`**

```js
'use strict';
// Proveniencia do run: versoes, commits e parametros de captura registrados no
// manifesto para a evidencia ser reprodutivel. Coleta best-effort: campo
// indisponivel vira null, nunca lanca.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {DEFAULT_THRESHOLD} = require('@gol-smiles/anemoi-core');

function gitCommit(cwd) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {cwd, stdio: ['ignore', 'pipe', 'ignore']})
      .toString().trim();
  } catch {
    return null;
  }
}

function packageVersion(packageJsonPath) {
  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

function playwrightVersion() {
  try {
    return require('playwright/package.json').version;
  } catch {
    return null;
  }
}

function collectProvenance({repo, anemoiDir = path.resolve(__dirname, '..')}) {
  return {
    anemoi: {
      version: packageVersion(path.join(anemoiDir, 'package.json')),
      commit: gitCommit(anemoiDir),
    },
    tangerina: {commit: gitCommit(repo)},
    environment: {
      os: `${process.platform} ${os.release()}`,
      node: process.version,
      browser: 'chromium',
      playwright: playwrightVersion(),
    },
    // Espelha os parametros fixos de captureCells (core/src/capture.js).
    capture: {deviceScaleFactor: 2, viewportHeight: 900, waitUntil: 'networkidle', animations: 'disabled'},
    thresholds: {pixelmatch: DEFAULT_THRESHOLD, mismatchTolerance: 0, fit: 'union'},
  };
}

module.exports = {collectProvenance};
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test packages/web/test/provenance.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/provenance.js packages/web/test/provenance.test.js
git commit -m "feat(web): collectProvenance coleta commits, versoes e parametros de captura"
```

---

### Task 6: galeria sinaliza divergência de dimensão

**Files:**
- Modify: `packages/core/src/output.js` (apenas o script embutido de `renderHtml`)
- Test: `packages/core/test/output.test.js`

**Interfaces:**
- Consumes: parity entries com `sizeMatch` (Task 2).
- Produces: galeria trata `sizeMatch === false` como divergência (badge vermelho `≠dim`, chip de story divergente, aba Diff no lightbox), mantendo compatibilidade com manifests antigos sem o campo.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar em `packages/core/test/output.test.js`:

```js
test('renderHtml: divergencia de dimensao marca badge mesmo com mismatch 0', () => {
  const html = renderHtml(grid({
    cellCount: 1,
    axes: {frameworks: ['wc', 'react']},
    groups: [{
      label: 'gol · Primary · sm · light',
      wc: 'a.png', react: 'b.png',
      parity: [{against: 'react', mismatch: 0, width: 40, height: 40, sizeMatch: false, diffPath: 'd.png'}],
    }],
  }));
  assert.match(html, /const isBad/);
  assert.match(html, /≠dim/);
  assert.ok(html.includes('"sizeMatch":false'));
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test packages/core/test/output.test.js`
Expected: FAIL — `isBad` e `≠dim` não existem no HTML gerado.

- [ ] **Step 3: Implementar no script embutido de `renderHtml`**

Cinco edições pontuais no template string de `renderHtml` em `packages/core/src/output.js`:

1. Logo após `const hasParity = CELLS.some((c) => (c.parity || []).length);` adicionar:

```js
  // Divergente: pixels diferentes OU dimensoes de captura distintas.
  const isBad = (p) => p.mismatch > 0 || p.sizeMatch === false;
```

2. Substituir a função `fmtParity` inteira por:

```js
  // '✓' | '≠dim' (so dimensao) | 'Npx' (manifests antigos sem area) | percentual pt-BR, com sufixo ≠dim.
  function fmtParity(p) {
    const dim = p.sizeMatch === false ? ' ≠dim' : '';
    if (p.mismatch === 0) return dim ? '≠dim' : '✓';
    if (!p.width || !p.height) return p.mismatch + 'px' + dim;
    const pct = (p.mismatch / (p.width * p.height)) * 100;
    return (pct < 0.1 ? '<0,1%' : pct.toFixed(1).replace('.', ',') + '%') + dim;
  }
```

3. No `failingByStory`, trocar `if ((c.parity || []).some((p) => p.mismatch > 0)) {` por:

```js
    if ((c.parity || []).some(isBad)) {
```

4. Nas pills da coluna de paridade, trocar `const ok = p.mismatch === 0;` por:

```js
              const ok = !isBad(p);
```

5. No `viewsOf` do lightbox, trocar `if (p.diffPath && p.mismatch > 0)` por:

```js
      if (p.diffPath && isBad(p)) v.push({label: 'Diff ' + fwLabel(p.against), src: p.diffPath});
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test packages/core/test/output.test.js`
Expected: PASS — incluindo os testes pré-existentes (`/function fmtParity/`, `<0,1%`, `toFixed(1).replace` e os de badge/chips continuam válidos).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/output.js packages/core/test/output.test.js
git commit -m "feat(core): galeria sinaliza divergencia de dimensao (≠dim) como paridade quebrada"
```

---

### Task 7: CLI — manifesto honesto, `--fail-on-diff`, códigos de saída e proveniência

**Files:**
- Modify: `packages/web/src/run.js`
- Modify: `packages/web/bin/anemoi-web.js`
- Modify: `docs/guides/web.md`
- Test: `packages/web/test/run-exit.test.js` (novo)

**Interfaces:**
- Consumes: `capturePipeline` com status honesto (Task 3), `collectProvenance({repo})` (Task 5), `buildManifest` com `provenance` (Task 4 — flui via spread de `manifestMeta` no pipeline, sem mudança no pipeline).
- Produces: `resolveExitCode(manifest, {failOnDiff}) -> 0 | 1` exportado de `run.js`; contrato de códigos de saída do CLI: `0` ok, `1` paridade divergente com `--fail-on-diff`, `2` erro de execução. `parseArgs` já trata `--fail-on-diff` como boolean genérico — nenhuma mudança em `args.js`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `packages/web/test/run-exit.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {resolveExitCode} = require('../src/run');

test('resolveExitCode: 1 somente com failOnDiff e status failed', () => {
  assert.equal(resolveExitCode({status: 'failed'}, {failOnDiff: true}), 1);
  assert.equal(resolveExitCode({status: 'failed'}, {failOnDiff: false}), 0);
  assert.equal(resolveExitCode({status: 'passed'}, {failOnDiff: true}), 0);
  assert.equal(resolveExitCode({status: 'passed'}, {}), 0);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test packages/web/test/run-exit.test.js`
Expected: FAIL — `resolveExitCode is not a function`.

- [ ] **Step 3: Implementar em `packages/web/src/run.js`**

1. Adicionar o require (junto aos outros requires locais):

```js
const {collectProvenance} = require('./provenance');
```

2. Adicionar a função antes de `runCurrentState`:

```js
// Codigo de saida do gate de paridade: 1 apenas quando --fail-on-diff esta
// ligado e a paridade divergiu. Erros de execucao saem com 2 via bin (throw).
function resolveExitCode(manifest, {failOnDiff = false} = {}) {
  return failOnDiff && manifest.status === 'failed' ? 1 : 0;
}
```

3. Na chamada de `capturePipeline`, ligar o status honesto e anexar a proveniência ao `manifestMeta`:

```js
    const {manifest, captures} = await capturePipeline({
      cells,
      acquireHost,
      runDir,
      statusFromParity: true,
      manifestMeta: {
        tool: 'Anemoi Web',
        card,
        component,
        mode: 'current',
        provenance: collectProvenance({repo}),
        axes: {
          frameworks,
          stories: stories.map(s => s.name),
          themes,
          viewports,
          brands,
        },
      },
      onStage: (s) => {
        stage = s;
        if (s === 'parity') console.log('\n⬛ Computando paridade…');
      },
      onProgress: ({index, total, relPath}) => {
        process.stdout.write(`  [${index}/${total}] ${relPath}\n`);
      },
    });
```

4. Substituir o log final de sucesso:

```js
    console.log(`\n✅ Concluído! ${captures.length} prints em: ${runDir}`);
    console.log(`   Galeria: ${path.join(runDir, 'index.html')}`);
```

por:

```js
    if (manifest.status === 'failed') {
      console.log(`\n❌ Paridade divergente — ${captures.length} prints em: ${runDir}`);
    } else {
      console.log(`\n✅ Concluído! ${captures.length} prints em: ${runDir}`);
    }
    console.log(`   Galeria: ${path.join(runDir, 'index.html')}`);
    const exitCode = resolveExitCode(manifest, {failOnDiff: Boolean(args['fail-on-diff'])});
    if (exitCode !== 0) process.exitCode = exitCode;
```

(Importante: divergência de paridade NÃO lança — se lançasse, o `catch` gravaria um failure manifest por cima do manifesto de bundle. `process.exitCode` deixa o processo terminar normalmente com o código certo.)

5. Atualizar o export:

```js
module.exports = {createRunDir, prepareCapture, resolveExitCode, runCurrentState};
```

6. Em `packages/web/bin/anemoi-web.js`, substituir o conteúdo por:

```js
#!/usr/bin/env node
// Codigos de saida: 0 = ok; 1 = paridade divergente com --fail-on-diff; 2 = erro de execucao.
const {runCli} = require('../src/cli');
runCli(process.argv.slice(2)).catch(err => {
  console.error(err.message || err);
  process.exit(2);
});
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test packages/web/test/run-exit.test.js && npm test`
Expected: PASS no teste novo e na suíte completa. Verificado previamente: nenhum teste existente depende do exit code do bin nem do log final (`run-stage.test.js` só faz uma asserção por regex sobre a região `stage = 'story-args'`, que esta task não toca; `run-paths.test.js` só testa `createRunDir`).

- [ ] **Step 5: Atualizar `docs/guides/web.md`**

Quatro edições:

1. Adicionar à tabela de flags (após a linha de `--skip-build`):

```markdown
| `--fail-on-diff` | Encerra com código de saída 1 quando qualquer comparação de paridade diverge (pixels ou dimensões). Sem a flag, a divergência ainda aparece no manifesto (`status: "failed"`), mas o processo sai com 0. |
```

2. Substituir o parágrafo da seção "Estrutura do output" que começa com `No sucesso, `manifest.json` contém`:

```markdown
`manifest.json` contém `tool: "Anemoi Web"`, eixos, contagem de células, grupos de paridade e a
proveniência do run (commits do Anemoi e do consumidor, browser, Node, thresholds e parâmetros de
captura). `status` reflete a paridade: `"passed"` somente quando nenhuma comparação divergiu em
pixels nem em dimensões; caso contrário, `"failed"`. `summary.md` resume o run, incluindo a
proveniência. `index.html` usa caminhos relativos e pode ser aberto offline para comparar WC, React
e Angular lado a lado.
```

3. Na seção "Interpretação da paridade", substituir os dois primeiros bullets:

```markdown
- `mismatch: 0` com `sizeMatch: true` significa paridade de pixels na união das dimensões capturadas.
- `mismatch > 0` ou `sizeMatch: false` indica divergência naquele wrapper e naquela célula; abra o
  PNG em `diff/` e a galeria para localizar o sinal. Área que existe em apenas uma das capturas
  conta como divergência (o diff usa a união das dimensões, não a interseção).
```

4. Adicionar nova seção antes de "Interpretação da paridade":

```markdown
## Códigos de saída

| Código | Significado |
| --- | --- |
| `0` | Execução completa; sem `--fail-on-diff`, mesmo com paridade divergente. |
| `1` | Paridade divergente com `--fail-on-diff` ativo. O manifesto de bundle é preservado com `status: "failed"`. |
| `2` | Erro de execução (build, captura, configuração). Quando o diretório do run já existia, um manifesto de falha com `stage` e `logPath` é gravado. |

Para bloquear CI apenas em divergência real, rode com `--fail-on-diff` e trate `2` como falha de
infraestrutura, não de paridade.
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/run.js packages/web/bin/anemoi-web.js packages/web/test/run-exit.test.js docs/guides/web.md
git commit -m "feat(web): manifesto honesto por padrao, --fail-on-diff e proveniencia no CLI"
```

---

### Task 8: verificação end-to-end contra o consumidor real

**Files:**
- Nenhum arquivo novo — validação manual do fluxo completo.

**Interfaces:**
- Consumes: tudo das Tasks 1–7.
- Produces: evidência de que o gate reproduz o caso real do plano (`Com Icone` de `tgr-button` divergente ⇒ `status: "failed"` e exit 1).

- [ ] **Step 1: Rodar a suíte completa**

Run: `npm test` (na raiz do anemoi)
Expected: PASS em core, web e service.

- [ ] **Step 2: Rodar o caso real que motivou a Fase 0**

Run (usa o alias configurado no `.anemoi.local.json`; se não houver, use `--repo /Users/user/Documents/projects/tangerina-ds/tangerina-web-core`):

```bash
npm run web -- --repo tangerina --component tgr-button --fail-on-diff; echo "exit=$?"
```

Expected:
- saída termina com `❌ Paridade divergente — … prints em: …` e `exit=1`;
- `manifest.json` do run com `status: "failed"`, bloco `provenance` preenchido (commits não-nulos, `thresholds.pixelmatch: 0.1`, `fit: "union"`) e entries de parity com `sizeMatch`;
- `summary.md` com a seção `## Proveniência`;
- galeria marcando as células de `Com Icone` como divergentes.

- [ ] **Step 3: Confirmar o comportamento sem a flag**

Run:

```bash
npm run web -- --repo tangerina --component tgr-button --stories Primary; echo "exit=$?"
```

Expected: `exit=0` e manifesto `passed` (story só de args, sem render customizado). Se `Primary` não existir, escolha outra story listada por `--list-stories` que não seja `Com Icone`.

- [ ] **Step 4: Nada a commitar**

Validação manual; se algo falhar, volte à task correspondente antes de encerrar o plano.
