# Análise de acessibilidade (WCAG) e paridade semântica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda captura do Anemoi Web audita cada célula contra WCAG A/AA (axe-core) e compara a árvore ARIA dos wrappers React/Angular contra o WC baseline, publicando tudo no manifesto/galeria com gate opt-in `--fail-on-a11y`.

**Architecture:** Coletores na visita de captura existente (`captureCells` já abre uma page por célula — o axe e o `ariaSnapshot()` rodam ali, após o screenshot, sem navegação extra). O core ganha primitivas agnósticas (`packages/core/src/a11y.js`); o web orquestra num módulo irmão do `parity.js` (`packages/web/src/a11y.js`) e num estágio novo do `capturePipeline`. Spec: `docs/superpowers/specs/2026-07-16-a11y-wcag-paridade-semantica-design.md`.

**Tech Stack:** Node >= 24, CommonJS, Playwright 1.61 (já instalado; `ariaSnapshot()` requer >= 1.49), axe-core (dependência nova, só no core), `node --test`.

## Global Constraints

- Node >= 24; CommonJS; testes com `node --test` (sem dependência nova de teste).
- Única dependência nova permitida: `axe-core` em `packages/core` (Task 1). Nenhuma outra, em nenhum pacote.
- NÃO tocar `packages/service` — ele herda tudo via `capturePipeline` com defaults (`collectA11y: true`, `statusFromA11y: false`).
- Barrel `packages/web/src/index.js` NÃO muda (módulos internos novos usam require relativo).
- Ruleset WCAG exato: tags axe `['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']` (constante `WCAG_TAGS` do core; nunca duplicar o literal fora dela).
- Falha na coleta a11y NUNCA derruba a captura visual: vira `a11y: {error}` no resultado, jamais exceção.
- Manifests antigos (sem campos `a11y`) nunca quebram render nem veredito — mesmo princípio do `sizeMatch` da Fase 0.
- Commits em conventional commits pt-BR sem acentos (padrão do `git log`).
- Textos de UI/summary em pt-BR com acentuação correta (como `output.js` já faz).

---

### Task 1: Primitivas de acessibilidade no core (`runAxeAudit`, `captureAriaSnapshot`)

**Files:**
- Create: `packages/core/src/a11y.js`
- Modify: `packages/core/src/index.js` (barrel do core: adicionar `./a11y`)
- Modify: `packages/core/package.json` (dependência `axe-core`)
- Test: `packages/core/test/a11y.test.js`

**Interfaces:**
- Consumes: `serveStatic` de `packages/core/src/server.js` (fixtures de teste); `playwright` (chromium).
- Produces (Tasks 2, 3, 5 dependem):
  - `WCAG_TAGS: string[]` — `['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']`
  - `axeCoreVersion(): string | null`
  - `normalizeViolations(axeResults): Array<{id, impact, wcag, description, helpUrl, nodes: Array<{target, html}>}>`
  - `runAxeAudit(page, selector, {tags?}): Promise<{ruleset: string[], violations: <normalizadas>}>`
  - `captureAriaSnapshot(page, selector): Promise<string>` (YAML)
  - Tudo reexportado pelo barrel `@gol-smiles/anemoi-core`.

- [ ] **Step 1: Instalar axe-core no workspace do core**

```bash
npm install axe-core@^4.10.0 -w packages/core
```

Verificar: `node -e "console.log(require('axe-core/package.json').version)"` imprime `4.x.x`.

- [ ] **Step 2: Escrever os testes que falham**

Criar `packages/core/test/a11y.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');
const {serveStatic} = require('../src/server');
const {WCAG_TAGS, axeCoreVersion, normalizeViolations, runAxeAudit, captureAriaSnapshot} = require('../src/a11y');

// Botao sem nome acessivel: violacao button-name (wcag2a / 4.1.2).
const VIOLATION_HTML = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
  + '<title>fixture</title></head><body><div id="evidence-root"><button></button></div></body></html>';

// Botao com nome e contraste explicito 21:1 — nenhuma violacao A/AA.
const CLEAN_HTML = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
  + '<title>fixture</title></head><body><div id="evidence-root">'
  + '<button style="color:#000;background:#fff;border:1px solid #000">Salvar</button></div></body></html>';

async function withPage(html, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-a11y-'));
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  const server = await serveStatic(dir);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${server.url}/index.html`);
    return await fn(page);
  } finally {
    await browser.close();
    await server.close();
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

test('runAxeAudit acusa botao sem nome acessivel com regua WCAG A/AA', async () => {
  const audit = await withPage(VIOLATION_HTML, page => runAxeAudit(page, '#evidence-root'));
  assert.deepEqual(audit.ruleset, WCAG_TAGS);
  const violation = audit.violations.find(v => v.id === 'button-name');
  assert.ok(violation, `esperava button-name, veio: ${audit.violations.map(v => v.id).join(', ') || '(nenhuma)'}`);
  assert.ok(violation.impact);
  assert.ok(violation.wcag.some(tag => tag.startsWith('wcag')));
  assert.match(violation.helpUrl, /^https:\/\//);
  assert.ok(violation.nodes.length >= 1);
  assert.match(violation.nodes[0].html, /<button/);
});

test('runAxeAudit em html limpo nao acusa violacoes', async () => {
  const audit = await withPage(CLEAN_HTML, page => runAxeAudit(page, '#evidence-root'));
  assert.deepEqual(audit.violations, []);
});

test('captureAriaSnapshot devolve arvore ARIA em yaml do seletor', async () => {
  const snapshot = await withPage(CLEAN_HTML, page => captureAriaSnapshot(page, '#evidence-root'));
  assert.equal(typeof snapshot, 'string');
  assert.match(snapshot, /button "Salvar"/);
});

test('normalizeViolations reduz o resultado bruto do axe e trunca html', () => {
  const raw = {violations: [{
    id: 'button-name',
    impact: 'critical',
    tags: ['cat.name-role-value', 'wcag2a', 'wcag412'],
    description: 'Buttons must have discernible text',
    helpUrl: 'https://dequeuniversity.com/rules/axe/button-name',
    nodes: [{target: ['#evidence-root', 'button'], html: '<button>' + 'x'.repeat(500) + '</button>'}],
  }]};
  const [v] = normalizeViolations(raw);
  assert.equal(v.id, 'button-name');
  assert.equal(v.impact, 'critical');
  assert.deepEqual(v.wcag, ['wcag2a', 'wcag412']);
  assert.equal(v.nodes[0].target, '#evidence-root button');
  assert.ok(v.nodes[0].html.length <= 300);
});

test('normalizeViolations tolera resultado vazio e campos ausentes', () => {
  assert.deepEqual(normalizeViolations({}), []);
  const [v] = normalizeViolations({violations: [{id: 'x', tags: undefined, nodes: undefined}]});
  assert.equal(v.impact, null);
  assert.deepEqual(v.wcag, []);
  assert.deepEqual(v.nodes, []);
});

test('axeCoreVersion devolve a versao instalada', () => {
  assert.match(axeCoreVersion(), /^\d+\.\d+\.\d+/);
});

test('barrel do core exporta as primitivas de a11y', () => {
  const core = require('../src/index');
  assert.equal(core.runAxeAudit, runAxeAudit);
  assert.equal(core.captureAriaSnapshot, captureAriaSnapshot);
  assert.deepEqual(core.WCAG_TAGS, WCAG_TAGS);
  assert.equal(core.axeCoreVersion, axeCoreVersion);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -w packages/core`
Expected: FAIL — `Cannot find module '../src/a11y'`.

- [ ] **Step 4: Implementar `packages/core/src/a11y.js`**

```js
// Primitivas de acessibilidade: auditoria axe-core e snapshot da arvore ARIA,
// ambas na page ja aberta pela captura. Agnosticas de consumidor: recebem
// page/selector e nunca conhecem Tangerina.

// Tags axe correspondentes a WCAG A + AA (2.0, 2.1 e 2.2). Exportadas para a
// proveniencia registrar exatamente a regua aplicada no manifesto.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

function axeCoreVersion() {
  try {
    return require('axe-core/package.json').version;
  } catch {
    return null;
  }
}

// Reduz o resultado bruto do axe ao que manifesto e galeria precisam. `nodes`
// preserva alvo e um recorte do HTML (300 chars) para a galeria mostrar o
// elemento; o resultado completo fica no artefato .a11y.json.
function normalizeViolations(axeResults) {
  return (axeResults.violations || []).map(violation => ({
    id: violation.id,
    impact: violation.impact ?? null,
    wcag: (violation.tags || []).filter(tag => tag.startsWith('wcag')),
    description: violation.description,
    helpUrl: violation.helpUrl,
    nodes: (violation.nodes || []).map(node => ({
      target: Array.isArray(node.target) ? node.target.join(' ') : String(node.target ?? ''),
      html: String(node.html || '').slice(0, 300),
    })),
  }));
}

// Injeta o axe-core na pagina e audita o subtree do seletor com as tags WCAG.
async function runAxeAudit(page, selector, {tags = WCAG_TAGS} = {}) {
  await page.addScriptTag({path: require.resolve('axe-core')});
  const results = await page.evaluate(
    ([sel, runTags]) => window.axe.run(sel, {
      runOnly: {type: 'tag', values: runTags},
      resultTypes: ['violations'],
    }),
    [selector, tags],
  );
  return {ruleset: tags, violations: normalizeViolations(results)};
}

// Arvore ARIA do componente em YAML deterministico (Playwright >= 1.49).
async function captureAriaSnapshot(page, selector) {
  return page.locator(selector).ariaSnapshot();
}

module.exports = {WCAG_TAGS, axeCoreVersion, normalizeViolations, runAxeAudit, captureAriaSnapshot};
```

Adicionar ao barrel `packages/core/src/index.js`:

```js
module.exports = {
  ...require('./diff'),
  ...require('./server'),
  ...require('./matrix'),
  ...require('./capture'),
  ...require('./output'),
  ...require('./manifest'),
  ...require('./a11y'),
};
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -w packages/core`
Expected: PASS (todos, incluindo os testes existentes).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/a11y.js packages/core/src/index.js packages/core/package.json package-lock.json packages/core/test/a11y.test.js
git commit -m "feat(core): primitivas de acessibilidade runAxeAudit e captureAriaSnapshot"
```

---

### Task 2: `captureCells` coleta axe + snapshot ARIA na mesma visita

**Files:**
- Modify: `packages/core/src/capture.js`
- Test: `packages/core/test/capture.test.js` (adicionar testes; os existentes não mudam)

**Interfaces:**
- Consumes: `runAxeAudit(page, selector)`, `captureAriaSnapshot(page, selector)` da Task 1.
- Produces (Tasks 3 e 4 dependem): `captureCells(cells, host, baseUrl, destDir, {onProgress?, browserType?, collectA11y = true})`. Com `collectA11y` ligado, cada resultado de captura ganha a chave `a11y`:
  - sucesso: `{relPath: '<fw>/<brand>/<story>/<viewport>/<theme>.a11y.json', ariaRelPath: '<...>/<theme>.aria.yaml', ruleset: string[], violations: [...], ariaSnapshot: string}` — e os dois artefatos gravados em disco sob `destDir`;
  - falha na coleta: `{error: string}` (captura visual intacta, nenhum artefato parcial);
  - `collectA11y: false`: a chave `a11y` NÃO existe no resultado.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `packages/core/test/capture.test.js`:

```js
// --- coleta a11y na visita da captura ---

// Page fake que responde aos coletores: addScriptTag/evaluate para o axe,
// locator().ariaSnapshot() para a arvore ARIA.
function a11yFakePage({axeResults, aria, evaluateError} = {}) {
  return {
    setViewportSize: async () => {},
    goto: async () => {},
    addScriptTag: async () => {},
    evaluate: async () => {
      if (evaluateError) throw new Error(evaluateError);
      return axeResults ?? {violations: []};
    },
    locator: () => ({
      screenshot: async () => {},
      ariaSnapshot: async () => aria ?? '- button "Salvar"',
    }),
    close: async () => {},
  };
}

function fakeBrowserType(page) {
  const context = {newPage: async () => page, close: async () => {}};
  const browser = {newContext: async () => context, close: async () => {}};
  return {launch: async () => browser};
}

const A11Y_HOST = {urlFor: () => 'http://example.test', selectorFor: () => '#evidence-root'};
const A11Y_CELL = {
  framework: 'react', brand: 'gol', storyId: 'button--primary', storyName: 'Primary',
  viewport: 'sm', theme: 'light', width: 360,
};

test('captureCells coleta axe + aria e grava artefatos ao lado do png', async () => {
  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-capture-a11y-'));
  const page = a11yFakePage({
    axeResults: {violations: [{id: 'button-name', impact: 'critical', tags: ['wcag2a'], description: 'd', helpUrl: 'https://x', nodes: [{target: ['button'], html: '<button></button>'}]}]},
    aria: '- button',
  });
  try {
    const [result] = await captureCells([A11Y_CELL], A11Y_HOST, 'http://example.test', destDir, {browserType: fakeBrowserType(page)});
    assert.equal(result.a11y.relPath, 'react/gol/button--primary/sm/light.a11y.json');
    assert.equal(result.a11y.ariaRelPath, 'react/gol/button--primary/sm/light.aria.yaml');
    assert.equal(result.a11y.violations[0].id, 'button-name');
    assert.equal(result.a11y.ariaSnapshot, '- button');
    const artifact = JSON.parse(fs.readFileSync(path.join(destDir, result.a11y.relPath), 'utf8'));
    assert.equal(artifact.violations[0].id, 'button-name');
    assert.deepEqual(artifact.ruleset, ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
    assert.equal(fs.readFileSync(path.join(destDir, result.a11y.ariaRelPath), 'utf8'), '- button\n');
  } finally {
    fs.rmSync(destDir, {recursive: true, force: true});
  }
});

test('captureCells com collectA11y=false nao coleta nem grava artefatos', async () => {
  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-capture-a11y-'));
  try {
    const [result] = await captureCells([A11Y_CELL], A11Y_HOST, 'http://example.test', destDir, {
      browserType: fakeBrowserType(a11yFakePage()),
      collectA11y: false,
    });
    assert.equal('a11y' in result, false);
    assert.equal(fs.existsSync(path.join(destDir, 'react/gol/button--primary/sm/light.a11y.json')), false);
  } finally {
    fs.rmSync(destDir, {recursive: true, force: true});
  }
});

test('falha na coleta a11y nao derruba a captura: vira a11y.error', async () => {
  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-capture-a11y-'));
  const page = a11yFakePage({evaluateError: 'axe timeout'});
  try {
    const [result] = await captureCells([A11Y_CELL], A11Y_HOST, 'http://example.test', destDir, {browserType: fakeBrowserType(page)});
    assert.equal(result.relPath, 'react/gol/button--primary/sm/light.png');
    assert.match(result.a11y.error, /axe timeout/);
    assert.equal(fs.existsSync(path.join(destDir, 'react/gol/button--primary/sm/light.a11y.json')), false);
    assert.equal(fs.existsSync(path.join(destDir, 'react/gol/button--primary/sm/light.aria.yaml')), false);
  } finally {
    fs.rmSync(destDir, {recursive: true, force: true});
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w packages/core`
Expected: FAIL — os 3 testes novos (`result.a11y` undefined).

- [ ] **Step 3: Implementar em `packages/core/src/capture.js`**

Adicionar o import no topo (após `const {chromium} = require('playwright');`):

```js
const {runAxeAudit, captureAriaSnapshot} = require('./a11y');
```

Adicionar a função auxiliar antes de `captureCells`:

```js
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
    return {error: error.message};
  }
}
```

Alterar a assinatura de `captureCells` e o corpo do loop:

```js
async function captureCells(cells, host, baseUrl, destDir, {onProgress, browserType = chromium, collectA11y = true} = {}) {
```

E no loop, substituir o trecho do screenshot/push por:

```js
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
```

Não exportar `collectCellA11y` (detalhe interno).

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w packages/core`
Expected: PASS — incluindo os testes antigos de `captureCells` (as pages fake antigas não têm `addScriptTag`; a coleta cai no catch e vira `a11y.error`, sem quebrar as asserções existentes).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/capture.js packages/core/test/capture.test.js
git commit -m "feat(core): captureCells coleta axe e snapshot ARIA na visita da captura"
```

---

### Task 3: Web — `groupByCell` propaga a11y; `computeA11y`, `hasA11yDivergence`, `summarizeA11y`

**Files:**
- Modify: `packages/web/src/parity.js` (propagar `_a11y` em `groupByCell`; exportar `DEFAULT_PAIRS`)
- Create: `packages/web/src/a11y.js`
- Test: `packages/web/test/parity.test.js` (adicionar), `packages/web/test/a11y.test.js` (novo)

**Interfaces:**
- Consumes: formato do capture result da Task 2 (`capture.a11y` com `{relPath, ariaRelPath, ruleset, violations, ariaSnapshot}` ou `{error}`); `WCAG_TAGS` do core.
- Produces (Tasks 4 e 5 dependem):
  - `groupByCell` passa a incluir `group._a11y = {<framework>: <capture.a11y>}` quando as capturas trazem a11y (chave ausente caso contrário). `DEFAULT_PAIRS` exportado de `parity.js`.
  - `computeA11y(groups, runDir, {pairs = DEFAULT_PAIRS}): groups` — remove `_a11y` e, quando havia dados, adiciona `a11y: {audits: {<fw>: {violations, artifactPath} | {error}}, ariaParity: [{against, match, diffPath?}]}`. Divergência ARIA grava `aria-diff/<against>-vs-<reference>/<brand>-<storyId>-<viewport>-<theme>.txt` no `runDir`. Pares com erro de coleta em qualquer lado não entram em `ariaParity` (o erro já aparece em `audits`).
  - `hasA11yDivergence(groups): boolean` — true se qualquer grupo tem violação, `ariaParity.match === false` ou `audits[fw].error`. Grupos sem `a11y` nunca divergem.
  - `summarizeA11y(groups): {totalViolations, worstImpact, ariaMismatches, ruleset} | undefined` — `undefined` quando nenhum grupo tem `a11y`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar a `packages/web/test/parity.test.js`:

```js
test('groupByCell propaga a11y das capturas por framework em _a11y', () => {
  const base = {brand: 'gol', storyId: 'button--primary', storyName: 'Primary', viewport: 'sm', theme: 'light'};
  const groups = groupByCell([
    {...base, framework: 'wc', relPath: 'wc.png', a11y: {relPath: 'wc.a11y.json', violations: []}},
    {...base, framework: 'react', relPath: 'react.png', a11y: {error: 'axe timeout'}},
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]._a11y.wc.relPath, 'wc.a11y.json');
  assert.equal(groups[0]._a11y.react.error, 'axe timeout');
});

test('groupByCell sem a11y nas capturas nao cria _a11y', () => {
  const groups = groupByCell([
    {framework: 'wc', brand: 'gol', storyId: 'b--p', storyName: 'P', viewport: 'sm', theme: 'light', relPath: 'wc.png'},
  ]);
  assert.equal('_a11y' in groups[0], false);
});
```

(Nota: `parity.test.js` usa `assert` de `node:assert`; `assert.equal(x, false)` funciona igual.)

Criar `packages/web/test/a11y.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {computeA11y, hasA11yDivergence, summarizeA11y} = require('../src/a11y');

function entry(framework, overrides = {}) {
  return {
    relPath: `${framework}/gol/button--primary/sm/light.a11y.json`,
    ariaRelPath: `${framework}/gol/button--primary/sm/light.aria.yaml`,
    ruleset: ['wcag2a'],
    violations: [],
    ariaSnapshot: '- button "Salvar"\n',
    ...overrides,
  };
}

function group(_a11y) {
  return {label: 'gol · Primary · sm · light', wc: 'wc.png', react: 'react.png', parity: [], _a11y};
}

test('computeA11y monta audits por framework e remove _a11y', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-'));
  const [g] = computeA11y([group({wc: entry('wc'), react: entry('react')})], runDir);
  assert.equal('_a11y' in g, false);
  assert.deepEqual(g.a11y.audits.wc, {violations: [], artifactPath: 'wc/gol/button--primary/sm/light.a11y.json'});
  assert.deepEqual(g.a11y.ariaParity, [{against: 'react', match: true}]);
});

test('computeA11y: snapshots divergentes gravam aria-diff e marcam match false', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-'));
  const [g] = computeA11y([group({
    wc: entry('wc'),
    react: entry('react', {ariaSnapshot: '- button\n'}),
  })], runDir);
  const [p] = g.a11y.ariaParity;
  assert.equal(p.against, 'react');
  assert.equal(p.match, false);
  assert.equal(p.diffPath, 'aria-diff/react-vs-wc/gol-button--primary-sm-light.txt');
  const diff = fs.readFileSync(path.join(runDir, p.diffPath), 'utf8');
  assert.match(diff, /--- wc \(reference\)/);
  assert.match(diff, /\+\+\+ react \(against\)/);
  assert.match(diff, /button "Salvar"/);
});

test('computeA11y: erro de coleta vira audits[fw].error e o par sai do ariaParity', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-'));
  const [g] = computeA11y([group({wc: entry('wc'), react: {error: 'axe timeout'}})], runDir);
  assert.deepEqual(g.a11y.audits.react, {error: 'axe timeout'});
  assert.deepEqual(g.a11y.ariaParity, []);
});

test('computeA11y: grupo sem _a11y sai intocado, sem bloco a11y', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-'));
  const [g] = computeA11y([{label: 'x', wc: 'wc.png', parity: []}], runDir);
  assert.equal('a11y' in g, false);
});

test('computeA11y respeita pairs customizado (angular vs react)', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-'));
  const [g] = computeA11y([group({react: entry('react'), angular: entry('angular', {ariaSnapshot: '- link\n'})})], runDir, {
    pairs: [{reference: 'react', against: 'angular'}],
  });
  assert.equal(g.a11y.ariaParity[0].against, 'angular');
  assert.equal(g.a11y.ariaParity[0].match, false);
  assert.match(g.a11y.ariaParity[0].diffPath, /^aria-diff\/angular-vs-react\//);
});

const VIOLATION = {id: 'button-name', impact: 'critical', wcag: ['wcag2a'], description: 'd', helpUrl: 'https://x', nodes: []};

test('hasA11yDivergence: violacao, aria mismatch ou erro divergem; limpo e sem a11y nao', () => {
  const ok = {a11y: {audits: {wc: {violations: [], artifactPath: 'x'}}, ariaParity: [{against: 'react', match: true}]}};
  const withViolation = {a11y: {audits: {wc: {violations: [VIOLATION], artifactPath: 'x'}}, ariaParity: []}};
  const withMismatch = {a11y: {audits: {}, ariaParity: [{against: 'react', match: false, diffPath: 'd.txt'}]}};
  const withError = {a11y: {audits: {react: {error: 'boom'}}, ariaParity: []}};
  assert.equal(hasA11yDivergence([ok]), false);
  assert.equal(hasA11yDivergence([withViolation]), true);
  assert.equal(hasA11yDivergence([withMismatch]), true);
  assert.equal(hasA11yDivergence([withError]), true);
  assert.equal(hasA11yDivergence([{label: 'manifesto antigo sem a11y', parity: []}]), false);
  assert.equal(hasA11yDivergence([]), false);
});

test('summarizeA11y agrega totais, pior impacto e mismatches', () => {
  const groups = [
    {a11y: {audits: {wc: {violations: [VIOLATION, {...VIOLATION, id: 'color-contrast', impact: 'serious'}], artifactPath: 'x'}},
      ariaParity: [{against: 'react', match: false, diffPath: 'd.txt'}]}},
    {a11y: {audits: {wc: {violations: [{...VIOLATION, id: 'label', impact: 'minor'}], artifactPath: 'y'}}, ariaParity: []}},
  ];
  const summary = summarizeA11y(groups);
  assert.equal(summary.totalViolations, 3);
  assert.equal(summary.worstImpact, 'critical');
  assert.equal(summary.ariaMismatches, 1);
  assert.deepEqual(summary.ruleset, ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
});

test('summarizeA11y devolve undefined quando nenhum grupo tem a11y', () => {
  assert.equal(summarizeA11y([{label: 'x', parity: []}]), undefined);
  assert.equal(summarizeA11y([]), undefined);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w packages/web`
Expected: FAIL — `Cannot find module '../src/a11y'` e os 2 testes novos de `groupByCell`.

- [ ] **Step 3: Implementar**

Em `packages/web/src/parity.js`, alterar o corpo do loop de `groupByCell`:

```js
function groupByCell(captures) {
  const map = new Map();
  for (const c of captures) {
    const k = keyOf(c);
    if (!map.has(k)) {
      map.set(k, {label: `${c.brand} · ${c.storyName} · ${c.viewport} · ${c.theme}`, _cell: c});
    }
    const group = map.get(k);
    group[c.framework] = c.relPath;
    if (c.a11y) {
      group._a11y = group._a11y || {};
      group._a11y[c.framework] = c.a11y;
    }
  }
  return [...map.values()];
}
```

E exportar `DEFAULT_PAIRS`:

```js
module.exports = {groupByCell, computeParity, DEFAULT_PAIRS};
```

Criar `packages/web/src/a11y.js`:

```js
'use strict';
// Analise de acessibilidade por celula, no molde do parity.js: agrega as
// auditorias axe por framework e compara a arvore ARIA de cada wrapper contra
// o baseline (paridade semantica). Consome grupos de groupByCell (campo
// transiente _a11y), grava artefatos de divergencia no runDir e devolve os
// grupos com o bloco `a11y` do manifesto.

const fs = require('node:fs');
const path = require('node:path');
const {WCAG_TAGS} = require('@gol-smiles/anemoi-core');
const {DEFAULT_PAIRS} = require('./parity');

// 'react/gol/button--primary/sm/light.aria.yaml' -> 'gol-button--primary-sm-light'
// Espelha o nome dos diffs de pixel (brand-storyId-viewport-theme). Os
// segmentos ja foram validados por assertSafePathSegment na captura.
function fileBaseOf(ariaRelPath) {
  const segments = ariaRelPath.split('/').slice(1);
  const last = segments.pop().replace(/\.aria\.yaml$/, '');
  return [...segments, last].join('-');
}

function auditOf(entry) {
  if (entry.error) return {error: entry.error};
  return {violations: entry.violations, artifactPath: entry.relPath};
}

function computeA11y(groups, runDir, {pairs = DEFAULT_PAIRS} = {}) {
  return groups.map(g => {
    const {_a11y, ...rest} = g;
    if (!_a11y) return rest;

    const audits = {};
    for (const [framework, entry] of Object.entries(_a11y)) {
      audits[framework] = auditOf(entry);
    }

    const ariaParity = [];
    for (const {reference, against} of pairs) {
      const ref = _a11y[reference];
      const other = _a11y[against];
      // Lado ausente ou com erro de coleta: sem comparacao possivel — o erro
      // ja esta em audits e conta como divergencia via hasA11yDivergence.
      if (!ref || !other || ref.error || other.error) continue;
      const match = ref.ariaSnapshot === other.ariaSnapshot;
      const entry = {against, match};
      if (!match) {
        const diffRel = path.join('aria-diff', `${against}-vs-${reference}`, `${fileBaseOf(other.ariaRelPath)}.txt`);
        const abs = path.join(runDir, diffRel);
        fs.mkdirSync(path.dirname(abs), {recursive: true});
        fs.writeFileSync(abs, [
          `--- ${reference} (reference): ${ref.ariaRelPath}`,
          ref.ariaSnapshot.trimEnd(),
          '',
          `+++ ${against} (against): ${other.ariaRelPath}`,
          other.ariaSnapshot.trimEnd(),
          '',
        ].join('\n'));
        entry.diffPath = diffRel;
      }
      ariaParity.push(entry);
    }

    return {...rest, a11y: {audits, ariaParity}};
  });
}

// Divergencia de acessibilidade: qualquer violacao axe (qualquer impacto),
// arvore ARIA divergente do baseline, ou coleta indisponivel — "nao consegui
// medir" nunca passa um gate como se estivesse acessivel. Grupos sem a11y
// (manifests antigos, --no-a11y) nunca divergem.
function hasA11yDivergence(groups) {
  return groups.some(g => {
    if (!g.a11y) return false;
    const audits = Object.values(g.a11y.audits || {});
    return audits.some(a => a.error || (a.violations || []).length > 0)
      || (g.a11y.ariaParity || []).some(p => p.match === false);
  });
}

const IMPACT_ORDER = ['minor', 'moderate', 'serious', 'critical'];

// Agregado do manifesto: veredito rapido sem varrer os grupos.
// undefined quando nenhum grupo tem a11y (coleta desligada ou manifesto antigo).
function summarizeA11y(groups) {
  let hasData = false;
  let totalViolations = 0;
  let worstImpact = null;
  let ariaMismatches = 0;
  for (const g of groups) {
    if (!g.a11y) continue;
    hasData = true;
    for (const audit of Object.values(g.a11y.audits || {})) {
      for (const violation of audit.violations || []) {
        totalViolations += 1;
        if (IMPACT_ORDER.indexOf(violation.impact) > IMPACT_ORDER.indexOf(worstImpact)) {
          worstImpact = violation.impact;
        }
      }
    }
    ariaMismatches += (g.a11y.ariaParity || []).filter(p => p.match === false).length;
  }
  if (!hasData) return undefined;
  return {totalViolations, worstImpact, ariaMismatches, ruleset: WCAG_TAGS};
}

module.exports = {computeA11y, hasA11yDivergence, summarizeA11y};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w packages/web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/parity.js packages/web/src/a11y.js packages/web/test/parity.test.js packages/web/test/a11y.test.js
git commit -m "feat(web): computeA11y agrega auditorias e paridade ARIA por celula"
```

---

### Task 4: Pipeline com estágio `a11y`; manifesto com agregado; `statusFromA11y`

**Files:**
- Modify: `packages/web/src/pipeline.js`
- Modify: `packages/core/src/manifest.js` (campo opcional `a11y`)
- Test: `packages/web/test/pipeline.test.js` (adicionar), `packages/core/test/manifest.test.js` (adicionar)

**Interfaces:**
- Consumes: `computeA11y`, `hasA11yDivergence`, `summarizeA11y` (Task 3); `captureCells` com `collectA11y` (Task 2).
- Produces (Tasks 5, 6, 7 dependem):
  - `capturePipeline({cells, acquireHost, runDir, pairs, manifestMeta, statusFromParity = false, statusFromA11y = false, collectA11y = true, onStage, onProgress})`.
  - Ordem de estágios emitidos: `'capture'`, `'parity'`, `'a11y'`, `'output'`.
  - Retorno: `{manifest, captures, groups, parityDiverged: boolean, a11yDiverged: boolean}`.
  - `status` do manifesto: `'failed'` se `(statusFromParity && parityDiverged) || (statusFromA11y && a11yDiverged)`.
  - `buildManifest` aceita `a11y` opcional (agregado de `summarizeA11y`), presente no JSON apenas quando definido.
  - Grupos do manifesto carregam `a11y: {audits, ariaParity}` (Task 3).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar a `packages/core/test/manifest.test.js`:

```js
test('buildManifest carrega agregado a11y quando fornecido, omite quando ausente', () => {
  const {buildManifest} = require('../src/manifest');
  const base = {tool: 'Anemoi Web', card: 'C-1', component: 'tgr-x', mode: 'current', runDir: '/tmp/r'};
  const withA11y = buildManifest({...base, a11y: {totalViolations: 2, worstImpact: 'serious', ariaMismatches: 1, ruleset: ['wcag2a']}});
  assert.equal(withA11y.a11y.totalViolations, 2);
  const without = buildManifest(base);
  assert.equal('a11y' in without, false);
});
```

(Usar o mesmo import/estilo já presente no arquivo — se `buildManifest` já está importado no topo, não repetir o require.)

Adicionar a `packages/web/test/pipeline.test.js`:

```js
// --- estagio a11y ---

// Botao sem nome acessivel (violacao button-name) vs botao com nome:
// alem da violacao, as arvores ARIA divergem entre os dois servers.
const evidenceHtmlButton = (label) =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>f</title></head>`
  + `<body style="margin:0"><div id="evidence-root">`
  + `<button style="color:#000;background:#fff;border:1px solid #000">${label}</button></div></body></html>`;

test('pipeline: coleta a11y por padrao; sem gate, divergencia so aparece no relatorio', async () => {
  const react = await serveEvidence(evidenceHtmlButton(''));         // violacao button-name
  const angular = await serveEvidence(evidenceHtmlButton('Salvar')); // limpo, aria diferente
  try {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-pipeline-a11y-'));
    // Sem statusFromParity nem statusFromA11y: nenhuma divergencia muda o status.
    const {manifest, a11yDiverged, parityDiverged} = await capturePipeline({
      cells: [cell('react'), cell('angular')],
      acquireHost: async (framework) => ({
        host: fakeHost(framework),
        url: framework === 'react' ? react.url : angular.url,
      }),
      runDir,
      pairs: [{reference: 'react', against: 'angular'}],
      manifestMeta: meta(),
    });
    assert.equal(a11yDiverged, true);
    assert.equal(parityDiverged, true); // textos diferentes divergem em pixels tambem
    assert.equal(manifest.status, 'passed'); // gates desligados: so relatorio
    const {audits, ariaParity} = manifest.groups[0].a11y;
    assert.ok(audits.react.violations.some(v => v.id === 'button-name'));
    assert.deepEqual(audits.angular.violations, []);
    assert.equal(ariaParity[0].against, 'angular');
    assert.equal(ariaParity[0].match, false);
    assert.ok(fs.existsSync(path.join(runDir, ariaParity[0].diffPath)));
    assert.ok(fs.existsSync(path.join(runDir, audits.react.artifactPath)));
    assert.ok(fs.existsSync(path.join(runDir, 'react/gol/fake--primary/sm/light.aria.yaml')));
    assert.ok(manifest.a11y.totalViolations >= 1);
    assert.equal(manifest.a11y.ariaMismatches, 1);
  } finally {
    await react.close();
    await angular.close();
  }
});

test('pipeline: statusFromA11y acusa failed e emite o estagio a11y na ordem', async () => {
  // Botao sem nome nos DOIS lados: pixels e ARIA identicos (paridade passa),
  // mas ha violacao axe — a divergencia e SOMENTE de acessibilidade.
  const react = await serveEvidence(evidenceHtmlButton(''));
  const angular = await serveEvidence(evidenceHtmlButton(''));
  try {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-pipeline-a11y-'));
    const stages = [];
    const {manifest, parityDiverged} = await capturePipeline({
      cells: [cell('react'), cell('angular')],
      acquireHost: async (framework) => ({
        host: fakeHost(framework),
        url: framework === 'react' ? react.url : angular.url,
      }),
      runDir,
      pairs: [{reference: 'react', against: 'angular'}],
      statusFromParity: true,
      statusFromA11y: true,
      manifestMeta: meta(),
      onStage: (s) => stages.push(s),
    });
    assert.deepEqual(stages, ['capture', 'parity', 'a11y', 'output']);
    assert.equal(parityDiverged, false);
    assert.equal(manifest.status, 'failed'); // violacao button-name nos dois lados
    assert.equal(manifest.groups[0].a11y.ariaParity[0].match, true);
  } finally {
    await react.close();
    await angular.close();
  }
});

test('pipeline: collectA11y false nao coleta nem agrega', async () => {
  await withServers({react: '#f60', angular: '#f60'}, async (servers) => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-pipeline-noa11y-'));
    const {manifest, a11yDiverged} = await capturePipeline({
      cells: [cell('react'), cell('angular')],
      acquireHost: async (framework) => ({host: fakeHost(framework), url: servers[framework].url}),
      runDir,
      pairs: [{reference: 'react', against: 'angular'}],
      collectA11y: false,
      manifestMeta: meta(),
    });
    assert.equal('a11y' in manifest, false);
    assert.equal('a11y' in manifest.groups[0], false);
    assert.equal(a11yDiverged, false);
    assert.equal(fs.existsSync(path.join(runDir, 'react/gol/fake--primary/sm/light.a11y.json')), false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w packages/web && npm test -w packages/core`
Expected: FAIL — pipeline não emite estágio `a11y`, manifesto sem blocos.

- [ ] **Step 3: Implementar**

`packages/core/src/manifest.js` — adicionar o parâmetro e o spread (ao lado de `provenance`):

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
  a11y,
  runDir,
  now = new Date(),
}) {
```

e no objeto retornado:

```js
    ...(compareState !== undefined ? {compareState} : {}),
    ...(provenance !== undefined ? {provenance} : {}),
    ...(a11y !== undefined ? {a11y} : {}),
```

`packages/web/src/pipeline.js` — versão completa nova:

```js
'use strict';
// Nucleo compartilhado do run: captura -> paridade -> a11y -> manifesto/galeria.
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
const {computeA11y, hasA11yDivergence, summarizeA11y} = require('./a11y');

async function capturePipeline({
  cells,
  acquireHost,
  runDir,
  pairs,
  manifestMeta,
  statusFromParity = false,
  statusFromA11y = false,
  collectA11y = true,
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
        collectA11y,
        onProgress: (index, total, relPath) => onProgress({framework, index, total, relPath}),
      });
      captures.push(...captured);
    } finally {
      if (release) await release();
    }
  }

  onStage('parity');
  const withParity = computeParity(groupByCell(captures), runDir, pairs ? {pairs} : {});

  onStage('a11y');
  const groups = computeA11y(withParity, runDir, pairs ? {pairs} : {});

  onStage('output');
  const parities = groups.flatMap(group => group.parity);
  const parityDiverged = hasParityDivergence(parities);
  const a11yDiverged = hasA11yDivergence(groups);
  const status = (statusFromParity && parityDiverged) || (statusFromA11y && a11yDiverged)
    ? 'failed'
    : 'passed';
  const manifest = buildManifest({
    ...manifestMeta,
    status,
    cellCount: captures.length,
    groups,
    a11y: summarizeA11y(groups),
    runDir,
  });
  writeManifest(runDir, manifest);
  writeSummary(runDir, manifest);
  fs.writeFileSync(path.join(runDir, 'index.html'), renderHtml(manifest), 'utf8');

  return {manifest, captures, groups, parityDiverged, a11yDiverged};
}

// Divergencia de paridade: pixels diferentes OU capturas com dimensoes
// distintas. sizeMatch ausente (parity entries antigos) nao diverge.
function hasParityDivergence(parities) {
  return parities.some(parity => parity.mismatch > 0 || parity.sizeMatch === false);
}

module.exports = {capturePipeline, hasParityDivergence};
```

Detalhe importante: `computeParity` remove `_cell` mas preserva `_a11y` (spread do rest); `computeA11y` remove `_a11y`. Os grupos finais não carregam nenhuma chave transiente.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w packages/web && npm test -w packages/core`
Expected: PASS — incluindo os testes antigos do pipeline (que agora coletam a11y por default: as páginas fixture de div colorida não têm violação, então nada muda nas asserções deles).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pipeline.js packages/core/src/manifest.js packages/web/test/pipeline.test.js packages/core/test/manifest.test.js
git commit -m "feat(web): pipeline ganha estagio a11y e manifesto agrega acessibilidade"
```

---

### Task 5: CLI — flags `--no-a11y`/`--fail-on-a11y`, exit codes, proveniência e docs

**Files:**
- Modify: `packages/web/src/run.js`
- Modify: `packages/web/src/provenance.js`
- Modify: `docs/guides/web.md`
- Test: `packages/web/test/run-exit.test.js` (reescrever), `packages/web/test/provenance.test.js` (adicionar)

**Interfaces:**
- Consumes: `capturePipeline` com `{statusFromA11y, collectA11y}` e retorno `{parityDiverged, a11yDiverged}` (Task 4); `WCAG_TAGS` e `axeCoreVersion` do core (Task 1).
- Produces (Task 7 depende):
  - `resolveA11yFlags(args): {collectA11y: boolean, failOnA11y: boolean}` — lança `Error` com mensagem contendo `incompativeis` quando `--no-a11y` + `--fail-on-a11y`. Exportada de `run.js`.
  - `resolveExitCode({parityDiverged?, a11yDiverged?}, {failOnDiff?, failOnA11y?}): 0 | 1` — NOVA assinatura (a antiga `(manifest, {failOnDiff})` deixa de existir; `resolveExitCode` não está no barrel do web, então nenhum consumidor externo quebra).
  - `provenance.a11y = {axeCore: <versao>, ruleset: WCAG_TAGS}` no manifesto.

- [ ] **Step 1: Escrever os testes que falham**

Reescrever `packages/web/test/run-exit.test.js` por completo:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {resolveExitCode, resolveA11yFlags} = require('../src/run');

test('resolveExitCode: 1 somente quando um gate ligado divergiu', () => {
  assert.equal(resolveExitCode({parityDiverged: true}, {failOnDiff: true}), 1);
  assert.equal(resolveExitCode({parityDiverged: true}, {failOnDiff: false}), 0);
  assert.equal(resolveExitCode({a11yDiverged: true}, {failOnA11y: true}), 1);
  assert.equal(resolveExitCode({a11yDiverged: true}, {failOnA11y: false}), 0);
  // Gates independentes: um nao dispara pelo outro.
  assert.equal(resolveExitCode({a11yDiverged: true}, {failOnDiff: true}), 0);
  assert.equal(resolveExitCode({parityDiverged: true}, {failOnA11y: true}), 0);
  assert.equal(resolveExitCode({parityDiverged: true, a11yDiverged: true}, {failOnDiff: true, failOnA11y: true}), 1);
  assert.equal(resolveExitCode({}, {failOnDiff: true, failOnA11y: true}), 0);
  assert.equal(resolveExitCode({}, {}), 0);
});

test('resolveA11yFlags: coleta ligada por padrao, gate opt-in, conflito rejeitado', () => {
  assert.deepEqual(resolveA11yFlags({}), {collectA11y: true, failOnA11y: false});
  assert.deepEqual(resolveA11yFlags({'fail-on-a11y': true}), {collectA11y: true, failOnA11y: true});
  assert.deepEqual(resolveA11yFlags({'no-a11y': true}), {collectA11y: false, failOnA11y: false});
  assert.throws(() => resolveA11yFlags({'no-a11y': true, 'fail-on-a11y': true}), /incompativeis/);
});
```

Adicionar a `packages/web/test/provenance.test.js`:

```js
test('collectProvenance registra a regua de acessibilidade (axe-core + tags)', () => {
  const provenance = collectProvenance({repo: process.cwd()});
  assert.match(provenance.a11y.axeCore, /^\d+\.\d+\.\d+/);
  assert.deepEqual(provenance.a11y.ruleset, ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
});
```

(Seguir o import de `collectProvenance` já existente no arquivo.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w packages/web`
Expected: FAIL — `resolveA11yFlags` inexistente; assinatura antiga de `resolveExitCode`; provenance sem `a11y`.

- [ ] **Step 3: Implementar**

`packages/web/src/provenance.js` — atualizar o import do core e o objeto retornado:

```js
const {DEFAULT_THRESHOLD, WCAG_TAGS, axeCoreVersion} = require('@gol-smiles/anemoi-core');
```

e em `collectProvenance`, após `thresholds`:

```js
    thresholds: {pixelmatch: DEFAULT_THRESHOLD, mismatchTolerance: 0, fit: 'union'},
    // Regua da auditoria de acessibilidade (axe-core injetado na captura).
    a11y: {axeCore: axeCoreVersion(), ruleset: WCAG_TAGS},
```

`packages/web/src/run.js` — quatro mudanças:

1. Substituir `resolveExitCode` e adicionar `resolveA11yFlags` (logo após `prepareCapture`):

```js
// Codigo de saida dos gates: 1 apenas quando um gate ligado divergiu (cada
// flag observa somente a sua divergencia). Erros de execucao saem com 2 via
// bin (throw).
function resolveExitCode({parityDiverged = false, a11yDiverged = false} = {}, {failOnDiff = false, failOnA11y = false} = {}) {
  if (failOnDiff && parityDiverged) return 1;
  if (failOnA11y && a11yDiverged) return 1;
  return 0;
}

// Coleta sempre ligada por padrao (--no-a11y desliga); gate opt-in
// (--fail-on-a11y). Combinar as duas e contradicao: nao existe gate sobre
// uma coleta desligada.
function resolveA11yFlags(args) {
  const collectA11y = !args['no-a11y'];
  const failOnA11y = Boolean(args['fail-on-a11y']);
  if (!collectA11y && failOnA11y) {
    throw new Error('flags incompativeis: --no-a11y desliga a coleta que --fail-on-a11y precisa para o gate.');
  }
  return {collectA11y, failOnA11y};
}
```

2. Em `runCurrentState`, logo após o bloco que rejeita `--before-after`, validar as flags (antes de criar o runDir):

```js
  // Flags de acessibilidade (validadas antes de criar o runDir).
  let a11yFlags;
  try {
    a11yFlags = resolveA11yFlags(args);
  } catch (error) {
    console.error(`Erro: ${error.message}`);
    process.exit(1);
  }
```

3. Na chamada de `capturePipeline`, adicionar as opções e capturar os novos retornos:

```js
    const {manifest, captures, parityDiverged, a11yDiverged} = await capturePipeline({
      cells,
      acquireHost,
      runDir,
      statusFromParity: true,
      statusFromA11y: a11yFlags.failOnA11y,
      collectA11y: a11yFlags.collectA11y,
      manifestMeta: {
```

(restante do `manifestMeta`, `onStage` e `onProgress` inalterados.)

4. Substituir o bloco final de console/exit code:

```js
    if (manifest.status === 'failed') {
      const reasons = [
        parityDiverged ? 'Paridade divergente' : null,
        a11yDiverged ? 'Acessibilidade divergente' : null,
      ].filter(Boolean).join(' e ');
      console.log(`\n❌ ${reasons} — ${captures.length} prints em: ${runDir}`);
    } else {
      console.log(`\n✅ Concluído! ${captures.length} prints em: ${runDir}`);
      if (a11yDiverged) {
        console.log('⚠️  Acessibilidade com apontamentos — veja o bloco a11y no manifesto/galeria (gate desligado; use --fail-on-a11y para falhar).');
      }
    }
    console.log(`   Galeria: ${path.join(runDir, 'index.html')}`);
    const exitCode = resolveExitCode({parityDiverged, a11yDiverged}, {
      failOnDiff: Boolean(args['fail-on-diff']),
      failOnA11y: a11yFlags.failOnA11y,
    });
    if (exitCode !== 0) process.exitCode = exitCode;
```

E atualizar o export do módulo:

```js
module.exports = {createRunDir, prepareCapture, resolveExitCode, resolveA11yFlags, runCurrentState};
```

`docs/guides/web.md` — na tabela de flags, adicionar após a linha de `--fail-on-diff`:

```markdown
| `--no-a11y` | Desliga a coleta de acessibilidade (auditoria axe-core e snapshot ARIA). Incompatível com `--fail-on-a11y`. |
| `--fail-on-a11y` | Encerra com código de saída 1 quando há violação WCAG A/AA, árvore ARIA divergente do baseline WC ou coleta de a11y indisponível. Sem a flag, os apontamentos aparecem apenas no manifesto e na galeria, sem afetar status ou código de saída. |
```

Na tabela de códigos de saída, substituir a linha do `1` por:

```markdown
| `1` | Gate ligado divergente: paridade com `--fail-on-diff` (pixels ou dimensões), ou acessibilidade com `--fail-on-a11y` (violação WCAG, ARIA divergente ou coleta indisponível). O manifesto de bundle é preservado. |
```

E após o parágrafo "Para bloquear CI apenas em divergência real…", adicionar:

```markdown
A análise de acessibilidade roda em toda captura: cada célula ganha `<theme>.a11y.json` (auditoria
axe-core, WCAG A/AA) e `<theme>.aria.yaml` (árvore ARIA) ao lado do PNG, e o manifesto agrega o
veredito em `a11y`. A árvore ARIA de React e Angular é comparada à do WC baseline (paridade
semântica); divergências geram `aria-diff/<par>/<célula>.txt`. Falha na coleta nunca invalida a
evidência visual: a célula registra o erro e, com `--fail-on-a11y`, o gate falha — "não consegui
medir" não é "está acessível".
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w packages/web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/run.js packages/web/src/provenance.js docs/guides/web.md packages/web/test/run-exit.test.js packages/web/test/provenance.test.js
git commit -m "feat(web): flags --no-a11y e --fail-on-a11y com gate e proveniencia do axe"
```

---

### Task 6: Galeria e summary exibem auditoria e paridade ARIA

**Files:**
- Modify: `packages/core/src/output.js` (`writeSummary` + `renderHtml`)
- Test: `packages/core/test/output.test.js` (adicionar)

**Interfaces:**
- Consumes: formato do manifesto das Tasks 3/4 (`manifest.a11y` agregado; `groups[].a11y = {audits, ariaParity}`).
- Produces: galeria offline com coluna "A11y (WCAG A/AA)" (badge por célula + painel expandível) e chip agregado no masthead; `summary.md` com seção `## Acessibilidade`. Manifests sem `a11y` renderizam exatamente como hoje.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar a `packages/core/test/output.test.js`:

```js
const A11Y_GROUP = {
  label: 'gol · Primary · sm · light',
  wc: 'wc/gol/Primary/sm/light.png',
  react: 'react/gol/Primary/sm/light.png',
  parity: [{against: 'react', mismatch: 0, width: 40, height: 40, sizeMatch: true}],
  a11y: {
    audits: {
      wc: {violations: [{id: 'button-name', impact: 'critical', wcag: ['wcag2a'], description: 'Botao sem nome', helpUrl: 'https://dequeuniversity.com/rules/axe/button-name', nodes: [{target: 'button', html: '<button></button>'}]}], artifactPath: 'wc/gol/Primary/sm/light.a11y.json'},
      react: {error: 'axe timeout'},
    },
    ariaParity: [{against: 'react', match: false, diffPath: 'aria-diff/react-vs-wc/gol-Primary-sm-light.txt'}],
  },
};

test('renderHtml embute o bloco a11y por celula e o agregado no payload', () => {
  const html = renderHtml(grid({
    cellCount: 1,
    a11y: {totalViolations: 1, worstImpact: 'critical', ariaMismatches: 1, ruleset: ['wcag2a']},
    axes: {frameworks: ['wc', 'react']},
    groups: [A11Y_GROUP],
  }));
  assert.ok(html.includes('"a11y":{"audits"'));
  assert.ok(html.includes('"button-name"'));
  assert.ok(html.includes('"error":"axe timeout"'));
  assert.ok(html.includes('"totalViolations":1'));
  assert.match(html, /A11y \(WCAG A\/AA\)/);
  assert.match(html, /function a11yState/);
  assert.match(html, /function a11yDetailHtml/);
  assert.match(html, /a11ySummary/);
  assert.match(html, /aria-diff\/react-vs-wc\/gol-Primary-sm-light\.txt/);
});

test('renderHtml sem a11y (manifesto antigo) nao rende coluna nem chip a11y', () => {
  const html = renderHtml(grid({
    cellCount: 1,
    axes: {frameworks: ['wc', 'react']},
    groups: [{label: 'gol · Primary · sm · light', wc: 'a.png', react: 'b.png', parity: []}],
  }));
  assert.ok(html.includes('"a11y":null'));
  // A coluna so aparece quando alguma celula tem a11y (hasA11y em runtime);
  // o payload sem dados garante isso.
  assert.ok(!html.includes('"audits"'));
});

test('writeSummary: renderiza secao de acessibilidade quando presente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-a11y-'));
  const p = writeSummary(dir, grid({
    cellCount: 1,
    runDir: dir,
    a11y: {totalViolations: 3, worstImpact: 'serious', ariaMismatches: 1, ruleset: ['wcag2a', 'wcag2aa']},
  }));
  const md = fs.readFileSync(p, 'utf8');
  assert.match(md, /## Acessibilidade/);
  assert.match(md, /Violações WCAG: 3 \(pior impacto: serious\)/);
  assert.match(md, /1 célula\(s\) divergente\(s\)/);
  assert.match(md, /wcag2a, wcag2aa/);
});

test('writeSummary: sem a11y, secao nao aparece', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-noa11y-'));
  const p = writeSummary(dir, grid({cellCount: 1, runDir: dir}));
  const md = fs.readFileSync(p, 'utf8');
  assert.ok(!md.includes('Acessibilidade'));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w packages/core`
Expected: FAIL — os 4 testes novos.

- [ ] **Step 3: Implementar em `packages/core/src/output.js`**

**3a. `writeSummary`** — após o bloco `if (manifest.provenance) {...}`, adicionar:

```js
  if (manifest.a11y) {
    const a = manifest.a11y;
    lines.push(
      '',
      '## Acessibilidade',
      '',
      `- Violações WCAG: ${a.totalViolations}${a.worstImpact ? ` (pior impacto: ${a.worstImpact})` : ''}`,
      `- Paridade ARIA: ${a.ariaMismatches === 0 ? 'sem divergência' : `${a.ariaMismatches} célula(s) divergente(s)`}`,
      `- Régua: axe-core com tags ${(a.ruleset || []).join(', ')}`,
    );
  }
```

**3b. `renderHtml`** — mudanças pontuais:

No mapeamento de `cells`, incluir o a11y do grupo:

```js
  const cells = groups.map((g) => {
    const cell = {label: g.label, parity: g.parity || [], a11y: g.a11y || null};
    for (const fw of frameworks) cell[fw] = g[fw] || null;
    return cell;
  });
```

No objeto `data`, incluir o agregado:

```js
    parityLabel: manifest.parityLabel,
    a11y: manifest.a11y || null,
    frameworks,
    cells,
```

No CSS (dentro do `<style>`, após as regras de `.pill`):

```css
  .masthead .summary + .summary { margin-left:8px; }
  tr.a11y-detail td { background:var(--soft); padding:14px 20px; }
  .a11y-panel { display:flex; flex-wrap:wrap; gap:20px; font-size:13px; }
  .a11y-panel .ab { min-width:260px; max-width:460px; }
  .a11y-panel h4 { margin:0 0 6px; font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--sub); }
  .a11y-panel ul { margin:0; padding-left:18px; }
  .a11y-panel li { margin-bottom:8px; }
  .a11y-panel pre { margin:4px 0 0; padding:6px 8px; background:#fff; border:1px solid var(--line); border-radius:6px; font-size:11px; overflow-x:auto; white-space:pre-wrap; word-break:break-all; }
  .a11y-panel .imp { font-weight:700; }
  .a11y-panel .imp.critical, .a11y-panel .imp.serious { color:var(--bad); }
  .a11y-panel .aerr { color:var(--sub); font-style:italic; margin:0; }
  .a11y-panel .aok { color:var(--ok); margin:0; }
```

No HTML do masthead, após o span `paritySummary`:

```html
  <span class="summary" id="a11ySummary" style="display:none"></span>
```

No script da galeria, após `const hasParity = ...`:

```js
  const hasA11y = CELLS.some((c) => c.a11y);

  // Estado a11y da celula: 'bad' (violacao ou ARIA divergente), 'na' (coleta
  // indisponivel, sem violacao), 'ok' (limpo).
  function a11yState(a) {
    if (!a) return null;
    const audits = Object.values(a.audits || {});
    const violations = audits.reduce((n, x) => n + (x.violations || []).length, 0);
    const ariaBad = (a.ariaParity || []).filter((p) => p.match === false).length;
    const errors = audits.filter((x) => x.error).length;
    if (violations > 0 || ariaBad > 0) return {kind: 'bad', violations, ariaBad, errors};
    if (errors > 0) return {kind: 'na', violations, ariaBad, errors};
    return {kind: 'ok', violations, ariaBad, errors};
  }
```

Após o bloco do `paritySummary` (antes dos filtros), o chip agregado:

```js
  const as = document.getElementById('a11ySummary');
  if (DATA.a11y) {
    as.style.display = '';
    const a = DATA.a11y;
    const bad = a.totalViolations > 0 || a.ariaMismatches > 0;
    as.className = 'summary ' + (bad ? 'bad' : 'ok');
    as.textContent = bad
      ? '✗ a11y: ' + a.totalViolations + ' violação(ões)'
        + (a.worstImpact ? ' · pior: ' + a.worstImpact : '')
        + (a.ariaMismatches ? ' · ' + a.ariaMismatches + ' ≠aria' : '')
      : '✓ a11y sem apontamentos';
  }
```

No cabeçalho da tabela:

```js
  document.getElementById('head').innerHTML =
    '<th style="width:180px">Célula</th>' +
    FWS.map((fw) => '<th>' + fwLabel(fw) + '</th>').join('') +
    (hasParity ? '<th style="width:160px">' + esc(DATA.parityLabel) + '</th>' : '') +
    (hasA11y ? '<th style="width:170px">A11y (WCAG A/AA)</th>' : '');
```

Antes de `function render()`:

```js
  const a11yOpen = new Set();

  function a11yDetailHtml(c) {
    const a = c.a11y;
    const blocks = [];
    for (const [fw, audit] of Object.entries(a.audits || {})) {
      if (audit.error) {
        blocks.push('<div class="ab"><h4>' + esc(fwLabel(fw)) + '</h4><p class="aerr">Coleta indisponível: ' + esc(audit.error) + '</p></div>');
        continue;
      }
      const items = (audit.violations || []).map((v) =>
        '<li><strong>' + esc(v.id) + '</strong> <span class="imp ' + esc(v.impact || '') + '">' + esc(v.impact || 'sem impacto') + '</span> — ' +
        esc(v.description || '') + ' <a href="' + esc(v.helpUrl || '#') + '" target="_blank" rel="noreferrer">regra ↗</a>' +
        (v.nodes || []).map((n) => '<pre>' + esc(n.html) + '</pre>').join('') + '</li>').join('');
      blocks.push('<div class="ab"><h4>' + esc(fwLabel(fw)) +
        (audit.artifactPath ? ' <a href="' + esc(audit.artifactPath) + '" target="_blank">json ↗</a>' : '') + '</h4>' +
        (items ? '<ul>' + items + '</ul>' : '<p class="aok">Sem violações.</p>') + '</div>');
    }
    const aria = (a.ariaParity || []).map((p) =>
      '<li>' + esc(fwLabel(p.against)) + ': ' + (p.match !== false
        ? '✓ árvore ARIA idêntica ao baseline'
        : '✗ árvore ARIA divergente' + (p.diffPath ? ' — <a href="' + esc(p.diffPath) + '" target="_blank">ver diff ↗</a>' : '')) + '</li>').join('');
    return '<div class="a11y-panel">' + blocks.join('') +
      (aria ? '<div class="ab"><h4>Paridade ARIA</h4><ul>' + aria + '</ul></div>' : '') + '</div>';
  }
```

Dentro de `render()`, após montar `pcell`, montar a célula a11y e a linha de detalhe (e usar ambas no retorno):

```js
      let acell = '';
      if (hasA11y) {
        const st = a11yState(c.a11y);
        if (!st) {
          acell = '<td class="pcell"><span class="pill na">—</span></td>';
        } else if (st.kind === 'ok') {
          acell = '<td class="pcell"><span class="pill ok">✓ a11y</span></td>';
        } else {
          const parts = [];
          if (st.violations) parts.push(st.violations + (st.violations === 1 ? ' violação' : ' violações'));
          if (st.ariaBad) parts.push('≠aria');
          if (st.errors) parts.push('coleta indisponível');
          acell = '<td class="pcell"><button class="pill ' + (st.kind === 'bad' ? 'bad' : 'na') +
            ' a11y-toggle" data-i="' + i + '" title="detalhar a11y">' + esc(parts.join(' · ')) + '</button></td>';
        }
      }
      const cols = 1 + FWS.length + (hasParity ? 1 : 0) + (hasA11y ? 1 : 0);
      const detail = (hasA11y && a11yOpen.has(i) && c.a11y)
        ? '<tr class="a11y-detail' + (hide ? ' hidden' : '') + '"><td colspan="' + cols + '">' + a11yDetailHtml(c) + '</td></tr>'
        : '';
      return '<tr class="' + (hide ? 'hidden' : '') + '">' +
        '<td class="id"><div class="story">' + esc(c.story) + '</div><div class="dims">' +
        esc([c.viewport, c.theme].filter(Boolean).join(' · ')) + '</div></td>' +
        tds + pcell + acell + '</tr>' + detail;
```

No listener de clique das linhas (`#rows`), adicionar o toggle antes do `return` final:

```js
    const t = e.target.closest('button.pill.a11y-toggle');
    if (t) {
      const idx = Number(t.dataset.i);
      a11yOpen.has(idx) ? a11yOpen.delete(idx) : a11yOpen.add(idx);
      render();
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w packages/core`
Expected: PASS — incluindo os testes antigos da galeria (nenhuma asserção existente muda: coluna/chip só aparecem com dados a11y).

- [ ] **Step 5: Inspeção visual rápida da galeria**

Gerar um HTML de amostra e abrir:

```bash
node -e "
const {renderHtml} = require('./packages/core/src/output');
const {buildManifest} = require('./packages/core/src/manifest');
const m = buildManifest({tool: 'Anemoi Web', card: 'DEV', component: 'tgr-button', mode: 'current', runDir: '/tmp',
  cellCount: 1,
  a11y: {totalViolations: 1, worstImpact: 'critical', ariaMismatches: 1, ruleset: ['wcag2a','wcag2aa']},
  axes: {frameworks: ['wc','react']},
  groups: [{label: 'gol · Primary · sm · light', wc: 'wc.png', react: 'react.png',
    parity: [{against: 'react', mismatch: 0, sizeMatch: true}],
    a11y: {audits: {wc: {violations: [{id: 'button-name', impact: 'critical', wcag: ['wcag2a'], description: 'Botao sem nome', helpUrl: 'https://example.com', nodes: [{target: 'button', html: '<button></button>'}]}], artifactPath: 'wc.a11y.json'}, react: {error: 'axe timeout'}},
      ariaParity: [{against: 'react', match: false, diffPath: 'aria-diff/react-vs-wc/x.txt'}]}}]});
require('fs').writeFileSync('/tmp/anemoi-galeria-a11y.html', renderHtml(m));
console.log('/tmp/anemoi-galeria-a11y.html');
"
open /tmp/anemoi-galeria-a11y.html
```

Verificar: chip `✗ a11y: 1 violação(ões) · pior: critical · 1 ≠aria` no masthead; coluna "A11y (WCAG A/AA)" com badge vermelho; clique no badge abre painel com a violação (helpUrl, html do nó), erro de coleta do react e link do diff ARIA.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/output.js packages/core/test/output.test.js
git commit -m "feat(core): galeria e summary exibem auditoria e paridade ARIA"
```

---

### Task 7: Verificação E2E no consumidor real (tangerina-web-core)

**Files:**
- Nenhum arquivo novo do produto; correções pontuais se o E2E revelar problema.
- Checkout consumidor: `/Users/user/Documents/projects/tangerina-ds/tangerina-web-core` (alias `tangerina` em `.anemoi.local.json`).

**Interfaces:**
- Consumes: tudo das Tasks 1–6 via `npm run web`.
- Produces: confirmação de que artefatos, manifesto, galeria, flags e exit codes funcionam contra o Tangerina real.

- [ ] **Step 1: Suíte completa do repo**

Run: `npm test`
Expected: PASS em root, core, web, service e preset.

- [ ] **Step 2: Run real com a11y default**

Rodar em background com timeout generoso (builds levam minutos):

```bash
npm run web -- --repo tangerina --component tgr-button --card A11Y-E2E
echo "exit=$?"
```

Expected: `exit=0` (a11y não afeta exit sem gate). No runDir impresso:
- `wc/**/light.a11y.json` e `wc/**/light.aria.yaml` existem (idem react/angular);
- `manifest.json` tem `a11y` no topo (`totalViolations`, `worstImpact`, `ariaMismatches`, `ruleset` com as 5 tags) e `groups[].a11y.audits` + `groups[].a11y.ariaParity`;
- `provenance.a11y.axeCore` preenchido;
- `summary.md` tem a seção `## Acessibilidade`;
- galeria abre offline com a coluna A11y.

Verificar por script (ajustar `<runDir>`):

```bash
node -e "
const m = require('<runDir>/manifest.json');
console.log('a11y topo:', JSON.stringify(m.a11y));
console.log('provenance.a11y:', JSON.stringify(m.provenance.a11y));
console.log('grupos com a11y:', m.groups.filter(g => g.a11y).length + '/' + m.groups.length);
console.log('ariaParity exemplo:', JSON.stringify(m.groups[0].a11y.ariaParity));
"
```

- [ ] **Step 3: Calibração da paridade ARIA (checkpoint de julgamento)**

O WC captura em `#storybook-root` e os harnesses em `#evidence-root`. Inspecionar os `aria-diff/*.txt` gerados (se houver): a divergência é semântica real (role/nome/estado diferente) ou ruído estrutural (decorator do Storybook, wrapper do harness)?

- Divergência real → comportamento correto, seguir adiante.
- Ruído estrutural em TODAS as células → registrar o achado no ledger e tratar como fix nesta task (ex.: ajustar o nó comparado), mantendo a comparação estrita — nunca "afrouxar" o match para esconder ruído.

- [ ] **Step 4: Gates e flags**

```bash
# Gate a11y: exit 1 se houver violação/mismatch/erro (provável em componente real)
npm run web -- --repo tangerina --component tgr-button --card A11Y-E2E --skip-build --fail-on-a11y; echo "exit=$?"

# Coleta desligada: sem artefatos a11y, sem bloco no manifesto
npm run web -- --repo tangerina --component tgr-button --card A11Y-E2E --skip-build --no-a11y; echo "exit=$?"

# Conflito de flags: erro de uso imediato
npm run web -- --repo tangerina --component tgr-button --no-a11y --fail-on-a11y; echo "exit=$?"
```

Expected, respectivamente:
- exit 1 com `status: "failed"` no manifesto SE o run do Step 2 mostrou apontamentos; exit 0 se o componente estiver limpo (validar coerência com o manifesto);
- exit 0, manifesto sem chave `a11y`, nenhum `*.a11y.json` no runDir;
- exit 1 imediato com mensagem `Erro: flags incompativeis: ...`, sem criar runDir.

- [ ] **Step 5: Regressão do gate da Fase 0**

```bash
npm run web -- --repo tangerina --component tgr-button --skip-build --fail-on-diff; echo "exit=$?"
```

Expected: mesmo comportamento documentado da Fase 0 (exit 1 apenas se paridade de pixels/dimensão divergir; a11y não interfere neste gate).

- [ ] **Step 6: Commit (se houve correções) e encerramento**

```bash
git add -A && git commit -m "test(web): ajustes da verificacao e2e da analise de acessibilidade"
```

(Somente se o E2E exigiu correções; caso contrário, nada a commitar.)
