# Deepening do Pipeline de Captura (manifest único + capturePipeline + barrel + parity unificada) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colapsar as quatro fricções centrais da revisão de arquitetura de 2026-07-15: um `buildManifest` único no core, um `capturePipeline` compartilhado entre CLI e service, a interface pública (barrel) do pacote web, e uma `computeParity` única parametrizada por pares.

**Architecture:** O `service` reimplementou o pipeline do `web` (capture → parity → manifest → galeria) em vez de embrulhá-lo. Este plano extrai o orquestrador profundo `capturePipeline({cells, acquireHost, runDir, pairs, manifestMeta})` em `packages/web/src/pipeline.js`; CLI (`run.js`) e service (`runner.js`) viram callers finos. O formato do manifesto passa a nascer em `buildManifest`/`buildFailureManifest` (`packages/core/src/manifest.js`), única fonte da verdade. `computeParity` (web) absorve `computeParityPair` (service) via opção `{pairs}`. Por fim, `packages/web/src/index.js` publica a interface do pacote e o `service` para de furar `anemoi-web/src/...` (9 imports por subpath viram 1 seam).

**Tech Stack:** Node >= 24, CommonJS, `node:test` (runner nativo), Playwright (já dependência do core), pngjs (fixtures de teste). Zero dependências novas.

## Global Constraints

- Node `>= 24` (campo `engines` de todos os pacotes); CommonJS com `require`.
- Testes com o runner nativo: `node --test` (script `test` de cada pacote). Nenhuma dependência nova em nenhum `package.json`.
- Comentários de código em pt-BR **sem acentos** (padrão do repo: "celula", "seguranca", "nucleo"); strings de console podem ter acentos (padrão existente: "Concluído", "célula(s)").
- Novos arquivos em `packages/web` e `packages/service` começam com `'use strict';` (padrão desses pacotes); novos arquivos em `packages/core` **não** usam `'use strict'` (padrão do core).
- Mensagens de commit no padrão do histórico: `tipo(pacote): descricao em pt-BR` (ex.: `feat(core): ...`, `refactor(service): ...`).
- Git identity: commits só com `rafaelhayashi@brq.com` (verifique com `git config user.email` antes do primeiro commit).
- **Pré-requisito:** a working tree contém WIP não commitado (mudanças de background/environment em `packages/web/src/hosts/*`, `storyArgs.js`, `packages/core/src/capture.js` etc.). Commitar (ou finalizar) esse WIP ANTES de executar a Task 1. Nenhuma task deste plano toca `hosts/environment.js`, `storyArgs.js` ou os harnesses.
- Os testes de `pipeline` (Task 4) e os de `runner` do service lançam Chromium via Playwright — os browsers já precisam estar instalados (`npx playwright install chromium` se necessário).
- Contratos que NÃO podem mudar: `packages/service/test/runner.test.js` e `packages/web/test/failure.test.js` passam **sem edição** ao final de cada task que toca seus módulos (são os testes de contrato deste refactor). `packages/service/test/kobaContract.test.js` idem.

---

### Task 1: `buildManifest`/`buildFailureManifest` no core

**Files:**
- Create: `packages/core/src/manifest.js`
- Modify: `packages/core/src/index.js`
- Test: `packages/core/test/manifest.test.js`

**Interfaces:**
- Consumes: nada (módulo puro, sem I/O).
- Produces:
  - `buildManifest({tool, status='passed', card, component, mode, layout='parity', parityLabel='Paridade vs wc', axes={}, cellCount=0, groups=[], compareState?, runDir, now=new Date()}) → objeto manifest` — lança `Error(/campo obrigatorio ausente: <nome>/)` se `tool`, `card`, `component`, `mode` ou `runDir` faltarem. `compareState` só entra no objeto se fornecido.
  - `buildFailureManifest({tool='Anemoi Web', stage, card, component, error, logPath, runDir, now=new Date()}) → objeto manifest de falha` (status `'failed'`, sem `groups`/`cellCount`/`axes`).
  - Ambos exportados também pelo barrel `@gol-smiles/anemoi-core`.

- [ ] **Step 1: Write the failing test**

Criar `packages/core/test/manifest.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildManifest, buildFailureManifest} = require('../src/manifest');

const NOW = new Date('2026-07-15T12:00:00.000Z');

test('buildManifest: defaults de bundle (passed, parity, eixos vazios)', () => {
  const m = buildManifest({
    tool: 'Anemoi Web', card: 'CDCOM-1', component: 'tgr-button',
    mode: 'current', runDir: '/tmp/run', now: NOW,
  });
  assert.equal(m.tool, 'Anemoi Web');
  assert.equal(m.status, 'passed');
  assert.equal(m.mode, 'current');
  assert.equal(m.layout, 'parity');
  assert.equal(m.parityLabel, 'Paridade vs wc');
  assert.deepEqual(m.axes, {});
  assert.deepEqual(m.groups, []);
  assert.equal(m.cellCount, 0);
  assert.equal(m.generatedAt, '2026-07-15T12:00:00.000Z');
  assert.equal(m.runDir, '/tmp/run');
  assert.ok(!('compareState' in m));
});

test('buildManifest: campos opcionais entram quando fornecidos', () => {
  const m = buildManifest({
    tool: 'Anemoi Service', status: 'failed', card: 'koba', component: 'tgr-button',
    mode: 'koba-state', parityLabel: 'Paridade vs react',
    axes: {frameworks: ['react', 'angular']}, cellCount: 2, groups: [{label: 'g'}],
    compareState: {componentKey: 'tgr-button'}, runDir: '/tmp/run', now: NOW,
  });
  assert.equal(m.status, 'failed');
  assert.equal(m.parityLabel, 'Paridade vs react');
  assert.equal(m.cellCount, 2);
  assert.deepEqual(m.groups, [{label: 'g'}]);
  assert.deepEqual(m.compareState, {componentKey: 'tgr-button'});
});

test('buildManifest: lanca em campo obrigatorio ausente', () => {
  const base = {tool: 't', card: 'c', component: 'x', mode: 'current', runDir: '/tmp'};
  for (const field of ['tool', 'card', 'component', 'mode', 'runDir']) {
    const incomplete = {...base};
    delete incomplete[field];
    assert.throws(() => buildManifest(incomplete), new RegExp(`campo obrigatorio ausente: ${field}`));
  }
});

test('buildFailureManifest: falha de execucao sem grade, com diagnostico', () => {
  const m = buildFailureManifest({
    stage: 'capture', card: 'CDCOM-1', component: 'tgr-button',
    error: 'boom', logPath: 'logs/capture.log', runDir: '/tmp/run', now: NOW,
  });
  assert.equal(m.tool, 'Anemoi Web');
  assert.equal(m.status, 'failed');
  assert.equal(m.stage, 'capture');
  assert.equal(m.error, 'boom');
  assert.equal(m.logPath, 'logs/capture.log');
  assert.equal(m.generatedAt, '2026-07-15T12:00:00.000Z');
  assert.ok(!('groups' in m));
  assert.ok(!('cellCount' in m));
});

test('barrel do core exporta buildManifest e buildFailureManifest', () => {
  const core = require('../src/index');
  assert.equal(typeof core.buildManifest, 'function');
  assert.equal(typeof core.buildFailureManifest, 'function');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/core/test/manifest.test.js`
Expected: FAIL — `Cannot find module '../src/manifest'`

- [ ] **Step 3: Write minimal implementation**

Criar `packages/core/src/manifest.js`:

```js
// Unica fonte da verdade do formato do manifest.json.
// Todo produtor (CLI web, service, failure) monta o manifesto por aqui;
// renderHtml/writeSummary podem confiar nas chaves garantidas.

function requireFields(fields) {
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') {
      throw new Error(`buildManifest: campo obrigatorio ausente: ${name}`);
    }
  }
}

// Manifesto de bundle (grade + paridade). status 'failed' aqui significa
// "paridade divergente", nao erro de execucao (esse e o buildFailureManifest).
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
  runDir,
  now = new Date(),
}) {
  requireFields({tool, card, component, mode, runDir});
  return {
    tool,
    status,
    card,
    component,
    mode,
    layout,
    parityLabel,
    axes,
    cellCount,
    groups,
    ...(compareState !== undefined ? {compareState} : {}),
    generatedAt: now.toISOString(),
    runDir,
  };
}

// Manifesto de falha de execucao: sem grade, com diagnostico apontando o log.
function buildFailureManifest({
  tool = 'Anemoi Web',
  stage,
  card,
  component,
  error,
  logPath,
  runDir,
  now = new Date(),
}) {
  requireFields({tool, card, component, runDir});
  return {
    tool,
    status: 'failed',
    stage,
    card,
    component,
    generatedAt: now.toISOString(),
    runDir,
    error,
    logPath,
  };
}

module.exports = {buildManifest, buildFailureManifest};
```

Em `packages/core/src/index.js`, adicionar a linha do manifest:

```js
module.exports = {
  ...require('./diff'),
  ...require('./server'),
  ...require('./matrix'),
  ...require('./capture'),
  ...require('./output'),
  ...require('./manifest'),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/core/test/manifest.test.js`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/manifest.js packages/core/src/index.js packages/core/test/manifest.test.js
git commit -m "feat(core): buildManifest como fonte unica do formato do manifesto"
```

---

### Task 2: Produtores adotam `buildManifest`; fixtures de `output.test.js` viram verdade

**Files:**
- Modify: `packages/web/src/run.js:9-17` (require) e `packages/web/src/run.js:233-257` (montagem do manifesto)
- Modify: `packages/service/src/runner.js:13` (require) e `packages/service/src/runner.js:58-78` (montagem do manifesto)
- Modify: `packages/web/src/failure.js` (arquivo inteiro, encolhe)
- Modify: `packages/core/src/output.js:18-21` (writeSummary) e `packages/core/src/output.js:55-81` (renderHtml, defaults defensivos)
- Test: `packages/core/test/output.test.js` (reescrito para construir fixtures via `buildManifest`)

**Interfaces:**
- Consumes: `buildManifest`/`buildFailureManifest` e `writeManifest` de `@gol-smiles/anemoi-core` (Task 1).
- Produces: `writeFailureManifest(runDir, context, error)` mantém a MESMA assinatura e o mesmo shape de retorno de hoje (`packages/web/test/failure.test.js` passa sem edição). `renderHtml`/`writeSummary` passam a exigir manifesto completo (construído via `buildManifest`) — deixam de aplicar defaults para `tool`, `status`, `axes`, `groups`, `parityLabel`.

- [ ] **Step 1: Reescrever `packages/core/test/output.test.js` (fixtures via buildManifest)**

Substituir o conteúdo COMPLETO do arquivo por:

```js
const {test} = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {writeManifest, writeSummary, renderHtml, escapeHtml} = require('../src/output');
const {buildManifest} = require('../src/manifest');

// Fixture canonica: passa pelo buildManifest — o mesmo caminho dos produtores reais.
function grid(overrides = {}) {
  return buildManifest({
    tool: 'Anemoi Web',
    card: 'CDCOM-99',
    component: 'tgr-button',
    mode: 'current',
    runDir: '/tmp/run',
    now: new Date('2026-07-15T00:00:00.000Z'),
    ...overrides,
  });
}

test('escapeHtml: escapa caracteres', () => {
  assert.equal(escapeHtml('<a>&"'), '&lt;a&gt;&amp;&quot;');
});

test('writeManifest: grava manifest.json formatado', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-'));
  const p = writeManifest(dir, grid({cellCount: 1, runDir: dir}));
  assert.ok(p.endsWith('manifest.json'));
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(parsed.component, 'tgr-button');
  assert.equal(parsed.cellCount, 1);
});

test('writeSummary: grava summary.md legivel', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-'));
  const p = writeSummary(dir, grid({
    cellCount: 1,
    runDir: dir,
    axes: {brands: ['gol'], stories: ['Primary'], viewports: ['sm'], themes: ['light']},
  }));
  const md = fs.readFileSync(p, 'utf8');
  assert.match(md, /tgr-button/);
  assert.match(md, /CDCOM-99/);
  assert.match(md, /Status: passed/);
  assert.match(md, /Prints: 1/);
});

test('renderHtml layout parity monta grade wc|react|angular', () => {
  const html = renderHtml(grid({
    cellCount: 1,
    axes: {frameworks: ['wc', 'react', 'angular'], stories: ['Primary'], themes: ['light'], viewports: ['sm'], brands: ['gol']},
    groups: [{
      label: 'gol · Primary · sm · light',
      wc: 'wc/gol/Primary/sm/light.png',
      react: 'react/gol/Primary/sm/light.png',
      angular: 'angular/gol/Primary/sm/light.png',
      parity: [{against: 'react', mismatch: 0}, {against: 'angular', mismatch: 0}],
    }],
  }));
  assert.match(html, /react\/gol\/Primary\/sm\/light\.png/);
  assert.match(html, /angular\/gol\/Primary\/sm\/light\.png/);
  assert.match(html, /paridade/i);
});

test('renderHtml embute parityLabel customizado no payload da galeria', () => {
  const html = renderHtml(grid({
    tool: 'Anemoi Service',
    mode: 'koba-state',
    cellCount: 2,
    parityLabel: 'Paridade vs react',
    axes: {frameworks: ['react', 'angular']},
    groups: [{
      label: 'gol · estado abc · sm · light',
      react: 'a.png', angular: 'b.png',
      parity: [{against: 'angular', mismatch: 0, diffPath: 'd.png'}],
    }],
  }));
  assert.ok(html.includes('"parityLabel":"Paridade vs react"'));
  assert.ok(!html.includes("'Paridade vs wc</th>'"));
});

test('renderHtml usa "Paridade vs wc" como parityLabel default (garantido pelo buildManifest)', () => {
  const html = renderHtml(grid());
  assert.ok(html.includes('"parityLabel":"Paridade vs wc"'));
});

test('renderHtml: badge de paridade usa percentual com fallback px', () => {
  const html = renderHtml(grid({
    cellCount: 1,
    axes: {frameworks: ['wc', 'react']},
    groups: [{
      label: 'gol · Primary · sm · light',
      wc: 'a.png', react: 'b.png',
      parity: [{against: 'react', mismatch: 8, width: 40, height: 40, diffPath: 'diff/react-vs-wc/x.png'}],
    }],
  }));
  assert.ok(html.includes('"width":40'));
  assert.ok(html.includes('"height":40'));
  assert.ok(html.includes('"diffPath":"diff/react-vs-wc/x.png"'));
  assert.match(html, /function fmtParity/);
  assert.match(html, /<0,1%/);
  assert.match(html, /toFixed\(1\)\.replace\('\.', ','\)/);
});

test('renderHtml: badge divergente e clicavel e lightbox tem aba Diff', () => {
  const html = renderHtml(grid({
    cellCount: 1,
    axes: {frameworks: ['wc', 'react']},
    groups: [{
      label: 'gol · Primary · sm · light',
      wc: 'a.png', react: 'b.png',
      parity: [{against: 'react', mismatch: 8, width: 40, height: 40, diffPath: 'diff/react-vs-wc/x.png'}],
    }],
  }));
  assert.match(html, /function viewsOf/);
  assert.match(html, /'Diff ' \+ fwLabel/);
  assert.match(html, /button class="pill bad diff"/);
});

test('renderHtml: cabecalho lista stories divergentes como chips clicaveis', () => {
  const html = renderHtml(grid({
    cellCount: 2,
    axes: {frameworks: ['wc', 'react']},
    groups: [
      {label: 'gol · Com Icone · sm · light', wc: 'a.png', react: 'b.png',
        parity: [{against: 'react', mismatch: 8, width: 40, height: 40, diffPath: 'd.png'}]},
      {label: 'gol · Loading · sm · light', wc: 'c.png', react: 'd2.png',
        parity: [{against: 'react', mismatch: 0, width: 40, height: 40, diffPath: 'd3.png'}]},
    ],
  }));
  assert.match(html, /class="schip"/);
  assert.match(html, /failingByStory/);
  assert.ok(!html.includes("'px de divergência'"));
  assert.ok(!html.includes('totalDiff'));
});

test('renderHtml: prints em tamanho real com scroll por celula', () => {
  const html = renderHtml(grid({
    cellCount: 1,
    axes: {frameworks: ['wc', 'react']},
    groups: [{label: 'gol · Primary · sm · light', wc: 'a.png', react: 'b.png', parity: []}],
  }));
  assert.ok(!/\.shot \{[^}]*width:150px/.test(html));
  assert.match(html, /table-layout:fixed/);
  assert.match(html, /class="shotwrap"/);
  assert.match(html, /naturalWidth\s*\/\s*2/);
});
```

- [ ] **Step 2: Run test to verify current defaults still satisfy it (deve passar ANTES da limpeza)**

Run: `node --test packages/core/test/output.test.js`
Expected: PASS (10 testes) — os defaults defensivos ainda existem, mas as fixtures agora vêm do `buildManifest`.

- [ ] **Step 3: Remover defaults defensivos de `output.js` (agora garantidos pelo buildManifest)**

Em `packages/core/src/output.js`, no `writeSummary` (linhas 18-28), trocar:

```js
  const tool = manifest.tool || 'Anemoi';
  const axes = manifest.axes || {};
```
por:
```js
  const tool = manifest.tool;
  const axes = manifest.axes;
```
e trocar `` `- Status: ${manifest.status || 'passed'}`, `` por `` `- Status: ${manifest.status}`, ``.

No `renderHtml` (linhas 56-81), trocar:

```js
  const tool = manifest.tool || 'Anemoi';
  const axes = manifest.axes || {};
```
por:
```js
  const tool = manifest.tool;
  const axes = manifest.axes;
```
trocar `const groups = manifest.groups || [];` por `const groups = manifest.groups;`,
trocar `status: manifest.status || 'passed',` por `status: manifest.status,`,
e trocar `parityLabel: manifest.parityLabel || 'Paridade vs wc',` por `parityLabel: manifest.parityLabel,`.

**Manter** o fallback de exibição `frameworks = (axes.frameworks && axes.frameworks.length) ? axes.frameworks : ['wc','react','angular']` — é regra de display, não de contrato.

- [ ] **Step 4: Run test to verify it still passes**

Run: `node --test packages/core/test/output.test.js`
Expected: PASS (10 testes)

- [ ] **Step 5: Adotar buildManifest em `packages/web/src/run.js`**

No bloco de require (linhas 9-17), adicionar `buildManifest`:

```js
const {
  buildMatrix,
  serveStatic,
  captureCells,
  buildManifest,
  writeManifest,
  writeSummary,
  renderHtml,
  assertSafePathSegment,
} = require('@gol-smiles/anemoi-core');
```

Substituir a montagem literal do manifesto (linhas 235-253, o objeto `const manifest = {...};`) por:

```js
    const manifest = buildManifest({
      tool: 'Anemoi Web',
      card,
      component,
      mode: 'current',
      axes: {
        frameworks,
        stories: stories.map(s => s.name),
        themes,
        viewports,
        brands,
      },
      cellCount: allCaptures.length,
      groups,
      runDir,
    });
```

- [ ] **Step 6: Adotar buildManifest em `packages/service/src/runner.js`**

Na linha 13, adicionar `buildManifest` ao destructure do core:

```js
const {captureCells, buildManifest, writeManifest, writeSummary, renderHtml} = require('@gol-smiles/anemoi-core');
```

Substituir a montagem literal do manifesto (linhas 58-78, o objeto `const manifest = {...};`) por:

```js
    const manifest = buildManifest({
      tool: 'Anemoi Service',
      status,
      card: run.card,
      component: run.component,
      mode: 'koba-state',
      parityLabel: 'Paridade vs react',
      axes: {
        frameworks,
        stories: [cells[0].storyName],
        themes: ['light'],
        viewports: [...new Set(cells.map(cell => cell.viewport))],
        brands: ['gol'],
      },
      cellCount: captures.length,
      groups,
      compareState: state,
      runDir,
    });
```

- [ ] **Step 7: Adotar buildFailureManifest em `packages/web/src/failure.js`**

Substituir o conteúdo COMPLETO do arquivo por:

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {buildFailureManifest, writeManifest} = require('@gol-smiles/anemoi-core');

function writeFailureManifest(runDir, context, error) {
  const runRoot = path.resolve(runDir);
  fs.rmSync(path.join(runRoot, 'index.html'), {force: true});
  const logPath = path.join(runRoot, 'logs', `${String(context.stage || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '-')}.log`);
  const sourceLogPath = error?.logPath && path.resolve(error.logPath);

  fs.mkdirSync(path.dirname(logPath), {recursive: true});
  let persistedLog = sourceLogPath === logPath && fs.existsSync(logPath);
  if (!persistedLog && sourceLogPath && fs.existsSync(sourceLogPath)) {
    try {
      fs.copyFileSync(sourceLogPath, logPath);
      persistedLog = true;
    } catch {
      // Mantem o manifesto autocontido mesmo quando um log externo nao pode ser lido.
    }
  }
  if (!persistedLog) {
    fs.writeFileSync(logPath, `${error?.stack || error?.message || String(error)}\n`);
  }

  const manifest = buildFailureManifest({
    stage: context.stage,
    card: context.card,
    component: context.component,
    error: error?.message || String(error),
    logPath: path.relative(runRoot, logPath),
    runDir,
  });
  writeManifest(runRoot, manifest);
  return manifest;
}

module.exports = {writeFailureManifest};
```

- [ ] **Step 8: Run all affected package tests**

Run: `node --test packages/core/test/ && (cd packages/web && node --test) && (cd packages/service && node --test)`
Expected: PASS em todos — em particular `failure.test.js` (4 testes) e `runner.test.js` (4 testes) passam SEM edição.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/output.js packages/core/test/output.test.js packages/web/src/run.js packages/web/src/failure.js packages/service/src/runner.js
git commit -m "refactor: manifesto nasce so no buildManifest; fixtures de output viram verdade"
```

---

### Task 3: `computeParity` parametrizada por pares; deletar `computeParityPair`

**Files:**
- Modify: `packages/web/src/parity.js:22-43`
- Modify: `packages/service/src/runner.js:14,17,50` (troca de import e chamada)
- Delete: `packages/service/src/parityPair.js`, `packages/service/test/parityPair.test.js`
- Test: `packages/web/test/parity.test.js` (novos casos de `pairs`)

**Interfaces:**
- Consumes: `writeDiff`, `assertSafePathSegment` de `@gol-smiles/anemoi-core` (inalterado).
- Produces: `computeParity(groups, runDir, {pairs = [{reference:'wc', against:'react'}, {reference:'wc', against:'angular'}]} = {}) → groups com parity[]`. Cada par grava o diff em `diff/<against>-vs-<reference>/<brand>-<storyId>-<viewport>-<theme>.png` e empurra `{against, mismatch, width, height, diffPath}`. Comportamento default idêntico ao atual (dirs `react-vs-wc` e `angular-vs-wc`).

- [ ] **Step 1: Write the failing tests**

Adicionar ao FINAL de `packages/web/test/parity.test.js`:

```js
test('computeParity com pairs customizado compara angular contra react', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-'));
  writeSolidPng(runDir, 'react.png', 10);
  writeSolidPng(runDir, 'angular.png', 240);
  const groups = [{
    label: 'gol · Primary · sm · light',
    react: 'react.png',
    angular: 'angular.png',
    _cell: {brand: 'gol', storyId: 'button--primary', viewport: 'sm', theme: 'light'},
  }];
  const [g] = computeParity(groups, runDir, {pairs: [{reference: 'react', against: 'angular'}]});
  assert.equal(g.parity.length, 1);
  assert.equal(g.parity[0].against, 'angular');
  assert.ok(g.parity[0].mismatch > 0);
  assert.match(g.parity[0].diffPath, /^diff\/angular-vs-react\//);
  assert.equal(g._cell, undefined);
});

test('computeParity pairs: parity vazio quando falta um dos lados', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-'));
  writeSolidPng(runDir, 'react.png', 10);
  const groups = [{
    label: 'gol · Primary · sm · light',
    react: 'react.png',
    _cell: {brand: 'gol', storyId: 'button--primary', viewport: 'sm', theme: 'light'},
  }];
  const [g] = computeParity(groups, runDir, {pairs: [{reference: 'react', against: 'angular'}]});
  assert.deepEqual(g.parity, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/web/test/parity.test.js`
Expected: FAIL — os 2 testes novos falham (computeParity ignora o 3º argumento e compara contra `wc`, que não existe no grupo → `parity` vazio no primeiro teste novo).

- [ ] **Step 3: Generalizar computeParity**

Em `packages/web/src/parity.js`, substituir a função `computeParity` (linhas 22-43) por:

```js
// Pares default do CLI: WC e o baseline padrao-ouro, react e angular comparados contra ele.
const DEFAULT_PAIRS = [
  {reference: 'wc', against: 'react'},
  {reference: 'wc', against: 'angular'},
];

// Compara cada par (reference x against) com writeDiff e GRAVA os PNGs de diff
// em <runDir>/diff/<against>-vs-<reference>/. Retorna os grupos com parity[].
function computeParity(groups, runDir, {pairs = DEFAULT_PAIRS} = {}) {
  return groups.map(g => {
    const parity = [];
    for (const {reference, against} of pairs) {
      if (g[reference] && g[against]) {
        const brand = assertSafePathSegment(g._cell.brand, 'brand');
        const storyId = assertSafePathSegment(g._cell.storyId, 'storyId');
        const viewport = assertSafePathSegment(g._cell.viewport, 'viewport');
        const theme = assertSafePathSegment(g._cell.theme, 'theme');
        const diffRel = path.join('diff', `${against}-vs-${reference}`, `${brand}-${storyId}-${viewport}-${theme}.png`);
        const {mismatch, width, height} = writeDiff(
          path.join(runDir, g[reference]), path.join(runDir, g[against]),
          ensureDir(path.join(runDir, diffRel)),
          {fit: 'intersection'},
        );
        parity.push({against, mismatch, width, height, diffPath: diffRel});
      }
    }
    const {_cell, ...rest} = g;
    return {...rest, parity};
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/web/test/parity.test.js`
Expected: PASS (5 testes — os 3 antigos cobrem o default `react-vs-wc`/`angular-vs-wc`, regressão garantida)

- [ ] **Step 5: Service passa a usar a computeParity unificada**

Em `packages/service/src/runner.js`:
- linha 14: trocar `const {groupByCell} = require('@gol-smiles/anemoi-web/src/parity');` por `const {groupByCell, computeParity} = require('@gol-smiles/anemoi-web/src/parity');`
- linha 17: deletar `const {computeParityPair} = require('./parityPair');`
- linha 50: trocar `const groups = computeParityPair(groupByCell(captures), runDir);` por:

```js
    const groups = computeParity(groupByCell(captures), runDir, {pairs: [{reference: 'react', against: 'angular'}]});
```

Deletar os arquivos:

```bash
git rm packages/service/src/parityPair.js packages/service/test/parityPair.test.js
```

- [ ] **Step 6: Run service tests (contrato ponta a ponta)**

Run: `cd packages/service && node --test && cd ../..`
Expected: PASS — `runner.test.js` confirma `diff/angular-vs-react/` e status failed/passed sem edição.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/parity.js packages/web/test/parity.test.js packages/service/src/runner.js
git commit -m "refactor: computeParity unica parametrizada por pares; remove computeParityPair"
```

---

### Task 4: `capturePipeline` no web (TDD com hosts fake)

**Files:**
- Create: `packages/web/src/pipeline.js`
- Test: `packages/web/test/pipeline.test.js`

**Interfaces:**
- Consumes: `captureCells`, `buildManifest`, `writeManifest`, `writeSummary`, `renderHtml` de `@gol-smiles/anemoi-core`; `groupByCell`, `computeParity` de `./parity` (Task 3).
- Produces: `capturePipeline({cells, acquireHost, runDir, pairs?, manifestMeta, statusFromParity=false, onStage=()=>{}, onProgress=()=>{}}) → Promise<{manifest, captures, groups}>`.
  - `cells`: células prontas (com `framework`, `component`, `brand`, `storyId`, `storyName`, `viewport`, `width`, `theme`, `args`).
  - `acquireHost`: `async (framework) => {host, url, release?}` — `release` (se presente) é chamado num `finally` após a captura daquele framework.
  - `manifestMeta`: `{tool, card, component, mode, parityLabel?, axes, compareState?}` — SEM `status`/`cellCount`/`groups`/`runDir` (o pipeline preenche).
  - `onStage(stage)` é chamado com `'capture'`, `'parity'`, `'output'` nessa ordem; `onProgress({framework, index, total, relPath})` a cada print.
  - `statusFromParity: true` → status `'failed'` se qualquer `parity.mismatch > 0`; caso contrário sempre `'passed'`.
  - Grava `manifest.json`, `summary.md` e `index.html` em `runDir`. Erros propagam (quem decide o que fazer é o caller).

- [ ] **Step 1: Write the failing test**

Criar `packages/web/test/pipeline.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const {capturePipeline} = require('../src/pipeline');

// Servidor estatico fake: serve `html` para qualquer path (simula um harness servido).
function serveEvidence(html) {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise(done => server.close(done)),
    }));
  });
}

// Host fake compativel com captureCells: recorta #evidence-root do server fake.
function fakeHost(framework) {
  return {
    framework,
    urlFor: (_cell, baseUrl) => `${baseUrl}/index.html`,
    selectorFor: () => '#evidence-root',
    verify: async (page) => { await page.waitForSelector('#evidence-root > *', {timeout: 5000}); },
  };
}

const evidenceHtml = (color) =>
  `<!doctype html><html><head><meta charset="utf-8"></head>`
  + `<body style="margin:0"><div id="evidence-root">`
  + `<div style="width:120px;height:48px;background:${color}"></div></div></body></html>`;

function cell(framework) {
  return {
    framework, component: 'tgr-fake', brand: 'gol',
    storyId: 'fake--primary', storyName: 'Primary',
    viewport: 'sm', width: 640, theme: 'light', args: {},
  };
}

function meta() {
  return {
    tool: 'Anemoi Web',
    card: 'CDCOM-1',
    component: 'tgr-fake',
    mode: 'current',
    axes: {frameworks: ['react', 'angular'], stories: ['Primary'], themes: ['light'], viewports: ['sm'], brands: ['gol']},
  };
}

async function withServers(colors, fn) {
  const servers = {};
  for (const [framework, color] of Object.entries(colors)) {
    servers[framework] = await serveEvidence(evidenceHtml(color));
  }
  try {
    return await fn(servers);
  } finally {
    for (const server of Object.values(servers)) await server.close();
  }
}

test('pipeline: captura por framework, paridade e bundle completo', async () => {
  await withServers({react: '#f60', angular: '#f60'}, async (servers) => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-pipeline-'));
    const stages = [];
    const released = [];

    const {manifest, captures} = await capturePipeline({
      cells: [cell('react'), cell('angular')],
      acquireHost: async (framework) => ({
        host: fakeHost(framework),
        url: servers[framework].url,
        release: async () => released.push(framework),
      }),
      runDir,
      pairs: [{reference: 'react', against: 'angular'}],
      manifestMeta: meta(),
      onStage: (s) => stages.push(s),
    });

    assert.deepEqual(stages, ['capture', 'parity', 'output']);
    assert.deepEqual(released, ['react', 'angular']);
    assert.equal(captures.length, 2);
    assert.equal(manifest.status, 'passed');
    assert.equal(manifest.cellCount, 2);
    assert.equal(manifest.groups.length, 1);
    assert.equal(manifest.groups[0].parity[0].against, 'angular');
    assert.equal(manifest.groups[0].parity[0].mismatch, 0);
    assert.ok(fs.existsSync(path.join(runDir, 'manifest.json')));
    assert.ok(fs.existsSync(path.join(runDir, 'summary.md')));
    assert.ok(fs.existsSync(path.join(runDir, 'index.html')));
  });
});

test('pipeline: statusFromParity acusa failed quando ha mismatch', async () => {
  await withServers({react: '#f60', angular: '#06f'}, async (servers) => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-pipeline-'));
    const {manifest} = await capturePipeline({
      cells: [cell('react'), cell('angular')],
      acquireHost: async (framework) => ({host: fakeHost(framework), url: servers[framework].url}),
      runDir,
      pairs: [{reference: 'react', against: 'angular'}],
      statusFromParity: true,
      manifestMeta: meta(),
    });
    assert.equal(manifest.status, 'failed');
    assert.match(manifest.groups[0].parity[0].diffPath, /^diff\/angular-vs-react\//);
  });
});

test('pipeline: release e chamado mesmo quando a captura falha', async () => {
  await withServers({react: '#f60'}, async (servers) => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-pipeline-'));
    const released = [];
    const brokenHost = {...fakeHost('react'), verify: async () => { throw new Error('hidratacao falhou'); }};
    await assert.rejects(
      capturePipeline({
        cells: [cell('react')],
        acquireHost: async () => ({host: brokenHost, url: servers.react.url, release: async () => released.push('react')}),
        runDir,
        manifestMeta: meta(),
      }),
      /hidratacao falhou/,
    );
    assert.deepEqual(released, ['react']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/web/test/pipeline.test.js`
Expected: FAIL — `Cannot find module '../src/pipeline'`

- [ ] **Step 3: Write the implementation**

Criar `packages/web/src/pipeline.js`:

```js
'use strict';
// Nucleo compartilhado do run: captura -> paridade -> manifesto/galeria.
// CLI (run.js) e service (runner.js) sao callers finos por cima deste modulo:
// fornecem as celulas prontas e um acquireHost(framework) -> {host, url, release?}.
// Erros propagam para o caller (que decide entre process.exit e run store).

const fs = require('node:fs');
const path = require('node:path');
const {
  captureCells,
  buildManifest,
  writeManifest,
  writeSummary,
  renderHtml,
} = require('@gol-smiles/anemoi-core');
const {groupByCell, computeParity} = require('./parity');

async function capturePipeline({
  cells,
  acquireHost,
  runDir,
  pairs,
  manifestMeta,
  statusFromParity = false,
  onStage = () => {},
  onProgress = () => {},
}) {
  onStage('capture');
  // Ordem estavel: frameworks na ordem de aparicao das celulas.
  const frameworks = [...new Set(cells.map(cell => cell.framework))];
  const captures = [];
  for (const framework of frameworks) {
    const cellsForFramework = cells.filter(cell => cell.framework === framework);
    const {host, url, release} = await acquireHost(framework);
    try {
      const captured = await captureCells(cellsForFramework, host, url, runDir, {
        onProgress: (index, total, relPath) => onProgress({framework, index, total, relPath}),
      });
      captures.push(...captured);
    } finally {
      if (release) await release();
    }
  }

  onStage('parity');
  const groups = computeParity(groupByCell(captures), runDir, pairs ? {pairs} : {});

  onStage('output');
  const parities = groups.flatMap(group => group.parity);
  const status = statusFromParity && parities.some(parity => parity.mismatch > 0)
    ? 'failed'
    : 'passed';
  const manifest = buildManifest({
    ...manifestMeta,
    status,
    cellCount: captures.length,
    groups,
    runDir,
  });
  writeManifest(runDir, manifest);
  writeSummary(runDir, manifest);
  fs.writeFileSync(path.join(runDir, 'index.html'), renderHtml(manifest), 'utf8');

  return {manifest, captures, groups};
}

module.exports = {capturePipeline};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/web/test/pipeline.test.js`
Expected: PASS (3 testes; lança Chromium — mais lento que os demais)

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pipeline.js packages/web/test/pipeline.test.js
git commit -m "feat(web): capturePipeline compartilhado captura->paridade->bundle"
```

---

### Task 5: CLI (`run.js`) adota o `capturePipeline`

**Files:**
- Modify: `packages/web/src/run.js` (requires; deleta `captureFramework`; substitui o trecho entre `stage = 'capture'` e o fim do `try`)

**Interfaces:**
- Consumes: `capturePipeline` de `./pipeline` (Task 4); `buildMatrix`, `serveStatic`, `assertSafePathSegment` de `@gol-smiles/anemoi-core`.
- Produces: `runCurrentState(args, cwd)` com o MESMO comportamento observável (mesmos arquivos no runDir, mesmos stages no failure manifest: `capture`/`parity`/`output`). `createRunDir` e `prepareCapture` inalterados.

- [ ] **Step 1: Atualizar requires de `run.js`**

Substituir o bloco de require do core (linhas 9-17 após a Task 2) por:

```js
const {
  buildMatrix,
  serveStatic,
  assertSafePathSegment,
} = require('@gol-smiles/anemoi-core');
```

Trocar a linha `const {groupByCell, computeParity} = require('./parity');` por:

```js
const {capturePipeline} = require('./pipeline');
```

(`captureCells`, `buildManifest`, `writeManifest`, `writeSummary`, `renderHtml`, `groupByCell` e `computeParity` deixam de ser usados diretamente pelo run.js.)

- [ ] **Step 2: Deletar o helper `captureFramework`**

Remover a função `captureFramework` inteira (linhas 48-68 do arquivo original — o comentário `// Captura o estado atual para um único framework.` e o corpo da função).

- [ ] **Step 3: Substituir o miolo captura→paridade→manifesto**

Dentro do `try` de `runCurrentState`, substituir TUDO desde a linha `// Captura por framework` / `stage = 'capture';` até (inclusive) as duas linhas de `console.log` de conclusão (`✅ Concluído!` e `Galeria:`) por:

```js
    // Captura + paridade + galeria via pipeline compartilhado
    stage = 'capture';
    for (const framework of frameworks) {
      if (!HOST_FACTORIES[framework]) {
        throw new Error(`Framework desconhecido: "${framework}". Use wc, react ou angular.`);
      }
    }

    const cells = buildMatrix({
      frameworks,
      stories,
      brands,
      themes,
      viewports,
      viewportWidths: VIEWPORT_WIDTHS,
    }).map(c => ({
      ...c,
      component,
      // WC: sem args na URL (usa storyId nativo do Storybook, evita coercao de tipos)
      // React/Angular: cell.args passado como JSON na URL (resolvido pelo CLI)
      args: c.framework === 'wc' ? {} : (argsById[c.storyId] || {}),
    }));

    const acquireHost = async (framework) => {
      const host = HOST_FACTORIES[framework](repo);
      let served;
      if (framework === 'wc') {
        served = indexDir; // Storybook ja buildado para obter o index.json
      } else {
        const buildDir = path.join(runDir, 'build', host.framework);
        console.log(`\n⬛ Buildando harness ${host.framework}…`);
        served = host.build(repo, buildDir, {
          logPath: path.join(runDir, 'logs', `${host.framework}-harness-build.log`),
        }) || buildDir;
      }
      console.log(`⬛ Servindo ${framework} de: ${served}`);
      const server = await serveStatic(served);
      console.log(`⬛ Capturando ${cells.filter(c => c.framework === framework).length} célula(s) para ${framework}…`);
      return {host, url: server.url, release: () => server.close()};
    };

    const {manifest, captures} = await capturePipeline({
      cells,
      acquireHost,
      runDir,
      manifestMeta: {
        tool: 'Anemoi Web',
        card,
        component,
        mode: 'current',
        axes: {
          frameworks,
          stories: stories.map(s => s.name),
          themes,
          viewports,
          brands,
        },
      },
      onStage: (s) => { stage = s; },
      onProgress: ({index, total, relPath}) => {
        process.stdout.write(`  [${index}/${total}] ${relPath}\n`);
      },
    });

    console.log(`\n✅ Concluído! ${captures.length} prints em: ${runDir}`);
    console.log(`   Galeria: ${path.join(runDir, 'index.html')}`);
```

O `catch` externo (que chama `writeFailureManifest(runDir, {stage, card, component}, error)`) permanece EXATAMENTE como está — `onStage` mantém a variável `stage` atualizada com os mesmos valores de hoje.

- [ ] **Step 4: Run web tests (regressão)**

Run: `cd packages/web && node --test && cd ../..`
Expected: PASS — inclusive `run-stage.test.js` (o trecho `stage = 'story-args'` que ele grepa não foi tocado) e `pipeline.test.js`.

- [ ] **Step 5: Verificação de lint manual — imports mortos**

Run: `grep -n "captureCells\|writeManifest\|writeSummary\|renderHtml\|buildManifest\|groupByCell\|computeParity" packages/web/src/run.js`
Expected: nenhuma ocorrência (saída vazia).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/run.js
git commit -m "refactor(web): runCurrentState vira caller fino do capturePipeline"
```

---

### Task 6: Service (`runner.js`) adota o `capturePipeline`

**Files:**
- Modify: `packages/service/src/runner.js` (arquivo inteiro, encolhe ~40 linhas)

**Interfaces:**
- Consumes: `capturePipeline` de `@gol-smiles/anemoi-web/src/pipeline` (subpath temporário — a Task 7 troca pelo barrel); `createRunDir`, `writeFailureManifest` idem.
- Produces: `executeRun({run, store, cells, state, config, pool})` com o MESMO contrato de hoje: nunca rejeita; transições `running → passed|failed|error`; `summary {cells, mismatches, maxMismatchPx}`; manifest com `mode 'koba-state'`, `parityLabel 'Paridade vs react'`, `compareState`. `packages/service/test/runner.test.js` passa SEM edição.

- [ ] **Step 1: Reescrever `packages/service/src/runner.js`**

Substituir o conteúdo COMPLETO por:

```js
'use strict';
// Executa um run: renderiza o componente ISOLADO pelo motor proprio do Anemoi
// (harnesses react/angular, um por framework), computa paridade react x angular
// e publica o bundle padrao do Anemoi no checkout do DS.
//
// Nao fotografa a UI viva do Koba: os harnesses recebem props/slots do
// compareState via querystring e renderizam so o componente (#evidence-root).
// Os harnesses buildados vem do harnessPool (build 1x + cache + serve).
// Nunca rejeita: todo caminho termina num status consultavel do run.

const fs = require('node:fs');
const path = require('node:path');
const {capturePipeline} = require('@gol-smiles/anemoi-web/src/pipeline');
const {createRunDir} = require('@gol-smiles/anemoi-web/src/run');
const {writeFailureManifest} = require('@gol-smiles/anemoi-web/src/failure');

async function executeRun({run, store, cells, state, config, pool}) {
  let stage = 'run-dir';
  let runDir = null;

  try {
    store.transition(run.runId, 'running', {stage});
    runDir = createRunDir(config.dsRepo, run.card, run.component);
    fs.mkdirSync(runDir, {recursive: true});
    store.patch(run.runId, {runDir});

    const diagnosticsDir = path.join(runDir, 'logs');
    const frameworks = [...new Set(cells.map(cell => cell.framework))];

    const {manifest} = await capturePipeline({
      cells: cells.map(cell => ({...cell, diagnosticsDir})),
      acquireHost: async (framework) => {
        // O 1o run por framework paga o build do harness (bloqueante); os seguintes reusam.
        store.patch(run.runId, {stage: `preparando harness ${framework}`});
        const {host, url} = await pool.acquire(framework, config.dsRepo);
        return {host, url};
      },
      runDir,
      pairs: [{reference: 'react', against: 'angular'}],
      statusFromParity: true,
      manifestMeta: {
        tool: 'Anemoi Service',
        card: run.card,
        component: run.component,
        mode: 'koba-state',
        parityLabel: 'Paridade vs react',
        axes: {
          frameworks,
          stories: [cells[0].storyName],
          themes: ['light'],
          viewports: [...new Set(cells.map(cell => cell.viewport))],
          brands: ['gol'],
        },
        compareState: state,
      },
      onStage: (s) => { stage = s; store.patch(run.runId, {stage: s}); },
      onProgress: ({framework, index, total}) =>
        store.patch(run.runId, {stage: `capturando ${framework} ${index}/${total}`}),
    });

    const parities = manifest.groups.flatMap(group => group.parity);
    store.transition(run.runId, manifest.status, {
      stage: null,
      summary: {
        cells: manifest.cellCount,
        mismatches: parities.filter(parity => parity.mismatch > 0).length,
        maxMismatchPx: parities.length ? Math.max(...parities.map(parity => parity.mismatch)) : 0,
      },
    });
  } catch (error) {
    // Assentar o erro nunca pode lancar: o run pode estar desconhecido ou
    // ja terminal (ex.: reexecucao), e a transicao 'running' inicial pode
    // ter sido a propria causa do erro. Todo caminho precisa resolver.
    try {
      if (runDir) {
        writeFailureManifest(runDir, {stage, card: run.card, component: run.component}, error);
      }
    } catch (_manifestError) {
      // Ignorado: nao deixar falha ao gravar o manifesto de erro rejeitar o run.
    }
    try {
      store.transition(run.runId, 'error', {stage, error: error.message});
    } catch (_storeError) {
      // Ignorado: run desconhecido ou ja terminal — nao ha nada mais a fazer.
    }
  }
}

module.exports = {executeRun};
```

- [ ] **Step 2: Run service tests (contrato congelado)**

Run: `cd packages/service && node --test && cd ../..`
Expected: PASS — os 4 testes de `runner.test.js` passam sem edição (passed, failed, terminal, error), mais `server.test.js`/`kobaContract.test.js` intactos.

- [ ] **Step 3: Verificação — runner não monta mais manifesto nem paridade**

Run: `grep -n "buildManifest\|writeManifest\|writeSummary\|renderHtml\|computeParity\|groupByCell\|captureCells" packages/service/src/runner.js`
Expected: saída vazia.

- [ ] **Step 4: Commit**

```bash
git add packages/service/src/runner.js
git commit -m "refactor(service): executeRun vira caller fino do capturePipeline"
```

---

### Task 7: Barrel `web/src/index.js` + `exports`; service para de furar `src/`

**Files:**
- Create: `packages/web/src/index.js`
- Modify: `packages/web/package.json:6` (main + exports)
- Modify: `packages/service/src/harnessPool.js:20-22`, `packages/service/src/runner.js:14-16`, `packages/service/src/server.js:12`, `packages/service/src/stateAdapter.js:9`, `packages/service/src/config.js:5`
- Test: `packages/web/test/index.test.js`

**Interfaces:**
- Consumes: módulos internos do web (Tasks 3-5).
- Produces: `require('@gol-smiles/anemoi-web')` expõe exatamente: `capturePipeline`, `groupByCell`, `computeParity`, `createRunDir`, `prepareCapture`, `runCurrentState`, `writeFailureManifest`, `VIEWPORT_WIDTHS`, `readLocalConfig`, `resolveRepository`, `assertCaptureReady`, `runDoctor`, `makeWcHost`, `makeReactHost`, `makeAngularHost`. Com o campo `exports`, subpaths `@gol-smiles/anemoi-web/src/...` passam a ser BLOQUEADOS pelo Node — o seam fica enforced.

- [ ] **Step 1: Write the failing test**

Criar `packages/web/test/index.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('barrel publica a interface consumida pelo service e pelo CLI', () => {
  const api = require('../src/index');
  const fns = [
    'capturePipeline', 'groupByCell', 'computeParity',
    'createRunDir', 'prepareCapture', 'runCurrentState',
    'writeFailureManifest',
    'readLocalConfig', 'resolveRepository',
    'assertCaptureReady', 'runDoctor',
    'makeWcHost', 'makeReactHost', 'makeAngularHost',
  ];
  for (const name of fns) {
    assert.equal(typeof api[name], 'function', `esperava function em api.${name}`);
  }
  assert.equal(typeof api.VIEWPORT_WIDTHS, 'object', 'esperava VIEWPORT_WIDTHS');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/web/test/index.test.js`
Expected: FAIL — `Cannot find module '../src/index'`

- [ ] **Step 3: Criar o barrel**

Criar `packages/web/src/index.js`:

```js
'use strict';
// Interface publica do pacote. Consumidores externos (anemoi-service) importam
// SO daqui — o campo "exports" do package.json bloqueia subpaths de src/.

const {groupByCell, computeParity} = require('./parity');
const {capturePipeline} = require('./pipeline');
const {createRunDir, prepareCapture, runCurrentState} = require('./run');
const {writeFailureManifest} = require('./failure');
const {VIEWPORT_WIDTHS} = require('./brands');
const {readLocalConfig, resolveRepository} = require('./config');
const {assertCaptureReady, runDoctor} = require('./doctor');
const {makeWcHost} = require('./hosts/wc');
const {makeReactHost} = require('./hosts/react');
const {makeAngularHost} = require('./hosts/angular');

module.exports = {
  capturePipeline,
  groupByCell,
  computeParity,
  createRunDir,
  prepareCapture,
  runCurrentState,
  writeFailureManifest,
  VIEWPORT_WIDTHS,
  readLocalConfig,
  resolveRepository,
  assertCaptureReady,
  runDoctor,
  makeWcHost,
  makeReactHost,
  makeAngularHost,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/web/test/index.test.js`
Expected: PASS

- [ ] **Step 5: Publicar o barrel no package.json**

Em `packages/web/package.json`, trocar a linha `"main": "src/cli.js",` por:

```json
  "main": "src/index.js",
  "exports": {
    ".": "./src/index.js",
    "./package.json": "./package.json"
  },
```

(O `bin/anemoi-web.js` usa `require('../src/cli')` relativo — não passa pelo `exports`, segue funcionando.)

- [ ] **Step 6: Trocar os imports por subpath no service**

`packages/service/src/harnessPool.js` (linhas 20-22) — trocar:
```js
const {makeReactHost} = require('@gol-smiles/anemoi-web/src/hosts/react');
const {makeAngularHost} = require('@gol-smiles/anemoi-web/src/hosts/angular');
const {assertCaptureReady} = require('@gol-smiles/anemoi-web/src/doctor');
```
por:
```js
const {makeReactHost, makeAngularHost, assertCaptureReady} = require('@gol-smiles/anemoi-web');
```

`packages/service/src/runner.js` (linhas 13-15) — trocar:
```js
const {capturePipeline} = require('@gol-smiles/anemoi-web/src/pipeline');
const {createRunDir} = require('@gol-smiles/anemoi-web/src/run');
const {writeFailureManifest} = require('@gol-smiles/anemoi-web/src/failure');
```
por:
```js
const {capturePipeline, createRunDir, writeFailureManifest} = require('@gol-smiles/anemoi-web');
```

`packages/service/src/server.js` (linha 12) e `packages/service/src/stateAdapter.js` (linha 9) — trocar:
```js
const {VIEWPORT_WIDTHS} = require('@gol-smiles/anemoi-web/src/brands');
```
por:
```js
const {VIEWPORT_WIDTHS} = require('@gol-smiles/anemoi-web');
```

`packages/service/src/config.js` (linha 5) — trocar:
```js
const {readLocalConfig, resolveRepository} = require('@gol-smiles/anemoi-web/src/config');
```
por:
```js
const {readLocalConfig, resolveRepository} = require('@gol-smiles/anemoi-web');
```

- [ ] **Step 7: Verificar que nenhum subpath sobrou (o exports agora quebraria em runtime)**

Run: `grep -rn "anemoi-web/src" packages/ --include="*.js" | grep -v node_modules`
Expected: saída vazia.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS em todos os workspaces (core, web, service). Se `test/*.test.js` da raiz não existir, o script segue para os workspaces — comportamento atual.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/index.js packages/web/test/index.test.js packages/web/package.json packages/service/src/harnessPool.js packages/service/src/runner.js packages/service/src/server.js packages/service/src/stateAdapter.js packages/service/src/config.js
git commit -m "feat(web): barrel com exports enforced; service importa so pela interface"
```

---

## Verificação final do plano

Após a Task 7, os quatro candidatos da revisão estão fechados:

| Candidato | Fechado por |
|---|---|
| 5 — manifest ad-hoc em 3 lugares | Tasks 1-2 (`buildManifest`/`buildFailureManifest`; fixtures viram verdade) |
| 3 — parity duplicada | Task 3 (`computeParity({pairs})`; `parityPair` deletado) |
| 1 — pipeline duplicado | Tasks 4-6 (`capturePipeline`; CLI e service como callers finos) |
| 2 — seam furado 9× | Task 7 (barrel + `exports` enforced) |

Smoke manual opcional (exige checkout do DS configurado): `npm run web -- --component tgr-button --skip-build` e conferir `manifest.json`/`index.html` no runDir; `npm run service` + roteiro de smoke do `bin/anemoi-service.js --doctor`.
