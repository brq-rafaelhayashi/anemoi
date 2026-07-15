# Anemoi Service (verificador do Koba) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor o Anemoi como serviço HTTP local (`POST /runs` / `GET /runs/:id`) que captura os panes React e Angular do `/compare` vivo do Koba para um `CompareState` arbitrário, faz diff de pixels React×Angular e publica o bundle padrão do Anemoi.

**Architecture:** Novo workspace `packages/service` que orquestra os módulos existentes do core (`captureCells`, `writeDiff`, `writeManifest`, `renderHtml`) através de um host novo `koba-live` apontado para o dev server do Koba. Fila FIFO em memória (1 run por vez), runs indexados num `Map`, bundle gravado em `outputs/anemoi-web/<card>/<componente>/<ts>-<id>/` no checkout do DS. Spec: `docs/superpowers/specs/2026-07-14-anemoi-servico-verificador-design.md`.

**Tech Stack:** Node ≥24, CommonJS, `node:http` (sem framework), `node:test`, Playwright (via `@gol-smiles/anemoi-core`), npm workspaces.

## Global Constraints

- Node `>=24`, CommonJS, testes com `node --test` (padrão dos pacotes existentes).
- Nenhuma dependência nova de runtime: só `@gol-smiles/anemoi-core` e `@gol-smiles/anemoi-web` (workspace). `playwright` entra apenas como devDependency de teste do service.
- O core (`packages/core`) permanece agnóstico: não pode conhecer Koba nem Tangerina. As duas mudanças no core deste plano (`parityLabel` dinâmico, export do `MIME`) são genéricas.
- O serviço **nunca** executa Git no checkout consumidor.
- API: `mode: "state"` é o único valor aceito na v1; `axes.themes` só aceita `["light"]`; viewports válidos são os de `VIEWPORT_WIDTHS` (`xs, sm, md, lg, xl`).
- Servidor escuta apenas em `127.0.0.1`. CORS restrito à origem do Koba configurada.
- Mensagens de erro em pt-BR, acionáveis (dizem o que rodar), no estilo das existentes.
- Fora deste plano: o botão "Verificar" no repo do Koba (plano próprio no repo `koba`) e a fase 2 (baseline WC, `mode: "stories"`, theme/brand).

## File Structure

```
packages/service/
  package.json               # @gol-smiles/anemoi-service
  bin/anemoi-service.js      # entry: --doctor ou sobe o servidor
  src/config.js              # lê seção "service" do .anemoi.local.json (reusa resolveRepository do web)
  src/stateAdapter.js        # stableStringify, stateHash, normalizeCompareState, compareStateToCells
  src/kobaCatalog.js         # cliente GET /catalog.json do Koba
  src/kobaHost.js            # host {urlFor, selectorFor, verify} sobre o /compare vivo
  src/parityPair.js          # diff react×angular (react = referência)
  src/runStore.js            # Map de runs + máquina de estados
  src/queue.js               # fila FIFO, 1 job em voo
  src/runner.js              # executeRun: captura → paridade → bundle
  src/server.js              # rotas HTTP, validação, CORS, galeria
  src/doctor.js              # checks: config, DS, Koba, porta
  test/*.test.js             # um arquivo por módulo
  test/fixtures/compare-page.html   # página fake imitando o /compare do Koba
  test/fixtures/koba-catalog.json   # fixture de contrato do catálogo real
  README.md                  # uso + roteiro de smoke manual com Koba vivo
packages/core/src/output.js  # renderHtml: label de paridade dinâmico (manifest.parityLabel)
packages/core/src/server.js  # exportar MIME
package.json                 # workspaces += packages/service; script "service"
```

---

### Task 1: Scaffold do pacote + config do serviço

**Files:**
- Create: `packages/service/package.json`
- Create: `packages/service/src/config.js`
- Create: `packages/service/test/config.test.js`
- Modify: `package.json` (raiz — workspaces e script)

**Interfaces:**
- Consumes: `readLocalConfig`, `resolveRepository` de `@gol-smiles/anemoi-web/src/config` (existentes).
- Produces: `readServiceConfig(rootDir, {cwd}) → {port: number, kobaBaseUrl: string (origin normalizada), dsRepo: string (path absoluto)}`. Lança `Error` com mensagem acionável se a config for inválida ou o repo não resolver.

- [ ] **Step 1: Criar o package.json do service e registrar o workspace**

`packages/service/package.json`:

```json
{
  "name": "@gol-smiles/anemoi-service",
  "version": "0.1.0",
  "private": true,
  "description": "Anemoi Service: verificacao de paridade sob demanda sobre o Koba vivo.",
  "main": "src/server.js",
  "bin": { "anemoi-service": "bin/anemoi-service.js" },
  "files": ["bin", "src"],
  "scripts": { "test": "node --test" },
  "engines": { "node": ">=24" },
  "dependencies": {
    "@gol-smiles/anemoi-core": "*",
    "@gol-smiles/anemoi-web": "*"
  },
  "devDependencies": {
    "playwright": "^1.48.0"
  }
}
```

No `package.json` da raiz, adicionar o workspace e o script (manter o resto intacto):

```json
  "workspaces": [
    "packages/core",
    "packages/web",
    "packages/service",
    "anemoi-preset"
  ],
```

e em `"scripts"`:

```json
    "service": "node packages/service/bin/anemoi-service.js",
```

Rodar: `npm install`
Esperado: sem erros; `node -e "require('@gol-smiles/anemoi-service/package.json')"` resolve.

- [ ] **Step 2: Escrever o teste que falha**

`packages/service/test/config.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {readServiceConfig} = require('../src/config');

function makeRoot(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-config-'));
  const dsRepo = path.join(root, 'ds');
  fs.mkdirSync(dsRepo);
  fs.writeFileSync(path.join(root, '.anemoi.local.json'), JSON.stringify({
    repositories: {ds: {path: dsRepo}},
    defaultRepository: 'ds',
    ...config,
  }));
  return {root, dsRepo};
}

test('usa defaults quando a secao service esta ausente', () => {
  const {root, dsRepo} = makeRoot({});
  const config = readServiceConfig(root);
  assert.equal(config.port, 9200);
  assert.equal(config.kobaBaseUrl, 'http://localhost:9000');
  assert.equal(config.dsRepo, dsRepo);
});

test('aceita overrides e normaliza kobaBaseUrl para origin', () => {
  const {root} = makeRoot({service: {port: 9300, kobaBaseUrl: 'http://localhost:9000/algum/path'}});
  const config = readServiceConfig(root);
  assert.equal(config.port, 9300);
  assert.equal(config.kobaBaseUrl, 'http://localhost:9000');
});

test('rejeita porta invalida', () => {
  const {root} = makeRoot({service: {port: 'abc'}});
  assert.throws(() => readServiceConfig(root), /porta/i);
});

test('rejeita kobaBaseUrl invalida', () => {
  const {root} = makeRoot({service: {kobaBaseUrl: 'nao-e-url'}});
  assert.throws(() => readServiceConfig(root), /kobaBaseUrl/);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: FAIL — `Cannot find module '../src/config'`.

- [ ] **Step 4: Implementar**

`packages/service/src/config.js`:

```js
'use strict';
// Config do Anemoi Service — secao "service" do .anemoi.local.json na raiz do anemoi.
// O checkout do DS reusa o mecanismo de aliases do anemoi-web (repositories/defaultRepository).

const {readLocalConfig, resolveRepository} = require('@gol-smiles/anemoi-web/src/config');

const DEFAULTS = {port: 9200, kobaBaseUrl: 'http://localhost:9000'};

function readServiceConfig(rootDir, {cwd = rootDir} = {}) {
  const config = readLocalConfig(rootDir);
  const service = config.service || {};

  const port = service.port ?? DEFAULTS.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Config invalida: "service.port" deve ser uma porta valida (1-65535), recebi ${JSON.stringify(service.port)}.`);
  }

  const rawUrl = service.kobaBaseUrl || DEFAULTS.kobaBaseUrl;
  let kobaBaseUrl;
  try {
    kobaBaseUrl = new URL(rawUrl).origin;
  } catch {
    throw new Error(`Config invalida: "service.kobaBaseUrl" nao e uma URL: ${JSON.stringify(rawUrl)}.`);
  }

  const dsRepo = resolveRepository({rootDir, cwd, repoArg: service.repo});
  return {port, kobaBaseUrl, dsRepo};
}

module.exports = {readServiceConfig, DEFAULTS};
```

- [ ] **Step 5: Rodar e ver passar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
git add packages/service package.json package-lock.json
git commit -m "feat(service): scaffold do pacote com config do servico"
```

---

### Task 2: Core — `parityLabel` dinâmico e export do `MIME`

A galeria do core exibe o cabeçalho fixo "Paridade vs wc"; o service compara react×angular, então o label precisa vir do manifesto. O mapa `MIME` será reusado pela rota de galeria do service.

**Files:**
- Modify: `packages/core/src/output.js:207` (cabeçalho da tabela no script embutido) e o objeto `data` em `packages/core/src/output.js:70-80`
- Modify: `packages/core/src/server.js:68` (export)
- Test: `packages/core/test/output.test.js`, `packages/core/test/server.test.js`

**Interfaces:**
- Consumes: nada novo.
- Produces: `renderHtml(manifest)` respeita `manifest.parityLabel` (string opcional; default `'Paridade vs wc'`); `require('@gol-smiles/anemoi-core').MIME` → mapa extensão→content-type.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `packages/core/test/output.test.js`:

```js
test('renderHtml embute parityLabel customizado no payload da galeria', () => {
  const html = renderHtml({
    component: 'tgr-button', card: 'koba', mode: 'koba-state', cellCount: 2,
    generatedAt: '2026-07-14T00:00:00.000Z',
    axes: {frameworks: ['react', 'angular']},
    groups: [{label: 'gol · estado abc · sm · light', react: 'a.png', angular: 'b.png', parity: [{against: 'angular', mismatch: 0, diffPath: 'd.png'}]}],
    parityLabel: 'Paridade vs react',
  });
  assert.ok(html.includes('"parityLabel":"Paridade vs react"'));
  assert.ok(!html.includes("'Paridade vs wc</th>'"));
});

test('renderHtml usa "Paridade vs wc" como parityLabel default', () => {
  const html = renderHtml({
    component: 'tgr-button', card: 'c', mode: 'current', cellCount: 1,
    generatedAt: '2026-07-14T00:00:00.000Z', axes: {}, groups: [],
  });
  assert.ok(html.includes('"parityLabel":"Paridade vs wc"'));
});
```

(Se o arquivo não importar `renderHtml`, incluir no require existente do topo: `const {renderHtml} = require('../src/output');`.)

Adicionar ao final de `packages/core/test/server.test.js`:

```js
test('exporta o mapa MIME', () => {
  const {MIME} = require('../src/server');
  assert.equal(MIME['.html'], 'text/html; charset=utf-8');
  assert.equal(MIME['.png'], 'image/png');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -w @gol-smiles/anemoi-core`
Esperado: FAIL — parityLabel ausente do payload e `MIME` undefined.

- [ ] **Step 3: Implementar**

Em `packages/core/src/output.js`, no objeto `data` dentro de `renderHtml` (após `cellCount`):

```js
    cellCount: manifest.cellCount,
    parityLabel: manifest.parityLabel || 'Paridade vs wc',
    frameworks,
    cells,
```

E no script embutido, trocar a linha do cabeçalho:

```js
    (hasParity ? '<th style="width:160px">Paridade vs wc</th>' : '');
```

por:

```js
    (hasParity ? '<th style="width:160px">' + esc(DATA.parityLabel) + '</th>' : '');
```

Em `packages/core/src/server.js`, trocar o export final:

```js
module.exports = {serveStatic, MIME};
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -w @gol-smiles/anemoi-core`
Esperado: PASS (suíte inteira, incluindo os 3 testes novos).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/output.js packages/core/src/server.js packages/core/test/output.test.js packages/core/test/server.test.js
git commit -m "feat(core): parityLabel dinamico na galeria e export do MIME"
```

---

### Task 3: stateAdapter — hash estável e normalização do CompareState

**Files:**
- Create: `packages/service/src/stateAdapter.js`
- Test: `packages/service/test/stateAdapter.test.js`

**Interfaces:**
- Consumes: nada dos outros pacotes (puro).
- Produces:
  - `stableStringify(value) → string` (JSON com chaves ordenadas, determinístico)
  - `stateHash(state) → string` (8 hex chars, estável para o mesmo estado)
  - `normalizeCompareState(compareState, catalog) → {componentKey, props, slots}` — merge sobre os defaults do catálogo (espelha o `parseCompareState` do Koba). Lança `Error` com `error.code === 'UNKNOWN_COMPONENT'` se `componentKey` não existe no catálogo.
  - Formato de entrada do catálogo (contrato do `GET /catalog.json` do Koba): `[{key, tag, name, initialArgs: {}, slots: [{name, defaultContent}], props: [...], events: [...]}]`.

- [ ] **Step 1: Escrever o teste que falha**

`packages/service/test/stateAdapter.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {stableStringify, stateHash, normalizeCompareState} = require('../src/stateAdapter');

const CATALOG = [{
  key: 'tgr-button',
  tag: 'tgr-button',
  name: 'Button',
  initialArgs: {label: 'Comprar', variant: 'primary'},
  slots: [{name: 'icon', defaultContent: ''}],
  props: [], events: [],
}];

test('stableStringify ordena chaves recursivamente', () => {
  assert.equal(
    stableStringify({b: 1, a: {d: [2, {z: 3, y: 4}], c: 5}}),
    '{"a":{"c":5,"d":[2,{"y":4,"z":3}]},"b":1}',
  );
});

test('stateHash e estavel independente da ordem das chaves', () => {
  const h1 = stateHash({componentKey: 'tgr-button', props: {a: 1, b: 2}, slots: {}});
  const h2 = stateHash({props: {b: 2, a: 1}, slots: {}, componentKey: 'tgr-button'});
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{8}$/);
});

test('normalizeCompareState faz merge sobre os defaults do catalogo', () => {
  const state = normalizeCompareState(
    {componentKey: 'tgr-button', props: {label: 'Pagar'}, slots: {}},
    CATALOG,
  );
  assert.deepEqual(state, {
    componentKey: 'tgr-button',
    props: {label: 'Pagar', variant: 'primary'},
    slots: {icon: ''},
  });
});

test('normalizeCompareState rejeita componentKey desconhecido com code', () => {
  assert.throws(
    () => normalizeCompareState({componentKey: 'tgr-nao-existe', props: {}, slots: {}}, CATALOG),
    (error) => error.code === 'UNKNOWN_COMPONENT' && /tgr-nao-existe/.test(error.message),
  );
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: FAIL — `Cannot find module '../src/stateAdapter'`.

- [ ] **Step 3: Implementar**

`packages/service/src/stateAdapter.js`:

```js
'use strict';
// Seam CompareState (Koba) ⇄ celulas (Anemoi).
// A normalizacao espelha o parseCompareState do Koba: estado efetivo =
// defaults do catalogo + overrides enviados. O hash da identidade estavel
// a evidencia de um estado ad-hoc.

const {createHash} = require('node:crypto');

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.keys(value).sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function stateHash(state) {
  return createHash('sha256').update(stableStringify(state)).digest('hex').slice(0, 8);
}

function normalizeCompareState(compareState, catalog) {
  const entry = catalog.find(component => component.key === compareState.componentKey);
  if (!entry) {
    const error = new Error(
      `componentKey desconhecido no catalogo do Koba: "${compareState.componentKey}". `
      + 'Confira GET /catalog.json — o Koba descartaria esse estado silenciosamente.',
    );
    error.code = 'UNKNOWN_COMPONENT';
    throw error;
  }
  const defaultSlots = Object.fromEntries((entry.slots || []).map(slot => [slot.name, slot.defaultContent]));
  return {
    componentKey: entry.key,
    props: {...(entry.initialArgs || {}), ...(compareState.props || {})},
    slots: {...defaultSlots, ...(compareState.slots || {})},
  };
}

module.exports = {stableStringify, stateHash, normalizeCompareState};
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/service/src/stateAdapter.js packages/service/test/stateAdapter.test.js
git commit -m "feat(service): normalizacao e hash estavel do CompareState"
```

---

### Task 4: stateAdapter — CompareState → células

**Files:**
- Modify: `packages/service/src/stateAdapter.js`
- Test: `packages/service/test/stateAdapter.test.js` (acrescentar)

**Interfaces:**
- Consumes: `buildMatrix` de `@gol-smiles/anemoi-core`; `VIEWPORT_WIDTHS` de `@gol-smiles/anemoi-web/src/brands`; `stateHash` (Task 3).
- Produces: `compareStateToCells(state, {viewports = ['sm','lg']}) → cells[]` onde cada cell é `{framework: 'react'|'angular', brand: 'gol', storyId: 'koba-state-<hash8>', storyName: 'estado <hash8>', viewport, width, theme: 'light', args: {}, component: state.componentKey, state}`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `packages/service/test/stateAdapter.test.js` (o require do topo passa a incluir `compareStateToCells`):

```js
const {stableStringify, stateHash, normalizeCompareState, compareStateToCells} = require('../src/stateAdapter');
```

```js
test('compareStateToCells produz react e angular por viewport, com state e component', () => {
  const state = {componentKey: 'tgr-button', props: {label: 'Pagar'}, slots: {}};
  const cells = compareStateToCells(state, {viewports: ['sm', 'lg']});

  assert.equal(cells.length, 4); // 2 frameworks x 2 viewports x 1 theme
  const hash = stateHash(state);
  for (const cell of cells) {
    assert.ok(['react', 'angular'].includes(cell.framework));
    assert.equal(cell.brand, 'gol');
    assert.equal(cell.theme, 'light');
    assert.equal(cell.storyId, `koba-state-${hash}`);
    assert.equal(cell.component, 'tgr-button');
    assert.deepEqual(cell.state, state);
  }
  assert.equal(cells.find(c => c.viewport === 'sm').width, 360);
  assert.equal(cells.find(c => c.viewport === 'lg').width, 1024);
});

test('compareStateToCells usa sm,lg como default de viewports', () => {
  const cells = compareStateToCells({componentKey: 'tgr-button', props: {}, slots: {}});
  assert.deepEqual([...new Set(cells.map(c => c.viewport))].sort(), ['lg', 'sm']);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: FAIL — `compareStateToCells is not a function`.

- [ ] **Step 3: Implementar**

Acrescentar em `packages/service/src/stateAdapter.js` (requires no topo, função antes do export):

```js
const {buildMatrix} = require('@gol-smiles/anemoi-core');
const {VIEWPORT_WIDTHS} = require('@gol-smiles/anemoi-web/src/brands');

const SERVICE_FRAMEWORKS = ['react', 'angular'];

function compareStateToCells(state, {viewports = ['sm', 'lg']} = {}) {
  const hash = stateHash(state);
  const story = {id: `koba-state-${hash}`, name: `estado ${hash}`};
  const cells = buildMatrix({
    frameworks: SERVICE_FRAMEWORKS,
    stories: [story],
    brands: ['gol'],
    themes: ['light'],
    viewports,
    viewportWidths: VIEWPORT_WIDTHS,
  });
  return cells.map(cell => ({...cell, component: state.componentKey, state}));
}

module.exports = {stableStringify, stateHash, normalizeCompareState, compareStateToCells};
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/service/src/stateAdapter.js packages/service/test/stateAdapter.test.js
git commit -m "feat(service): adaptador CompareState para celulas de captura"
```

---

### Task 5: Cliente do catálogo do Koba

**Files:**
- Create: `packages/service/src/kobaCatalog.js`
- Test: `packages/service/test/kobaCatalog.test.js`

**Interfaces:**
- Consumes: `fetch` global (Node ≥24).
- Produces: `fetchKobaCatalog(kobaBaseUrl, {timeoutMs = 5000, fetchImpl = fetch}) → Promise<catalog[]>`. Toda falha (rede, timeout, status ≠2xx, corpo não-lista) lança `Error` com `error.code === 'KOBA_UNAVAILABLE'` e mensagem acionável.

- [ ] **Step 1: Escrever o teste que falha**

`packages/service/test/kobaCatalog.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {fetchKobaCatalog} = require('../src/kobaCatalog');

function serve(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise(done => server.close(done)),
    }));
  });
}

test('retorna o catalogo quando o Koba responde 200 com lista', async () => {
  const server = await serve((req, res) => {
    assert.equal(req.url, '/catalog.json');
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify([{key: 'tgr-button', initialArgs: {}, slots: []}]));
  });
  const catalog = await fetchKobaCatalog(server.url);
  await server.close();
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].key, 'tgr-button');
});

test('KOBA_UNAVAILABLE quando o servidor nao responde', async () => {
  await assert.rejects(
    fetchKobaCatalog('http://127.0.0.1:1', {timeoutMs: 500}),
    (error) => error.code === 'KOBA_UNAVAILABLE' && /Suba o Koba/.test(error.message),
  );
});

test('KOBA_UNAVAILABLE quando responde 503 (DS sem build)', async () => {
  const server = await serve((_req, res) => {
    res.writeHead(503, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Manifesto do DS ausente'}));
  });
  await assert.rejects(
    fetchKobaCatalog(server.url),
    (error) => error.code === 'KOBA_UNAVAILABLE' && /503/.test(error.message),
  );
  await server.close();
});

test('KOBA_UNAVAILABLE quando o corpo nao e uma lista', async () => {
  const server = await serve((_req, res) => {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'algo'}));
  });
  await assert.rejects(fetchKobaCatalog(server.url), (error) => error.code === 'KOBA_UNAVAILABLE');
  await server.close();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: FAIL — `Cannot find module '../src/kobaCatalog'`.

- [ ] **Step 3: Implementar**

`packages/service/src/kobaCatalog.js`:

```js
'use strict';
// Cliente do catalogo vivo do Koba (GET /catalog.json).
// O catalogo e derivado do docs.json + stories do DS pelo proprio Koba.

function unavailable(message) {
  const error = new Error(message);
  error.code = 'KOBA_UNAVAILABLE';
  return error;
}

async function fetchKobaCatalog(kobaBaseUrl, {timeoutMs = 5000, fetchImpl = fetch} = {}) {
  let response;
  try {
    response = await fetchImpl(`${kobaBaseUrl}/catalog.json`, {signal: AbortSignal.timeout(timeoutMs)});
  } catch (error) {
    throw unavailable(
      `Koba indisponivel em ${kobaBaseUrl} (${error.message}). Suba o Koba: pnpm dev (no repo koba).`,
    );
  }
  if (!response.ok) {
    throw unavailable(
      `GET ${kobaBaseUrl}/catalog.json respondeu ${response.status} — o DS pode estar sem build. `
      + 'No repo koba, rode: pnpm ds:build.',
    );
  }
  const catalog = await response.json();
  if (!Array.isArray(catalog)) {
    throw unavailable(`GET ${kobaBaseUrl}/catalog.json nao retornou uma lista de componentes.`);
  }
  return catalog;
}

module.exports = {fetchKobaCatalog};
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/service/src/kobaCatalog.js packages/service/test/kobaCatalog.test.js
git commit -m "feat(service): cliente do catalogo vivo do Koba"
```

---

### Task 6: Host `koba-live`

**Files:**
- Create: `packages/service/src/kobaHost.js`
- Test: `packages/service/test/kobaHost.test.js`

**Interfaces:**
- Consumes: `VIEWPORT_WIDTHS` de `@gol-smiles/anemoi-web/src/brands`; contrato de host do `captureCells` do core: `{urlFor(cell, baseUrl), selectorFor(cell), verify?(page, cell)}`.
- Produces: `makeKobaHost() → host`. `urlFor` monta `<baseUrl>/compare/<component>?state=<JSON urlencoded>` (mesmo formato do `serializeCompareState` do Koba). `selectorFor` → `.koba-compare__pane--<framework>`. `verify` espera um custom element `tgr-*` definido dentro do pane; em falha, grava screenshot full-page em `cell.diagnosticsDir` (se presente) e relança.

- [ ] **Step 1: Escrever o teste que falha**

`packages/service/test/kobaHost.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');

const {makeKobaHost} = require('../src/kobaHost');

const CELL = {
  framework: 'react', brand: 'gol', storyId: 'koba-state-abc12345', storyName: 'estado abc12345',
  viewport: 'sm', width: 360, theme: 'light',
  component: 'tgr-button',
  state: {componentKey: 'tgr-button', props: {label: 'Pagar'}, slots: {}},
};

test('urlFor monta a URL do /compare com state serializado como no Koba', () => {
  const host = makeKobaHost();
  const url = host.urlFor(CELL, 'http://localhost:9000');
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'http://localhost:9000');
  assert.equal(parsed.pathname, '/compare/tgr-button');
  assert.deepEqual(JSON.parse(parsed.searchParams.get('state')), CELL.state);
});

test('selectorFor aponta para o pane do framework da celula', () => {
  const host = makeKobaHost();
  assert.equal(host.selectorFor(CELL), '.koba-compare__pane--react');
  assert.equal(host.selectorFor({...CELL, framework: 'angular'}), '.koba-compare__pane--angular');
});

function serveHtml(html) {
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

test('verify resolve quando o pane contem custom element tgr-* definido', async () => {
  const server = await serveHtml(`<!doctype html><html><body>
    <div class="koba-compare__pane koba-compare__pane--react"><tgr-fake></tgr-fake></div>
    <script>customElements.define('tgr-fake', class extends HTMLElement {});</script>
  </body></html>`);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(server.url);
  const host = makeKobaHost();
  await host.verify(page, CELL);
  await browser.close();
  await server.close();
});

test('verify falha com timeout e grava screenshot de diagnostico', async () => {
  const server = await serveHtml('<!doctype html><html><body><p>sem pane</p></body></html>');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(server.url);
  const diagnosticsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-diag-'));
  const host = makeKobaHost({verifyTimeoutMs: 1000});
  await assert.rejects(host.verify(page, {...CELL, diagnosticsDir}));
  const shots = fs.readdirSync(diagnosticsDir);
  assert.equal(shots.length, 1);
  assert.match(shots[0], /^verify-react-sm-light\.png$/);
  await browser.close();
  await server.close();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: FAIL — `Cannot find module '../src/kobaHost'`.

- [ ] **Step 3: Implementar**

`packages/service/src/kobaHost.js`:

```js
'use strict';
// Host "koba-live" — aponta o captureCells do core para o dev server do Koba.
// Um unico host cobre react e angular: o seletor varia por celula
// (.koba-compare__pane--react / --angular), a pagina e a mesma (/compare).

const fs = require('node:fs');
const path = require('node:path');
const {VIEWPORT_WIDTHS} = require('@gol-smiles/anemoi-web/src/brands');

// Espelha o serializeCompareState do Koba: ?state=<JSON>.
function serializeState(state) {
  const params = new URLSearchParams();
  params.set('state', JSON.stringify(state));
  return params.toString();
}

function urlFor(cell, baseUrl) {
  return `${baseUrl}/compare/${encodeURIComponent(cell.component)}?${serializeState(cell.state)}`;
}

function selectorFor(cell) {
  return `.koba-compare__pane--${cell.framework}`;
}

function makeKobaHost({verifyTimeoutMs = 15000} = {}) {
  // Espera o pane conter um custom element tgr-* ja definido (hidratado).
  // Em falha, grava um screenshot full-page como diagnostico no bundle e relanca.
  async function verify(page, cell) {
    try {
      await page.waitForFunction((selector) => {
        const pane = document.querySelector(selector);
        if (!pane) return false;
        const element = [...pane.querySelectorAll('*')]
          .find(node => node.tagName.toLowerCase().startsWith('tgr-'));
        return Boolean(element && customElements.get(element.tagName.toLowerCase()));
      }, selectorFor(cell), {timeout: verifyTimeoutMs});
    } catch (error) {
      if (cell.diagnosticsDir) {
        fs.mkdirSync(cell.diagnosticsDir, {recursive: true});
        const shotPath = path.join(cell.diagnosticsDir, `verify-${cell.framework}-${cell.viewport}-${cell.theme}.png`);
        await page.screenshot({path: shotPath, fullPage: true}).catch(() => {});
      }
      throw new Error(
        `Pane "${selectorFor(cell)}" nao renderizou um tgr-* hidratado em ${verifyTimeoutMs}ms `
        + `para ${cell.component}. O Koba esta com o DS buildado? (${error.message})`,
      );
    }
  }

  return {framework: 'koba-live', viewportWidths: VIEWPORT_WIDTHS, urlFor, selectorFor, verify};
}

module.exports = {makeKobaHost};
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: PASS (os dois testes com browser levam alguns segundos).

- [ ] **Step 5: Commit**

```bash
git add packages/service/src/kobaHost.js packages/service/test/kobaHost.test.js
git commit -m "feat(service): host koba-live sobre o /compare vivo"
```

---

### Task 7: Paridade React×Angular

**Files:**
- Create: `packages/service/src/parityPair.js`
- Test: `packages/service/test/parityPair.test.js`

**Interfaces:**
- Consumes: `writeDiff`, `assertSafePathSegment` de `@gol-smiles/anemoi-core`; grupos de `groupByCell` de `@gol-smiles/anemoi-web/src/parity` (shape `{label, _cell, react?, angular?}` com relPaths).
- Produces: `computeParityPair(groups, runDir, {reference = 'react', against = 'angular'}) → groups[]` onde cada grupo ganha `parity: [{against, mismatch, diffPath}]` (vazio se faltar um dos lados) e perde `_cell`. Diffs gravados em `<runDir>/diff/<against>-vs-<reference>/…png`.

- [ ] **Step 1: Escrever o teste que falha**

`packages/service/test/parityPair.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {PNG} = require('pngjs');

const {computeParityPair} = require('../src/parityPair');

function writePng(filePath, r, g, b) {
  const png = new PNG({width: 4, height: 4});
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
  }
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function makeGroup(runDir, {reactColor, angularColor}) {
  const reactRel = path.join('react', 'gol', 'koba-state-abc12345', 'sm', 'light.png');
  const angularRel = path.join('angular', 'gol', 'koba-state-abc12345', 'sm', 'light.png');
  writePng(path.join(runDir, reactRel), ...reactColor);
  writePng(path.join(runDir, angularRel), ...angularColor);
  return {
    label: 'gol · estado abc12345 · sm · light',
    _cell: {brand: 'gol', storyId: 'koba-state-abc12345', viewport: 'sm', theme: 'light'},
    react: reactRel,
    angular: angularRel,
  };
}

test('paridade zero quando as imagens sao iguais', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-parity-'));
  const groups = computeParityPair([makeGroup(runDir, {reactColor: [0, 128, 0], angularColor: [0, 128, 0]})], runDir);
  assert.equal(groups[0].parity.length, 1);
  assert.equal(groups[0].parity[0].against, 'angular');
  assert.equal(groups[0].parity[0].mismatch, 0);
  assert.ok(fs.existsSync(path.join(runDir, groups[0].parity[0].diffPath)));
  assert.equal(groups[0]._cell, undefined);
});

test('acusa mismatch quando as imagens divergem', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-parity-'));
  const groups = computeParityPair([makeGroup(runDir, {reactColor: [0, 128, 0], angularColor: [200, 0, 0]})], runDir);
  assert.ok(groups[0].parity[0].mismatch > 0);
  assert.match(groups[0].parity[0].diffPath, /^diff\/angular-vs-react\//);
});

test('parity vazio quando falta um dos lados', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-parity-'));
  const group = makeGroup(runDir, {reactColor: [0, 128, 0], angularColor: [0, 128, 0]});
  delete group.angular;
  const groups = computeParityPair([group], runDir);
  assert.deepEqual(groups[0].parity, []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: FAIL — `Cannot find module '../src/parityPair'`.

- [ ] **Step 3: Implementar**

`packages/service/src/parityPair.js`:

```js
'use strict';
// Paridade da fase 1: react e a referencia, angular e comparado contra ele.
// (Na fase 2, com a rota WC no Koba, o baseline padrao-ouro volta a ser o WC.)

const fs = require('node:fs');
const path = require('node:path');
const {writeDiff, assertSafePathSegment} = require('@gol-smiles/anemoi-core');

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  return filePath;
}

function computeParityPair(groups, runDir, {reference = 'react', against = 'angular'} = {}) {
  return groups.map(group => {
    const parity = [];
    if (group[reference] && group[against]) {
      const brand = assertSafePathSegment(group._cell.brand, 'brand');
      const storyId = assertSafePathSegment(group._cell.storyId, 'storyId');
      const viewport = assertSafePathSegment(group._cell.viewport, 'viewport');
      const theme = assertSafePathSegment(group._cell.theme, 'theme');
      const diffRel = path.join('diff', `${against}-vs-${reference}`, `${brand}-${storyId}-${viewport}-${theme}.png`);
      const {mismatch} = writeDiff(
        path.join(runDir, group[reference]),
        path.join(runDir, group[against]),
        ensureDir(path.join(runDir, diffRel)),
        {fit: 'intersection'},
      );
      parity.push({against, mismatch, diffPath: diffRel});
    }
    const {_cell, ...rest} = group;
    return {...rest, parity};
  });
}

module.exports = {computeParityPair};
```

(`pngjs` do teste resolve via hoisting do workspace — é dependência do core.)

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/service/src/parityPair.js packages/service/test/parityPair.test.js
git commit -m "feat(service): diff de paridade react x angular"
```

---

### Task 8: Run store e fila

**Files:**
- Create: `packages/service/src/runStore.js`
- Create: `packages/service/src/queue.js`
- Test: `packages/service/test/runStore.test.js`

**Interfaces:**
- Consumes: `node:crypto` (randomUUID).
- Produces:
  - `createRunStore() → {create({component, card}), get(runId), transition(runId, status, patch?), patch(runId, patch)}`. Run: `{runId (uuid), status, stage, component, card, runDir, summary, error, createdAt}`. Transições válidas: `queued→running`, `running→passed|failed|error`; qualquer outra lança.
  - `createQueue() → {enqueue(job) → Promise}` — FIFO, 1 job em voo; um job que rejeita não trava a fila.

- [ ] **Step 1: Escrever o teste que falha**

`packages/service/test/runStore.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {createRunStore} = require('../src/runStore');
const {createQueue} = require('../src/queue');

test('create gera run queued com uuid', () => {
  const store = createRunStore();
  const run = store.create({component: 'tgr-button', card: 'koba'});
  assert.match(run.runId, /^[0-9a-f-]{36}$/);
  assert.equal(run.status, 'queued');
  assert.equal(store.get(run.runId), run);
  assert.equal(store.get('nao-existe'), null);
});

test('transition segue a maquina de estados e rejeita saltos', () => {
  const store = createRunStore();
  const run = store.create({component: 'tgr-button', card: 'koba'});
  store.transition(run.runId, 'running', {stage: 'capture'});
  assert.equal(store.get(run.runId).stage, 'capture');
  store.transition(run.runId, 'passed', {stage: null, summary: {cells: 2}});
  assert.equal(store.get(run.runId).status, 'passed');
  assert.throws(() => store.transition(run.runId, 'running'), /Transicao invalida/);
});

test('transition rejeita queued -> passed', () => {
  const store = createRunStore();
  const run = store.create({component: 'tgr-button', card: 'koba'});
  assert.throws(() => store.transition(run.runId, 'passed'), /Transicao invalida/);
});

test('fila executa em ordem e sobrevive a job que rejeita', async () => {
  const queue = createQueue();
  const order = [];
  const first = queue.enqueue(async () => { order.push('a'); throw new Error('boom'); });
  const second = queue.enqueue(async () => { order.push('b'); });
  await first.catch(() => {});
  await second;
  assert.deepEqual(order, ['a', 'b']);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: FAIL — módulos ausentes.

- [ ] **Step 3: Implementar**

`packages/service/src/runStore.js`:

```js
'use strict';
// Indice de runs em memoria. Reiniciou o servico, perdeu o indice —
// os bundles persistem em disco (mesma filosofia do CLI).

const {randomUUID} = require('node:crypto');

const TRANSITIONS = {
  queued: ['running'],
  running: ['passed', 'failed', 'error'],
  passed: [],
  failed: [],
  error: [],
};

function createRunStore() {
  const runs = new Map();

  return {
    create({component, card}) {
      const run = {
        runId: randomUUID(),
        status: 'queued',
        stage: null,
        component,
        card,
        runDir: null,
        summary: null,
        error: null,
        createdAt: new Date().toISOString(),
      };
      runs.set(run.runId, run);
      return run;
    },
    get(runId) {
      return runs.get(runId) || null;
    },
    transition(runId, status, patch = {}) {
      const run = runs.get(runId);
      if (!run) throw new Error(`Run desconhecido: ${runId}`);
      if (!TRANSITIONS[run.status].includes(status)) {
        throw new Error(`Transicao invalida: ${run.status} -> ${status}`);
      }
      return Object.assign(run, patch, {status});
    },
    patch(runId, patch) {
      const run = runs.get(runId);
      if (!run) throw new Error(`Run desconhecido: ${runId}`);
      return Object.assign(run, patch);
    },
  };
}

module.exports = {createRunStore};
```

`packages/service/src/queue.js`:

```js
'use strict';
// Fila FIFO com 1 job em voo. O runner nunca rejeita em operacao normal,
// mas um job que rejeitar nao trava a fila.

function createQueue() {
  let tail = Promise.resolve();
  return {
    enqueue(job) {
      const next = tail.then(job, job);
      tail = next.catch(() => {});
      return next;
    },
  };
}

module.exports = {createQueue};
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/service/src/runStore.js packages/service/src/queue.js packages/service/test/runStore.test.js
git commit -m "feat(service): run store com maquina de estados e fila FIFO"
```

---

### Task 9: Runner (integração ponta a ponta contra fixture do /compare)

**Files:**
- Create: `packages/service/src/runner.js`
- Create: `packages/service/test/fixtures/compare-page.html`
- Test: `packages/service/test/runner.test.js`

**Interfaces:**
- Consumes: `captureCells`, `writeManifest`, `writeSummary`, `renderHtml` (core); `groupByCell` (`@gol-smiles/anemoi-web/src/parity`); `createRunDir` (`@gol-smiles/anemoi-web/src/run`); `writeFailureManifest` (`@gol-smiles/anemoi-web/src/failure`); `computeParityPair` (Task 7); `makeKobaHost` (Task 6); store da Task 8.
- Produces: `executeRun({run, store, cells, state, config: {dsRepo, kobaBaseUrl}}) → Promise<void>` — **nunca rejeita**. Termina o run em `passed` (mismatch total 0), `failed` (divergência) ou `error` (exceção; grava failure manifest). Bundle: `manifest.json` (com `mode: 'koba-state'`, `parityLabel: 'Paridade vs react'`, `compareState`), `summary.md`, `index.html`, screenshots, `diff/`. `summary` do run: `{cells, mismatches, maxMismatchPx}`.

- [ ] **Step 1: Criar a fixture do /compare**

`packages/service/test/fixtures/compare-page.html` — imita a estrutura real do Koba (panes com classes estáveis, custom element `tgr-*`, estado lido de `?state=`):

```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<style>
  body { margin: 0; font-family: sans-serif; }
  .koba-compare__pane { width: 400px; padding: 16px; }
</style>
</head>
<body>
<div class="koba-compare__panes">
  <div class="koba-compare__pane koba-compare__pane--react"><tgr-fake data-fw="react"></tgr-fake></div>
  <div class="koba-compare__pane koba-compare__pane--angular"><tgr-fake data-fw="angular"></tgr-fake></div>
</div>
<script>
  const params = new URLSearchParams(location.search);
  const state = JSON.parse(params.get('state') || '{"props":{}}');
  customElements.define('tgr-fake', class extends HTMLElement {
    connectedCallback() {
      const diverge = state.props.divergir && this.dataset.fw === 'angular';
      this.innerHTML =
        '<div style="width:200px;height:60px;background:' + (diverge ? '#b02a1e' : '#177245') + '"></div>' +
        '<p>' + (state.props.label || 'sem label') + '</p>';
    }
  });
</script>
</body>
</html>
```

- [ ] **Step 2: Escrever o teste que falha**

`packages/service/test/runner.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const {executeRun} = require('../src/runner');
const {createRunStore} = require('../src/runStore');
const {compareStateToCells} = require('../src/stateAdapter');

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'compare-page.html'), 'utf8');

// Servidor fake do Koba: qualquer GET /compare/* devolve a fixture.
function serveComparePage() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if ((req.url || '').startsWith('/compare/')) {
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
        res.end(FIXTURE);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise(done => server.close(done)),
    }));
  });
}

function setup(state) {
  const dsRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-runner-'));
  const store = createRunStore();
  const run = store.create({component: state.componentKey, card: 'koba'});
  const cells = compareStateToCells(state, {viewports: ['sm']});
  return {dsRepo, store, run, cells};
}

test('run passed: panes identicos geram bundle com paridade zero', async () => {
  const state = {componentKey: 'tgr-fake', props: {label: 'Ola'}, slots: {}};
  const {dsRepo, store, run, cells} = setup(state);
  const koba = await serveComparePage();

  await executeRun({run, store, cells, state, config: {dsRepo, kobaBaseUrl: koba.url}});
  await koba.close();

  const done = store.get(run.runId);
  assert.equal(done.status, 'passed');
  assert.deepEqual(done.summary, {cells: 2, mismatches: 0, maxMismatchPx: 0});
  assert.ok(done.runDir.includes(path.join('outputs', 'anemoi-web', 'koba', 'tgr-fake')));

  const manifest = JSON.parse(fs.readFileSync(path.join(done.runDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'passed');
  assert.equal(manifest.mode, 'koba-state');
  assert.equal(manifest.parityLabel, 'Paridade vs react');
  assert.deepEqual(manifest.compareState, state);
  assert.equal(manifest.cellCount, 2);
  assert.ok(fs.existsSync(path.join(done.runDir, 'index.html')));
  assert.ok(fs.existsSync(path.join(done.runDir, 'summary.md')));
});

test('run failed: panes divergentes acusam mismatch', async () => {
  const state = {componentKey: 'tgr-fake', props: {label: 'Ola', divergir: true}, slots: {}};
  const {dsRepo, store, run, cells} = setup(state);
  const koba = await serveComparePage();

  await executeRun({run, store, cells, state, config: {dsRepo, kobaBaseUrl: koba.url}});
  await koba.close();

  const done = store.get(run.runId);
  assert.equal(done.status, 'failed');
  assert.ok(done.summary.maxMismatchPx > 0);
  const manifest = JSON.parse(fs.readFileSync(path.join(done.runDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'failed');
});

test('run error: Koba fora do ar termina em error com failure manifest', async () => {
  const state = {componentKey: 'tgr-fake', props: {}, slots: {}};
  const {dsRepo, store, run, cells} = setup(state);

  await executeRun({run, store, cells, state, config: {dsRepo, kobaBaseUrl: 'http://127.0.0.1:1'}});

  const done = store.get(run.runId);
  assert.equal(done.status, 'error');
  assert.ok(done.error);
  const manifest = JSON.parse(fs.readFileSync(path.join(done.runDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'failed');
  assert.ok(manifest.error);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: FAIL — `Cannot find module '../src/runner'`.

- [ ] **Step 4: Implementar**

`packages/service/src/runner.js`:

```js
'use strict';
// Executa um run: captura os panes do Koba vivo, computa paridade
// react x angular e publica o bundle padrao do Anemoi no checkout do DS.
// Nunca rejeita: todo caminho termina num status consultavel do run.

const fs = require('node:fs');
const path = require('node:path');
const {captureCells, writeManifest, writeSummary, renderHtml} = require('@gol-smiles/anemoi-core');
const {groupByCell} = require('@gol-smiles/anemoi-web/src/parity');
const {createRunDir} = require('@gol-smiles/anemoi-web/src/run');
const {writeFailureManifest} = require('@gol-smiles/anemoi-web/src/failure');
const {computeParityPair} = require('./parityPair');
const {makeKobaHost} = require('./kobaHost');

async function executeRun({run, store, cells, state, config}) {
  let stage = 'run-dir';
  store.transition(run.runId, 'running', {stage});
  let runDir = null;

  try {
    runDir = createRunDir(config.dsRepo, run.card, run.component);
    fs.mkdirSync(runDir, {recursive: true});
    store.patch(run.runId, {runDir});

    stage = 'capture';
    store.patch(run.runId, {stage});
    const host = makeKobaHost();
    const diagnosticsDir = path.join(runDir, 'logs');
    const cellsWithDiagnostics = cells.map(cell => ({...cell, diagnosticsDir}));
    const captures = await captureCells(cellsWithDiagnostics, host, config.kobaBaseUrl, runDir, {
      onProgress: (i, total) => store.patch(run.runId, {stage: `capturando ${i}/${total}`}),
    });

    stage = 'parity';
    store.patch(run.runId, {stage});
    const groups = computeParityPair(groupByCell(captures), runDir);

    stage = 'output';
    store.patch(run.runId, {stage});
    const parities = groups.flatMap(group => group.parity);
    const totalMismatch = parities.reduce((sum, parity) => sum + parity.mismatch, 0);
    const status = totalMismatch === 0 ? 'passed' : 'failed';

    const manifest = {
      tool: 'Anemoi Service',
      status,
      card: run.card,
      component: run.component,
      mode: 'koba-state',
      layout: 'parity',
      parityLabel: 'Paridade vs react',
      axes: {
        frameworks: ['react', 'angular'],
        stories: [cells[0].storyName],
        themes: ['light'],
        viewports: [...new Set(cells.map(cell => cell.viewport))],
        brands: ['gol'],
      },
      cellCount: captures.length,
      groups,
      compareState: state,
      generatedAt: new Date().toISOString(),
      runDir,
    };
    writeManifest(runDir, manifest);
    writeSummary(runDir, manifest);
    fs.writeFileSync(path.join(runDir, 'index.html'), renderHtml(manifest), 'utf8');

    store.transition(run.runId, status, {
      stage: null,
      summary: {
        cells: captures.length,
        mismatches: parities.filter(parity => parity.mismatch > 0).length,
        maxMismatchPx: parities.length ? Math.max(...parities.map(parity => parity.mismatch)) : 0,
      },
    });
  } catch (error) {
    if (runDir) {
      writeFailureManifest(runDir, {stage, card: run.card, component: run.component}, error);
    }
    store.transition(run.runId, 'error', {stage, error: error.message});
  }
}

module.exports = {executeRun};
```

- [ ] **Step 5: Rodar e ver passar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: PASS (testes de runner levam alguns segundos por causa do Chromium).

- [ ] **Step 6: Commit**

```bash
git add packages/service/src/runner.js packages/service/test/runner.test.js packages/service/test/fixtures/compare-page.html
git commit -m "feat(service): runner ponta a ponta com bundle padrao do Anemoi"
```

---

### Task 10: Servidor HTTP — rotas, validação, CORS e galeria

**Files:**
- Create: `packages/service/src/server.js`
- Test: `packages/service/test/server.test.js`

**Interfaces:**
- Consumes: `MIME`, `assertSafePathSegment` (core); `VIEWPORT_WIDTHS` (`@gol-smiles/anemoi-web/src/brands`); `normalizeCompareState`, `compareStateToCells` (Tasks 3-4); store/queue (Task 8). Dependências injetáveis: `deps.fetchCatalog` (assinatura de `fetchKobaCatalog`), `deps.executeRun` (assinatura da Task 9).
- Produces: `createService({config, store, queue, deps}) → http.Server` com as rotas `POST /runs`, `GET /runs/:id`, `GET /runs/:id/gallery/*`, `OPTIONS *`. Exporta também `validatePayload(payload) → string|null` para teste.

- [ ] **Step 1: Escrever o teste que falha**

`packages/service/test/server.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {createService, validatePayload} = require('../src/server');
const {createRunStore} = require('../src/runStore');
const {createQueue} = require('../src/queue');

const CATALOG = [{key: 'tgr-button', initialArgs: {label: 'Comprar'}, slots: []}];
const CONFIG = {port: 0, kobaBaseUrl: 'http://localhost:9000', dsRepo: '/tmp/nao-usado'};

function startService({fetchCatalog, executeRun} = {}) {
  const store = createRunStore();
  const queue = createQueue();
  const calls = [];
  const service = createService({
    config: CONFIG,
    store,
    queue,
    deps: {
      fetchCatalog: fetchCatalog || (async () => CATALOG),
      executeRun: executeRun || (async (job) => { calls.push(job); }),
    },
  });
  return new Promise((resolve) => {
    service.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${service.address().port}`,
      store, calls,
      close: () => new Promise(done => service.close(done)),
    }));
  });
}

const VALID_BODY = {
  mode: 'state',
  compareState: {componentKey: 'tgr-button', props: {label: 'Pagar'}, slots: {}},
};

test('validatePayload cobre os casos 422', () => {
  assert.equal(validatePayload(VALID_BODY), null);
  assert.match(validatePayload({...VALID_BODY, mode: 'stories'}), /mode/);
  assert.match(validatePayload({mode: 'state'}), /componentKey/);
  assert.match(validatePayload({...VALID_BODY, axes: {viewports: ['xxl']}}), /viewports/);
  assert.match(validatePayload({...VALID_BODY, axes: {themes: ['dark']}}), /themes/);
});

test('POST /runs valido responde 202 e enfileira o run', async () => {
  const svc = await startService();
  const response = await fetch(`${svc.url}/runs`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(VALID_BODY),
  });
  assert.equal(response.status, 202);
  const {runId} = await response.json();
  assert.ok(svc.store.get(runId));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(svc.calls.length, 1);
  assert.equal(svc.calls[0].run.runId, runId);
  // estado normalizado: merge sobre initialArgs do catalogo
  assert.deepEqual(svc.calls[0].state.props, {label: 'Pagar'});
  await svc.close();
});

test('POST /runs com componentKey desconhecido responde 422', async () => {
  const svc = await startService();
  const response = await fetch(`${svc.url}/runs`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({...VALID_BODY, compareState: {componentKey: 'tgr-x', props: {}, slots: {}}}),
  });
  assert.equal(response.status, 422);
  await svc.close();
});

test('POST /runs com Koba fora do ar responde 503', async () => {
  const svc = await startService({
    fetchCatalog: async () => {
      const error = new Error('Koba indisponivel');
      error.code = 'KOBA_UNAVAILABLE';
      throw error;
    },
  });
  const response = await fetch(`${svc.url}/runs`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(VALID_BODY),
  });
  assert.equal(response.status, 503);
  await svc.close();
});

test('POST /runs com JSON invalido responde 400', async () => {
  const svc = await startService();
  const response = await fetch(`${svc.url}/runs`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: '{nao e json',
  });
  assert.equal(response.status, 400);
  await svc.close();
});

test('GET /runs/:id retorna o status e URLs quando terminou', async () => {
  const svc = await startService();
  const run = svc.store.create({component: 'tgr-button', card: 'koba'});

  let response = await fetch(`${svc.url}/runs/${run.runId}`);
  assert.equal(response.status, 200);
  let body = await response.json();
  assert.equal(body.status, 'queued');
  assert.equal(body.galleryUrl, undefined);

  svc.store.transition(run.runId, 'running');
  svc.store.transition(run.runId, 'passed', {summary: {cells: 2, mismatches: 0, maxMismatchPx: 0}});
  response = await fetch(`${svc.url}/runs/${run.runId}`);
  body = await response.json();
  assert.equal(body.status, 'passed');
  assert.deepEqual(body.summary, {cells: 2, mismatches: 0, maxMismatchPx: 0});
  assert.equal(body.galleryUrl, `/runs/${run.runId}/gallery/`);
  assert.equal(body.manifestUrl, `/runs/${run.runId}/gallery/manifest.json`);
  await svc.close();
});

test('GET /runs/desconhecido responde 404', async () => {
  const svc = await startService();
  const response = await fetch(`${svc.url}/runs/00000000-0000-0000-0000-000000000000`);
  assert.equal(response.status, 404);
  await svc.close();
});

test('galeria serve o bundle e bloqueia path traversal', async () => {
  const svc = await startService();
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-gallery-'));
  fs.writeFileSync(path.join(runDir, 'index.html'), '<h1>galeria</h1>');
  fs.writeFileSync(path.join(runDir, 'manifest.json'), '{"status":"passed"}');
  const run = svc.store.create({component: 'tgr-button', card: 'koba'});
  svc.store.patch(run.runId, {runDir});

  let response = await fetch(`${svc.url}/runs/${run.runId}/gallery/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /galeria/);
  assert.match(response.headers.get('content-type'), /text\/html/);

  response = await fetch(`${svc.url}/runs/${run.runId}/gallery/manifest.json`);
  assert.equal(response.status, 200);

  response = await fetch(`${svc.url}/runs/${run.runId}/gallery/..%2F..%2Fetc%2Fpasswd`);
  assert.equal(response.status, 403);
  await svc.close();
});

test('CORS: preflight e headers apontam para a origem do Koba', async () => {
  const svc = await startService();
  const preflight = await fetch(`${svc.url}/runs`, {method: 'OPTIONS'});
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), CONFIG.kobaBaseUrl);
  assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);

  const run = svc.store.create({component: 'tgr-button', card: 'koba'});
  const response = await fetch(`${svc.url}/runs/${run.runId}`);
  assert.equal(response.headers.get('access-control-allow-origin'), CONFIG.kobaBaseUrl);
  await svc.close();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: FAIL — `Cannot find module '../src/server'`.

- [ ] **Step 3: Implementar**

`packages/service/src/server.js`:

```js
'use strict';
// API HTTP do Anemoi Service.
//   POST /runs                   -> 202 {runId} | 400 | 422 | 503
//   GET  /runs/:id               -> status do run
//   GET  /runs/:id/gallery/*     -> bundle do run (galeria, PNGs, manifest)
// Escuta apenas em 127.0.0.1; CORS restrito a origem do Koba.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {MIME, assertSafePathSegment} = require('@gol-smiles/anemoi-core');
const {VIEWPORT_WIDTHS} = require('@gol-smiles/anemoi-web/src/brands');
const {normalizeCompareState, compareStateToCells} = require('./stateAdapter');

const MAX_BODY_BYTES = 1024 * 1024;
const RUN_ID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const GALLERY_ROUTE = new RegExp(`^/runs/(${RUN_ID_PATTERN})/gallery(/.*)?$`);
const RUN_ROUTE = new RegExp(`^/runs/(${RUN_ID_PATTERN})$`);

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {'Content-Type': 'application/json; charset=utf-8'});
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body acima de 1MB.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('JSON invalido no body.'));
      }
    });
    req.on('error', reject);
  });
}

// Retorna a mensagem do 422, ou null se o payload e valido.
function validatePayload(payload) {
  if (payload.mode !== 'state') {
    return `mode nao suportado: ${JSON.stringify(payload.mode)}. Unico valor na v1: "state".`;
  }
  const compareState = payload.compareState;
  if (!compareState || typeof compareState !== 'object'
      || typeof compareState.componentKey !== 'string' || !compareState.componentKey) {
    return 'compareState.componentKey e obrigatorio.';
  }
  const axes = payload.axes || {};
  if (axes.viewports !== undefined) {
    const valid = Array.isArray(axes.viewports) && axes.viewports.length > 0
      && axes.viewports.every(viewport => VIEWPORT_WIDTHS[viewport]);
    if (!valid) {
      return `axes.viewports invalido. Use valores de: ${Object.keys(VIEWPORT_WIDTHS).join(', ')}.`;
    }
  }
  if (axes.themes !== undefined && JSON.stringify(axes.themes) !== '["light"]') {
    return 'axes.themes nao suportado na v1: apenas ["light"] (theme chega na fase 2).';
  }
  return null;
}

async function handlePostRuns(req, res, ctx) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {error: error.message});
    return;
  }

  const invalid = validatePayload(payload);
  if (invalid) {
    sendJson(res, 422, {error: invalid});
    return;
  }

  const card = payload.card || 'koba';
  try {
    assertSafePathSegment(card, 'card');
  } catch (error) {
    sendJson(res, 422, {error: error.message});
    return;
  }

  let catalog;
  try {
    catalog = await ctx.deps.fetchCatalog(ctx.config.kobaBaseUrl);
  } catch (error) {
    if (error.code === 'KOBA_UNAVAILABLE') {
      sendJson(res, 503, {error: error.message});
      return;
    }
    throw error;
  }

  let state;
  try {
    state = normalizeCompareState(payload.compareState, catalog);
  } catch (error) {
    if (error.code === 'UNKNOWN_COMPONENT') {
      sendJson(res, 422, {error: error.message});
      return;
    }
    throw error;
  }

  const cells = compareStateToCells(state, {
    viewports: (payload.axes && payload.axes.viewports) || undefined,
  });
  const run = ctx.store.create({component: state.componentKey, card});
  ctx.queue.enqueue(() => ctx.deps.executeRun({run, store: ctx.store, cells, state, config: ctx.config}));
  sendJson(res, 202, {runId: run.runId});
}

function runResponse(run) {
  const body = {
    runId: run.runId,
    status: run.status,
    stage: run.stage,
    component: run.component,
    card: run.card,
    createdAt: run.createdAt,
  };
  if (run.summary) body.summary = run.summary;
  if (run.error) body.error = run.error;
  if (run.status === 'passed' || run.status === 'failed') {
    body.manifestUrl = `/runs/${run.runId}/gallery/manifest.json`;
    body.galleryUrl = `/runs/${run.runId}/gallery/`;
  }
  return body;
}

function handleGallery(res, run, rawPath) {
  if (!run.runDir) {
    sendJson(res, 404, {error: 'Bundle ainda nao disponivel para este run.'});
    return;
  }
  let urlPath;
  try {
    urlPath = decodeURIComponent(rawPath);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  let filePath = path.join(run.runDir, urlPath);
  if (urlPath === '' || urlPath.endsWith('/')) {
    filePath = path.join(filePath, 'index.html');
  }
  const rel = path.relative(run.runDir, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream'});
    res.end(data);
  });
}

function createService({config, store, queue, deps}) {
  const ctx = {config, store, queue, deps};

  return http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', config.kobaBaseUrl);
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      });
      res.end();
      return;
    }

    const urlPath = (req.url || '/').split('?')[0];

    if (req.method === 'POST' && urlPath === '/runs') {
      handlePostRuns(req, res, ctx).catch(error => sendJson(res, 500, {error: error.message}));
      return;
    }

    const galleryMatch = urlPath.match(GALLERY_ROUTE);
    if (req.method === 'GET' && galleryMatch) {
      const run = store.get(galleryMatch[1]);
      if (!run) {
        sendJson(res, 404, {error: `Run desconhecido: ${galleryMatch[1]}. O servico pode ter sido reiniciado — dispare de novo.`});
        return;
      }
      handleGallery(res, run, (galleryMatch[2] || '/').slice(1));
      return;
    }

    const runMatch = urlPath.match(RUN_ROUTE);
    if (req.method === 'GET' && runMatch) {
      const run = store.get(runMatch[1]);
      if (!run) {
        sendJson(res, 404, {error: `Run desconhecido: ${runMatch[1]}. O servico pode ter sido reiniciado — dispare de novo.`});
        return;
      }
      sendJson(res, 200, runResponse(run));
      return;
    }

    sendJson(res, 404, {error: 'rota desconhecida'});
  });
}

module.exports = {createService, validatePayload, readJsonBody};
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/service/src/server.js packages/service/test/server.test.js
git commit -m "feat(service): API HTTP com validacao, CORS e galeria"
```

---

### Task 11: Bin, doctor e README (smoke manual)

**Files:**
- Create: `packages/service/bin/anemoi-service.js`
- Create: `packages/service/src/doctor.js`
- Create: `packages/service/README.md`
- Test: `packages/service/test/doctor.test.js`

**Interfaces:**
- Consumes: `readServiceConfig` (Task 1), `fetchKobaCatalog` (Task 5), `createRunStore`/`createQueue` (Task 8), `createService` (Task 10), `executeRun` (Task 9).
- Produces: `npm run service` sobe o servidor; `npm run service -- --doctor` roda os checks e sai com código 0/1. `collectServiceChecks(rootDir, {fetchCatalog?, portProbe?}) → Promise<[{id, label, ok, detail}]>`.

- [ ] **Step 1: Escrever o teste que falha**

`packages/service/test/doctor.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {collectServiceChecks} = require('../src/doctor');

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-doctor-'));
  const dsRepo = path.join(root, 'ds');
  fs.mkdirSync(dsRepo);
  fs.writeFileSync(path.join(root, '.anemoi.local.json'), JSON.stringify({
    repositories: {ds: {path: dsRepo}},
    defaultRepository: 'ds',
  }));
  return root;
}

test('todos os checks ok quando config, DS, Koba e porta estao saudaveis', async () => {
  const checks = await collectServiceChecks(makeRoot(), {
    fetchCatalog: async () => [{key: 'tgr-button'}],
    portProbe: async () => true,
  });
  assert.deepEqual(checks.map(check => [check.id, check.ok]), [
    ['config', true], ['ds-repo', true], ['koba', true], ['port', true],
  ]);
});

test('koba fora do ar reprova o check do catalogo', async () => {
  const checks = await collectServiceChecks(makeRoot(), {
    fetchCatalog: async () => { throw new Error('ECONNREFUSED'); },
    portProbe: async () => true,
  });
  const koba = checks.find(check => check.id === 'koba');
  assert.equal(koba.ok, false);
  assert.match(koba.detail, /ECONNREFUSED/);
});

test('config invalida encerra os checks no primeiro item', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-service-doctor-'));
  fs.writeFileSync(path.join(root, '.anemoi.local.json'), JSON.stringify({repositories: {}}));
  const checks = await collectServiceChecks(root, {
    fetchCatalog: async () => [],
    portProbe: async () => true,
  });
  assert.equal(checks.length, 1);
  assert.equal(checks[0].id, 'config');
  assert.equal(checks[0].ok, false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: FAIL — `Cannot find module '../src/doctor'`.

- [ ] **Step 3: Implementar doctor e bin**

`packages/service/src/doctor.js`:

```js
'use strict';
// Doctor do Anemoi Service: config, checkout do DS, Koba vivo e porta.

const fs = require('node:fs');
const net = require('node:net');
const {readServiceConfig} = require('./config');
const {fetchKobaCatalog} = require('./kobaCatalog');

function checkPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

async function collectServiceChecks(rootDir, {fetchCatalog = fetchKobaCatalog, portProbe = checkPortFree} = {}) {
  const checks = [];
  let config;
  try {
    config = readServiceConfig(rootDir);
    checks.push({
      id: 'config', label: 'secao service do .anemoi.local.json', ok: true,
      detail: `porta ${config.port} · Koba ${config.kobaBaseUrl} · DS ${config.dsRepo}`,
    });
  } catch (error) {
    checks.push({id: 'config', label: 'secao service do .anemoi.local.json', ok: false, detail: error.message});
    return checks;
  }

  checks.push({
    id: 'ds-repo', label: 'checkout do DS acessivel',
    ok: fs.existsSync(config.dsRepo), detail: config.dsRepo,
  });

  try {
    const catalog = await fetchCatalog(config.kobaBaseUrl);
    checks.push({id: 'koba', label: 'Koba respondendo GET /catalog.json', ok: true, detail: `${catalog.length} componente(s)`});
  } catch (error) {
    checks.push({id: 'koba', label: 'Koba respondendo GET /catalog.json', ok: false, detail: error.message});
  }

  const free = await portProbe(config.port);
  checks.push({
    id: 'port', label: `porta ${config.port} livre`, ok: free,
    detail: free ? 'disponivel' : 'em uso — o servico ja esta rodando?',
  });
  return checks;
}

async function runServiceDoctor(rootDir, options = {}) {
  const checks = await collectServiceChecks(rootDir, options);
  for (const check of checks) {
    console.log(`${check.ok ? '✓' : '✗'} ${check.label} — ${check.detail}`);
  }
  return checks.every(check => check.ok);
}

module.exports = {collectServiceChecks, runServiceDoctor, checkPortFree};
```

`packages/service/bin/anemoi-service.js`:

```js
#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {readServiceConfig} = require('../src/config');
const {createRunStore} = require('../src/runStore');
const {createQueue} = require('../src/queue');
const {createService} = require('../src/server');
const {executeRun} = require('../src/runner');
const {fetchKobaCatalog} = require('../src/kobaCatalog');
const {runServiceDoctor} = require('../src/doctor');

const rootDir = path.join(__dirname, '..', '..', '..');

async function main() {
  if (process.argv.includes('--doctor')) {
    const healthy = await runServiceDoctor(rootDir);
    process.exitCode = healthy ? 0 : 1;
    return;
  }

  const config = readServiceConfig(rootDir);
  const store = createRunStore();
  const queue = createQueue();
  const service = createService({config, store, queue, deps: {executeRun, fetchCatalog: fetchKobaCatalog}});
  service.listen(config.port, '127.0.0.1', () => {
    console.log(`Anemoi Service ouvindo em http://127.0.0.1:${config.port}`);
    console.log(`Koba esperado em ${config.kobaBaseUrl} · bundles em ${config.dsRepo}/outputs/anemoi-web/`);
  });
}

main().catch((error) => {
  console.error(`Erro: ${error.message}`);
  process.exitCode = 1;
});
```

`packages/service/README.md`:

```markdown
# @gol-smiles/anemoi-service

Serviço HTTP local que verifica paridade React×Angular do estado vivo do
Koba (`/compare/<key>?state=…`), com diff de pixels e bundle padrão do Anemoi.

## Uso

    npm run service -- --doctor   # pré-flight: config, DS, Koba, porta
    npm run service               # sobe em http://127.0.0.1:9200

Config (opcional) na seção `service` do `.anemoi.local.json` da raiz:

    { "service": {"port": 9200, "kobaBaseUrl": "http://localhost:9000", "repo": "ds"} }

`repo` é um alias de `repositories` (mesmo mecanismo do anemoi-web); sem ele,
usa o `defaultRepository`.

## API

- `POST /runs` — body `{mode: "state", compareState: {componentKey, props, slots}, card?, axes?: {viewports?}}` → `202 {runId}` · `400` JSON inválido · `422` estado/axes inválidos · `503` Koba fora do ar.
- `GET /runs/:id` — `{status: queued|running|passed|failed|error, stage?, summary?, manifestUrl?, galleryUrl?, error?}`.
- `GET /runs/:id/gallery/` — galeria do bundle.

O bundle é gravado em `outputs/anemoi-web/<card>/<componente>/<ts>-<id>/`
no checkout do DS. O serviço nunca executa Git no consumidor.

## Smoke manual (com Koba vivo)

1. No repo `koba`: `pnpm dev` (shell em :9000, com o DS buildado).
2. Aqui: `npm run service -- --doctor` → 4 checks ✓; depois `npm run service`.
3. Disparar um run (ajuste o componentKey para um real do catálogo):

       curl -s -X POST http://127.0.0.1:9200/runs \
         -H 'content-type: application/json' \
         -d '{"mode":"state","compareState":{"componentKey":"tgr-button","props":{},"slots":{}}}'

4. Acompanhar: `curl -s http://127.0.0.1:9200/runs/<runId>` até `passed|failed`.
5. Abrir `http://127.0.0.1:9200/runs/<runId>/gallery/` no navegador.
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: PASS. Verificar também o bin sem Koba: `npm run service -- --doctor` deve imprimir os 4 checks (o de Koba reprovado se nada estiver em :9000) e sair com código 1.

- [ ] **Step 5: Commit**

```bash
git add packages/service/bin packages/service/src/doctor.js packages/service/test/doctor.test.js packages/service/README.md
git commit -m "feat(service): bin com doctor e roteiro de smoke manual"
```

---

### Task 12: Teste de contrato com o Koba

Congela em fixtures o contrato implícito entre os repos: shape do `catalog.json`, formato do `?state=` e as classes dos panes. Se o Koba mudar, é aqui que quebra primeiro.

**Files:**
- Create: `packages/service/test/fixtures/koba-catalog.json`
- Create: `packages/service/test/kobaContract.test.js`

**Interfaces:**
- Consumes: `normalizeCompareState`, `stateHash` (Task 3); `makeKobaHost` (Task 6); fixture `compare-page.html` (Task 9).
- Produces: nada novo — só garantias.

- [ ] **Step 1: Criar a fixture do catálogo real**

`packages/service/test/fixtures/koba-catalog.json` — espelha o `CatalogComponent` de `koba/packages/root-config/src/catalog/types.ts`:

```json
[
  {
    "key": "tgr-button",
    "tag": "tgr-button",
    "name": "Button",
    "description": "Botao do Tangerina",
    "reactExport": "TgrButton",
    "props": [
      {"name": "label", "kind": "text", "default": "Comprar"},
      {"name": "variant", "kind": "select", "default": "primary", "options": ["primary", "secondary"]},
      {"name": "disabled", "kind": "toggle", "default": false}
    ],
    "events": [{"event": "tgrClick", "reactProp": "onTgrClick"}],
    "slots": [{"name": "icon", "defaultContent": ""}],
    "initialArgs": {"label": "Comprar", "variant": "primary", "disabled": false}
  }
]
```

- [ ] **Step 2: Escrever o teste que falha**

`packages/service/test/kobaContract.test.js`:

```js
'use strict';
// Contrato implicito com o repo koba (matheusBrqRocha/koba):
// 1. Shape do GET /catalog.json  (root-config/src/catalog/types.ts)
// 2. Formato do ?state=          (root-config/src/compare/compareState.ts)
// 3. Classes dos panes           (root-config/index.html)
// Se algo mudar la, estes testes quebram primeiro.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {normalizeCompareState} = require('../src/stateAdapter');
const {makeKobaHost} = require('../src/kobaHost');

const CATALOG = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'koba-catalog.json'), 'utf8'));
const FIXTURE_PAGE = fs.readFileSync(path.join(__dirname, 'fixtures', 'compare-page.html'), 'utf8');

// Copia fiel do parseCompareState do Koba (compareState.ts) — usada para
// provar o round-trip: o que o service serializa, o Koba aplica.
function kobaParseCompareState(search, fallback) {
  const params = new URLSearchParams(search);
  const raw = params.get('state');
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.componentKey !== fallback.componentKey) return fallback;
    return {
      componentKey: fallback.componentKey,
      props: {...fallback.props, ...parsed.props},
      slots: {...fallback.slots, ...parsed.slots},
    };
  } catch {
    return fallback;
  }
}

function kobaDefaultState(component) {
  return {
    componentKey: component.key,
    props: {...component.initialArgs},
    slots: Object.fromEntries(component.slots.map(slot => [slot.name, slot.defaultContent])),
  };
}

test('normalizeCompareState aceita o shape real do catalogo do Koba', () => {
  const state = normalizeCompareState(
    {componentKey: 'tgr-button', props: {label: 'Pagar'}, slots: {}},
    CATALOG,
  );
  assert.deepEqual(state.props, {label: 'Pagar', variant: 'primary', disabled: false});
  assert.deepEqual(state.slots, {icon: ''});
});

test('round-trip: o state serializado pelo host e o que o Koba aplicaria', () => {
  const state = normalizeCompareState(
    {componentKey: 'tgr-button', props: {label: 'Pagar', disabled: true}, slots: {icon: '<b>!</b>'}},
    CATALOG,
  );
  const host = makeKobaHost();
  const url = new URL(host.urlFor({component: state.componentKey, framework: 'react', state}, 'http://localhost:9000'));

  const applied = kobaParseCompareState(url.search, kobaDefaultState(CATALOG[0]));
  assert.deepEqual(applied, state);
});

test('fixture do /compare usa as classes reais dos panes do Koba', () => {
  for (const framework of ['react', 'angular']) {
    const selector = makeKobaHost().selectorFor({framework});
    assert.ok(
      FIXTURE_PAGE.includes(selector.slice(1)),
      `fixture compare-page.html deve conter a classe ${selector}`,
    );
  }
});
```

- [ ] **Step 3: Rodar e ver falhar (ou passar)**

Rodar: `npm test -w @gol-smiles/anemoi-service`
Esperado: os dois primeiros FALHAM antes do Step 1 existir (fixture ausente); com a fixture criada, os três devem PASSAR — se algum falhar, o contrato foi quebrado por implementação anterior e deve ser corrigido nela.

- [ ] **Step 4: Rodar a suíte completa do monorepo**

Rodar: `npm test`
Esperado: PASS em todos os workspaces (raiz, core, web, service).

- [ ] **Step 5: Commit**

```bash
git add packages/service/test/fixtures/koba-catalog.json packages/service/test/kobaContract.test.js
git commit -m "test(service): contrato congelado com o catalogo e o state do Koba"
```

---

## Fora deste plano (próximos passos)

1. **Botão "Verificar" no Koba** — plano próprio no repo `koba`: `verifyPanel` em `packages/root-config/src/compare/` (POST /runs com o estado do evento `koba:compare-state`, polling 2s, badge + link da galeria, botão desabilitado se :9200 não responde).
2. **Fase 2** — rota WC no Koba + `?state=` nas rotas por framework + baseline WC no service + `mode: "stories"`.
