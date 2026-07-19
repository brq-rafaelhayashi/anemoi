# Playwright Test e Confiabilidade Comportamental Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar o executor Web do Anemoi para `@playwright/test` e entregar, no `tgr-button`, evidências cross-browser de visual, dimensões, Axe, ARIA, conformidade comportamental e paridade comportamental com gate fail-closed.

**Architecture:** Um preflight gera `run-plan.json`; specs Playwright nativos consomem o plano e executam WC, React e Angular como steps da mesma unidade lógica. Cada tentativa grava um Resultado Atômico exclusivo, e um finalizador do Anemoi consolida tentativas, calcula vereditos e publica `manifest.json` v2, resumo e galeria. Spec: `docs/superpowers/specs/2026-07-18-playwright-test-confiabilidade-comportamental-design.md`.

**Tech Stack:** Node.js 24.13.1, npm workspaces, CommonJS legado, TypeScript 5.4+ na nova fronteira, `@playwright/test` fixado em 1.61.1, Chromium/Firefox/WebKit, axe-core, pixelmatch, `node:test`.

## Global Constraints

- Antes de executar, criar worktree isolado com `superpowers:using-git-worktrees`; partir de um `main` limpo que contenha o commit do design `63d12f0` e as mudanças Web que o mantenedor decidir integrar.
- Executar primeiro `docs/superpowers/plans/2026-07-18-tangerina-browser-support-matrix.md` no repositório Tangerina; o Anemoi não inventa fallback quando a matriz estiver ausente.
- No worktree Anemoi, reconfigurar o alias local `tangerina` para o worktree Tangerina criado
  pelo plano pré-requisito; nunca executar a migração contra o checkout Tangerina dirty atual.
- Escopo de runtime: `packages/core` + `packages/web`; não alterar o comportamento de Koba/`packages/service`, Mobile, Detox, `anemoi-preset` ou `gol-adapter-detox`.
- Toda Cena, Contrato Comportamental, fingerprint e spec fica no Anemoi sob `packages/web/contracts/<consumer>/<component>/`.
- A única política externa é `packages/components/browser-support.json`, pertencente ao Tangerina.
- Browsers obrigatórios iniciais: `chromium`, `firefox`, `webkit`; toda dimensão baseada em browser roda nos três.
- WC é referência de React e Angular apenas dentro da mesma engine; nunca comparar pixels entre engines.
- Runner, fixtures, contratos e specs novos usam TypeScript estrito em ESM (`ESNext`, sem
  emissão) para serem carregados pelo Node/Playwright; módulos `.js` existentes permanecem
  CommonJS salvo mudança local explícita neste plano. Pontes TS → CJS usam `createRequire`.
- Testes unitários continuam em `node:test`; specs de browser usam Playwright Test.
- Uma Cena em ambiente/viewport por browser é uma unidade lógica; WC, React e Angular são steps internos.
- Cada Roteiro remonta a Cena antes de executar; scripts não podem ramificar por framework.
- Locators são semânticos e escopados à raiz; CSS interno só pode aparecer em teste de exceção documentada.
- Paridade comportamental usa igualdade profunda exata após normalização; ordem e quantidade de eventos importam.
- Um retry no CI serve apenas para diagnóstico; qualquer resultado `flaky` reprova o gate.
- Workers nunca atualizam manifesto compartilhado; cada tentativa escreve um Resultado Atômico por rename atômico.
- `manifest.json` novo usa `schemaVersion: 2`; leitores tratam ausência de versão como v1.
- A CLI `npm run web -- ...`, aliases, `doctor`, filtros, builds, output bundle e códigos documentados permanecem disponíveis.
- Não commitar `outputs/`, `.anemoi.local.json`, traces ou builds de harness.
- Estilo: CommonJS legado com duas casas, ponto e vírgula, aspas simples; TypeScript novo segue a mesma convenção.
- TDD em cada task, `git diff --check` antes de cada commit e commits Conventional Commit focados.

## Planned File Map

### Nova fronteira TypeScript do runner

- `packages/web/tsconfig.json` — typecheck estrito sem emissão.
- `packages/web/playwright.config.ts` — projects, retry, trace, testMatch e global setup derivados do plano.
- `packages/web/src/runner/types.ts` — contratos de tipos compartilhados.
- `packages/web/src/runner/supportMatrix.ts` — leitura/validação da política Tangerina.
- `packages/web/src/runner/contracts.ts` — definição e cobertura dos contratos.
- `packages/web/src/runner/publicSurface.ts` — extração CEM/React/Angular.
- `packages/web/src/runner/fingerprint.ts` — canonicalização, digest e diff revisável.
- `packages/web/src/runner/runPlan.ts` — expansão, IDs estáveis e persistência do plano.
- `packages/web/src/runner/builds.ts` — build dos três harnesses para o run.
- `packages/web/src/runner/globalSetup.ts` — servidores estáticos e teardown do Playwright Test.
- `packages/web/src/runner/observation.ts` — validação/canonicalização de observações.
- `packages/web/src/runner/behavior.ts` — execução collect-all/fail-late dos Roteiros.
- `packages/web/src/runner/verdict.ts` — vereditos e gate multidimensional.
- `packages/web/src/runner/atomicResult.ts` — escrita, leitura e consolidação de tentativas.
- `packages/web/src/runner/fixtures.ts` — fixture `anemoi` e captura automática de diagnósticos.
- `packages/web/src/runner/finalize.ts` — bundle v2, resumo e galeria.
- `packages/web/src/runner/outputV2.ts` — renderizadores autocontidos de summary e galeria.
- `packages/web/src/runner/invoke.ts` — child process assíncrono para o Playwright Test.
- `packages/web/src/runner/reviewContract.ts` — diff e confirmação explícita do fingerprint.

### Contrato tracer

- `packages/web/contracts/tangerina/tgr-button/contract.ts`
- `packages/web/contracts/tangerina/tgr-button/fingerprint.json`
- `packages/web/contracts/tangerina/tgr-button/scenes.ts`
- `packages/web/contracts/tangerina/tgr-button/behaviors.spec.ts`

### Harnesses e compatibilidade

- `packages/web/harness/wc/` — harness Vite do WC, independente do Storybook.
- `packages/web/harness/react/src/main.tsx` — suporte ao contexto declarativo de Cena.
- `packages/web/harness/angular/src/app.component.ts` — mesmo contrato de contexto.
- `packages/web/src/hosts/wc-harness.js` — host do novo WC harness.
- `packages/web/src/runner/preflight.ts` — preflight tipado consumido pelo adaptador CommonJS da CLI.
- `packages/web/src/run-legacy.js` — executor manual temporário, removido no corte.
- `packages/web/src/run.js` — orquestrador público do executor novo.

### Evidência e compatibilidade pública

- `packages/core/src/capture.js` — primitiva de captura numa `Page` já fornecida.
- `packages/core/src/manifest.js` — produtor v2 sem quebrar produtores v1.
- `packages/core/src/output.js` — summary/galeria com browser, comportamento e estabilidade.
- `packages/web/src/parity.js` e `packages/web/src/a11y.js` — browser como parte da chave.
- `packages/web/scripts/compare-web-engines.js` — equivalência automatizada do tracer.
- `packages/web/test/fixtures/controlled-counterproof/` — harness defeituoso end-to-end.

---

### Task 1: Adicionar Playwright Test e a fronteira TypeScript

**Files:**
- Modify: `packages/web/package.json`
- Modify: `package-lock.json`
- Create: `packages/web/tsconfig.json`
- Test: `packages/web/test/typescript-boundary.test.js`

**Interfaces:**
- Consumes: Node.js 24.13.1 e o Playwright 1.61.1 já resolvido no lockfile.
- Produces: scripts `typecheck` e `test:browser`; fronteira TypeScript ESM estrita sem emissão.

- [ ] **Step 1: Escrever o teste estrutural que falha**

Criar `packages/web/test/typescript-boundary.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

test('workspace web declara Playwright Test e typecheck sem emissao', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const tsconfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'tsconfig.json'), 'utf8'));
  assert.equal(pkg.devDependencies['@playwright/test'], '1.61.1');
  assert.ok(pkg.devDependencies.typescript);
  assert.ok(pkg.devDependencies['@types/node']);
  assert.equal(pkg.scripts.typecheck, 'tsc --noEmit');
  assert.equal(pkg.scripts['test:browser'], 'playwright test --config playwright.config.ts');
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.noEmit, true);
  assert.equal(tsconfig.compilerOptions.module, 'ESNext');
  assert.equal(tsconfig.compilerOptions.moduleResolution, 'Bundler');
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `node --test packages/web/test/typescript-boundary.test.js`

Expected: FAIL porque `packages/web/tsconfig.json` não existe.

- [ ] **Step 3: Instalar as dependências no workspace Web**

```bash
npm install --save-dev --save-exact @playwright/test@1.61.1 -w packages/web
npm install --save-dev typescript@^5.4.0 @types/node@^24.0.0 -w packages/web
```

Manter o runner exato: atualizar Playwright é uma mudança deliberada de baseline de browser,
com revisão própria de evidências, não um efeito colateral de `npm install`.

- [ ] **Step 4: Configurar scripts e TypeScript**

Deixar `packages/web/package.json#scripts` assim:

```json
{
  "test": "node --test",
  "typecheck": "tsc --noEmit",
  "test:browser": "playwright test --config playwright.config.ts"
}
```

Criar `packages/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": [
    "playwright.config.ts",
    "src/runner/**/*.ts",
    "contracts/**/*.ts",
    "test/browser/**/*.ts"
  ]
}
```

- [ ] **Step 5: Rodar testes e typecheck**

Run: `node --test packages/web/test/typescript-boundary.test.js && npm run typecheck -w packages/web`

Expected: PASS; `tsc` termina com exit `0`.

- [ ] **Step 6: Commit**

```bash
git add packages/web/package.json packages/web/tsconfig.json packages/web/test/typescript-boundary.test.js package-lock.json
git commit -m "build(web): add Playwright Test TypeScript boundary"
```

---

### Task 2: Tipos do domínio e Matriz de Suporte do consumidor

**Files:**
- Create: `packages/web/src/runner/types.ts`
- Create: `packages/web/src/runner/supportMatrix.ts`
- Test: `packages/web/test/support-matrix.test.js`

**Interfaces:**
- Consumes: `packages/components/browser-support.json` do plano Tangerina.
- Produces:
  - `BrowserName = 'chromium' | 'firefox' | 'webkit'`
  - `SupportMatrix {schemaVersion: 1, required: BrowserName[], optional: BrowserName[]}`
  - `loadSupportMatrix(repo: string): SupportMatrix`
  - tipos base `SceneDefinition`, `ContractDefinition`, `RunPlan`, `AtomicResult` usados pelas tasks seguintes.

- [ ] **Step 1: Escrever testes de schema que falham**

Criar `packages/web/test/support-matrix.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/supportMatrix.ts')).href);
}

function repoWith(value) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-support-'));
  const dir = path.join(repo, 'packages', 'components');
  fs.mkdirSync(dir, {recursive: true});
  if (value !== undefined) {
    fs.writeFileSync(path.join(dir, 'browser-support.json'), JSON.stringify(value));
  }
  return repo;
}

test('loadSupportMatrix aceita a matriz versionada do Tangerina', async t => {
  const repo = repoWith({schemaVersion: 1, required: ['chromium', 'firefox', 'webkit'], optional: []});
  t.after(() => fs.rmSync(repo, {recursive: true, force: true}));
  const {loadSupportMatrix} = await subject();
  assert.deepEqual(loadSupportMatrix(repo), {
    schemaVersion: 1,
    required: ['chromium', 'firefox', 'webkit'],
    optional: [],
  });
});

test('loadSupportMatrix falha fechado quando o contrato esta ausente', async t => {
  const repo = repoWith(undefined);
  t.after(() => fs.rmSync(repo, {recursive: true, force: true}));
  const {loadSupportMatrix} = await subject();
  assert.throws(() => loadSupportMatrix(repo), /browser-support\.json ausente/);
});

test('loadSupportMatrix rejeita schema, engine e duplicata desconhecidos', async t => {
  const {loadSupportMatrix} = await subject();
  for (const value of [
    {schemaVersion: 2, required: ['chromium'], optional: []},
    {schemaVersion: 1, required: ['chrome'], optional: []},
    {schemaVersion: 1, required: ['chromium'], optional: ['chromium']},
  ]) {
    const repo = repoWith(value);
    t.after(() => fs.rmSync(repo, {recursive: true, force: true}));
    assert.throws(() => loadSupportMatrix(repo), /Matriz de Suporte invalida/);
  }
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test packages/web/test/support-matrix.test.js`

Expected: FAIL com `ERR_MODULE_NOT_FOUND` para `supportMatrix.ts`.

- [ ] **Step 3: Criar os tipos compartilhados**

Criar `packages/web/src/runner/types.ts`:

```ts
import type {Locator, Page} from '@playwright/test';

export type BrowserName = 'chromium' | 'firefox' | 'webkit';
export type Framework = 'wc' | 'react' | 'angular';
export type ExecutionVerdict = 'passed' | 'error';
export type ProofVerdict = 'passed' | 'failed' | 'not-run' | 'not-comparable';
export type Stability = 'stable' | 'flaky';

export interface SupportMatrix {
  schemaVersion: 1;
  required: BrowserName[];
  optional: BrowserName[];
}

export interface SceneContext {
  kind: 'form';
  id: string;
}

export interface SceneDefinition {
  id: string;
  name: string;
  component: string;
  args: Record<string, unknown>;
  slots: Record<string, string | {icon: string}>;
  context?: SceneContext;
  legacyStoryName?: string;
}

export interface BehaviorRouteDefinition {
  id: string;
  sceneId: string;
  covers: string[];
}

export interface ContractDefinition {
  schemaVersion: 1;
  consumer: string;
  component: string;
  requiredBehaviors: string[];
  routes: BehaviorRouteDefinition[];
}

export interface PlannedScene extends SceneDefinition {
  cellId: string;
  brand: string;
  theme: string;
  viewport: string;
  width: number;
}

export interface RunPlan {
  schemaVersion: 1;
  runId: string;
  runDir: string;
  repo: string;
  consumer: string;
  component: string;
  card: string;
  diagnostic: boolean;
  collectA11y: boolean;
  browsers: BrowserName[];
  requiredBrowsers: BrowserName[];
  frameworks: Framework[];
  specPath: string;
  hostsPath: string;
  scenes: PlannedScene[];
  contract: {
    status: 'current' | 'stale';
    fingerprintDigest: string;
    currentDigest: string;
    requiredBehaviors: string[];
    coveredBehaviors: string[];
    routes: BehaviorRouteDefinition[];
  };
}

export interface BehaviorObservation<State = Record<string, unknown>> {
  focus: unknown;
  events: Array<{name: string; detail?: unknown}>;
  visibility: Record<string, boolean>;
  state: State;
}

export interface BehaviorContext {
  page: Page;
  root: Locator;
  scene: PlannedScene;
  listen(names: string[]): Promise<void>;
  readEvents(): Promise<Array<{name: string; detail?: unknown}>>;
}

export interface BehaviorExecution<State = Record<string, unknown>> {
  observation: BehaviorObservation<State>;
  assert(observation: BehaviorObservation<State>): void | Promise<void>;
}

export type BehaviorScript<State = Record<string, unknown>> =
  (context: BehaviorContext) => Promise<BehaviorExecution<State>>;

export type BehaviorScripts = Record<string, BehaviorScript>;

export interface FrameworkBehaviorResult {
  execution: ExecutionVerdict;
  conformance: ProofVerdict;
  observation?: BehaviorObservation;
  error?: string;
}

export interface RouteResult {
  routeId: string;
  covers: string[];
  frameworks: Record<Framework, FrameworkBehaviorResult>;
  parity: ProofVerdict;
  diff?: unknown;
}

export interface AtomicResult {
  schemaVersion: 1;
  logicalTestId: string;
  attempt: number;
  browser: BrowserName;
  scene: PlannedScene;
  status: 'passed' | 'failed' | 'error';
  captures: Array<Record<string, unknown>>;
  proofs: {groups: Array<Record<string, unknown>>};
  routes: RouteResult[];
  diagnostics: {
    console: string[];
    pageErrors: string[];
    attachments: string[];
  };
}
```

- [ ] **Step 4: Implementar o loader fail-closed**

Criar `packages/web/src/runner/supportMatrix.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import type {BrowserName, SupportMatrix} from './types.ts';

const ALLOWED = new Set<BrowserName>(['chromium', 'firefox', 'webkit']);

export function loadSupportMatrix(repo: string): SupportMatrix {
  const file = path.join(repo, 'packages', 'components', 'browser-support.json');
  if (!fs.existsSync(file)) {
    throw new Error(`Matriz de Suporte invalida: browser-support.json ausente em ${file}.`);
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<SupportMatrix>;
  const required = Array.isArray(raw.required) ? raw.required : [];
  const optional = Array.isArray(raw.optional) ? raw.optional : [];
  const all = [...required, ...optional];
  const valid = raw.schemaVersion === 1
    && required.length > 0
    && all.every(browser => ALLOWED.has(browser as BrowserName))
    && new Set(all).size === all.length;
  if (!valid) {
    throw new Error(`Matriz de Suporte invalida em ${file}.`);
  }
  return {schemaVersion: 1, required, optional} as SupportMatrix;
}
```

- [ ] **Step 5: Rodar testes e typecheck**

Run: `node --test packages/web/test/support-matrix.test.js && npm run typecheck -w packages/web`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/runner/types.ts packages/web/src/runner/supportMatrix.ts packages/web/test/support-matrix.test.js
git commit -m "feat(web): validate Tangerina browser support matrix"
```

---

### Task 3: Definir contratos e validar cobertura comportamental

**Files:**
- Create: `packages/web/src/runner/contracts.ts`
- Test: `packages/web/test/contracts.test.js`

**Interfaces:**
- Consumes: `ContractDefinition`, `SceneDefinition` da Task 2.
- Produces:
  - `defineContract(definition): ContractDefinition`
  - `validateContract(contract, scenes): {required: string[], covered: string[], missing: string[]}`
  - exceções explícitas para IDs duplicados, Cena inexistente e comportamento desconhecido.

- [ ] **Step 1: Escrever os testes que falham**

Criar `packages/web/test/contracts.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/contracts.ts')).href);
}

const scenes = [{id: 'primary', name: 'Primary', component: 'tgr-button', args: {}, slots: {}}];

test('validateContract calcula cobertura integral', async () => {
  const {defineContract, validateContract} = await subject();
  const contract = defineContract({
    schemaVersion: 1,
    consumer: 'tangerina',
    component: 'tgr-button',
    requiredBehaviors: ['activate', 'focus'],
    routes: [{id: 'activate-with-keyboard', sceneId: 'primary', covers: ['activate', 'focus']}],
  });
  assert.deepEqual(validateContract(contract, scenes), {
    required: ['activate', 'focus'],
    covered: ['activate', 'focus'],
    missing: [],
  });
});

test('validateContract informa lacuna sem transformar ausencia em aprovacao', async () => {
  const {validateContract} = await subject();
  const contract = {
    schemaVersion: 1, consumer: 'tangerina', component: 'tgr-button',
    requiredBehaviors: ['activate', 'disabled'],
    routes: [{id: 'activate', sceneId: 'primary', covers: ['activate']}],
  };
  assert.deepEqual(validateContract(contract, scenes).missing, ['disabled']);
});

test('validateContract rejeita rota duplicada, cena ausente e cobertura desconhecida', async () => {
  const {validateContract} = await subject();
  const base = {
    schemaVersion: 1, consumer: 'tangerina', component: 'tgr-button',
    requiredBehaviors: ['activate'],
  };
  assert.throws(() => validateContract({...base, routes: [
    {id: 'same', sceneId: 'primary', covers: ['activate']},
    {id: 'same', sceneId: 'primary', covers: ['activate']},
  ]}, scenes), /Roteiro duplicado/);
  assert.throws(() => validateContract({...base, routes: [
    {id: 'x', sceneId: 'missing', covers: ['activate']},
  ]}, scenes), /Cena inexistente/);
  assert.throws(() => validateContract({...base, routes: [
    {id: 'x', sceneId: 'primary', covers: ['unknown']},
  ]}, scenes), /comportamento nao declarado/);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test packages/web/test/contracts.test.js`

Expected: FAIL com `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implementar definição e validação**

Criar `packages/web/src/runner/contracts.ts`:

```ts
import type {ContractDefinition, SceneDefinition} from './types.ts';

export function defineContract(definition: ContractDefinition): ContractDefinition {
  return definition;
}

export function validateContract(contract: ContractDefinition, scenes: SceneDefinition[]) {
  const sceneIds = new Set(scenes.map(scene => scene.id));
  const required = [...new Set(contract.requiredBehaviors)].sort();
  const requiredSet = new Set(required);
  const routeIds = new Set<string>();
  const coveredSet = new Set<string>();

  for (const route of contract.routes) {
    if (routeIds.has(route.id)) throw new Error(`Roteiro duplicado: ${route.id}.`);
    routeIds.add(route.id);
    if (!sceneIds.has(route.sceneId)) throw new Error(`Cena inexistente no Roteiro ${route.id}: ${route.sceneId}.`);
    for (const behavior of route.covers) {
      if (!requiredSet.has(behavior)) {
        throw new Error(`Roteiro ${route.id} cobre comportamento nao declarado: ${behavior}.`);
      }
      coveredSet.add(behavior);
    }
  }

  const covered = [...coveredSet].sort();
  return {required, covered, missing: required.filter(id => !coveredSet.has(id))};
}
```

- [ ] **Step 4: Rodar testes e typecheck**

Run: `node --test packages/web/test/contracts.test.js && npm run typecheck -w packages/web`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/runner/contracts.ts packages/web/test/contracts.test.js
git commit -m "feat(web): model behavioral contracts and coverage"
```

---

### Task 4: Extrair e revisar fingerprint CEM, React e Angular

**Files:**
- Create: `packages/web/src/runner/publicSurface.ts`
- Create: `packages/web/src/runner/fingerprint.ts`
- Create: `packages/web/test/fixtures/public-surface/custom-elements.json`
- Create: `packages/web/test/fixtures/public-surface/react.d.ts`
- Create: `packages/web/test/fixtures/public-surface/angular.d.ts`
- Test: `packages/web/test/fingerprint.test.js`

**Interfaces:**
- Consumes: `typescript` da Task 1 e os builds do Tangerina.
- Produces:
  - `readPublicSurface(repo, component): PublicSurface`
  - `createFingerprint(surface): {schemaVersion: 1, component, digest, surface}`
  - `diffFingerprints(reviewed, current): FingerprintDiff[]`
  - `readReviewedFingerprint(file)` e `writeReviewedFingerprint(file, fingerprint)`.

- [ ] **Step 1: Criar fixtures mínimas dos três contratos**

Criar `packages/web/test/fixtures/public-surface/custom-elements.json`:

```json
{
  "modules": [{
    "declarations": [{
      "kind": "class",
      "customElement": true,
      "tagName": "tgr-button",
      "name": "TgrButton",
      "attributes": [{"name": "disabled", "type": {"text": "boolean"}}],
      "members": [{"kind": "field", "name": "disabled", "type": {"text": "boolean"}}],
      "events": [{"name": "tgrClick", "type": {"text": "CustomEvent<{clicked: true}>"}}],
      "slots": [{"name": ""}, {"name": "icon"}]
    }]
  }]
}
```

Criar `packages/web/test/fixtures/public-surface/react.d.ts`:

```ts
type TgrButtonEvents = {onTgrClick: EventName<CustomEvent<{clicked: true}>>};
declare const TgrButton: StencilReactComponent<TgrButtonElement, TgrButtonEvents>;
export {TgrButton};
```

Criar `packages/web/test/fixtures/public-surface/angular.d.ts`:

```ts
declare class TgrButton {
  static ɵcmp: i0.ɵɵComponentDeclaration<TgrButton, "tgr-button", never, {
    "disabled": {"alias": "disabled"; "required": false};
  }, {}, never, ["*"], true, never>;
}
declare interface TgrButton {
  tgrClick: EventEmitter<CustomEvent<{clicked: true}>>;
}
export {TgrButton};
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `packages/web/test/fingerprint.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const FIXTURE = path.join(__dirname, 'fixtures', 'public-surface');

async function modules() {
  return Promise.all([
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/publicSurface.ts')).href),
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/fingerprint.ts')).href),
  ]);
}

test('readPublicSurface combina WC, React e Angular de forma canonica', async () => {
  const [{readPublicSurface}] = await modules();
  const surface = readPublicSurface('/unused', 'tgr-button', {
    cemPath: path.join(FIXTURE, 'custom-elements.json'),
    reactPath: path.join(FIXTURE, 'react.d.ts'),
    angularPath: path.join(FIXTURE, 'angular.d.ts'),
  });
  assert.deepEqual(surface.wc.attributes, [{name: 'disabled', type: 'boolean'}]);
  assert.deepEqual(surface.wc.events, [{name: 'tgrClick', type: 'CustomEvent<{clicked: true}>'}]);
  assert.deepEqual(surface.wc.slots, ['', 'icon']);
  assert.deepEqual(surface.react, {exportName: 'TgrButton', events: ['onTgrClick']});
  assert.deepEqual(surface.angular, {selector: 'tgr-button', inputs: ['disabled'], outputs: ['tgrClick'], projectableSlots: ['*']});
});

test('fingerprint e diff sao deterministas e legiveis', async () => {
  const [, {createFingerprint, diffFingerprints}] = await modules();
  const base = {
    component: 'tgr-button',
    wc: {attributes: [], properties: [], events: [], slots: []},
    react: {exportName: 'TgrButton', events: []},
    angular: {selector: 'tgr-button', inputs: [], outputs: [], projectableSlots: []},
  };
  const first = createFingerprint(base);
  const second = createFingerprint({...base, wc: {...base.wc, slots: ['icon']}});
  assert.match(first.digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(createFingerprint(base), first);
  assert.deepEqual(diffFingerprints(first, second), [{path: 'wc.slots', kind: 'added', value: 'icon'}]);
});

test('writeReviewedFingerprint usa JSON formatado com newline', async t => {
  const [, {createFingerprint, writeReviewedFingerprint, readReviewedFingerprint}] = await modules();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-fingerprint-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'fingerprint.json');
  const fingerprint = createFingerprint({component: 'x', wc: {attributes: [], properties: [], events: [], slots: []}, react: {exportName: 'X', events: []}, angular: {selector: 'x', inputs: [], outputs: [], projectableSlots: []}});
  writeReviewedFingerprint(file, fingerprint);
  assert.equal(fs.readFileSync(file, 'utf8').endsWith('\n'), true);
  assert.deepEqual(readReviewedFingerprint(file), fingerprint);
});
```

- [ ] **Step 3: Rodar e confirmar a falha**

Run: `node --test packages/web/test/fingerprint.test.js`

Expected: FAIL com `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Implementar a extração da superfície pública**

Criar `packages/web/src/runner/publicSurface.ts` com estes exports e algoritmos completos:

```ts
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

type NamedType = {name: string; type: string};
export interface PublicSurface {
  component: string;
  wc: {attributes: NamedType[]; properties: NamedType[]; events: NamedType[]; slots: string[]};
  react: {exportName: string; events: string[]};
  angular: {selector: string; inputs: string[]; outputs: string[]; projectableSlots: string[]};
}

function sortNamed(values: NamedType[]) {
  return values.sort((a, b) => a.name.localeCompare(b.name));
}

function pascalCase(component: string) {
  return component.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');
}

function parseTypes(file: string) {
  const sourceText = fs.readFileSync(file, 'utf8');
  return ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function propertyName(node: ts.PropertyName | undefined) {
  if (!node) return '';
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : '';
}

function reactSurface(file: string, exportName: string) {
  const source = parseTypes(file);
  let found = false;
  let eventTypeName = '';
  const aliases = new Map<string, ts.TypeAliasDeclaration>();
  source.forEachChild(node => {
    if (ts.isTypeAliasDeclaration(node)) aliases.set(node.name.text, node);
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== exportName) continue;
      found = true;
      if (declaration.type && ts.isTypeReferenceNode(declaration.type)) {
        const eventType = declaration.type.typeArguments?.[1];
        if (eventType && ts.isTypeReferenceNode(eventType) && ts.isIdentifier(eventType.typeName)) {
          eventTypeName = eventType.typeName.text;
        }
      }
    }
  });
  if (!found) throw new Error(`Wrapper React nao exporta ${exportName}.`);
  const alias = aliases.get(eventTypeName);
  const events = alias && ts.isTypeLiteralNode(alias.type)
    ? alias.type.members.map(member => propertyName(member.name)).filter(Boolean).sort()
    : [];
  return {exportName, events};
}

function angularSurface(file: string, className: string, component: string) {
  const source = parseTypes(file);
  let selector = '';
  let inputs: string[] = [];
  let projectableSlots: string[] = [];
  const outputs: string[] = [];
  source.forEachChild(node => {
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      const cmp = node.members.find(member => propertyName(member.name) === 'ɵcmp');
      if (cmp && ts.isPropertyDeclaration(cmp) && cmp.type && ts.isTypeReferenceNode(cmp.type)) {
        const args = cmp.type.typeArguments || [];
        if (args[1] && ts.isLiteralTypeNode(args[1]) && ts.isStringLiteral(args[1].literal)) selector = args[1].literal.text;
        if (args[3] && ts.isTypeLiteralNode(args[3])) inputs = args[3].members.map(member => propertyName(member.name)).filter(Boolean).sort();
        if (args[6] && ts.isTupleTypeNode(args[6])) {
          projectableSlots = args[6].elements
            .filter(ts.isLiteralTypeNode)
            .map(item => ts.isStringLiteral(item.literal) ? item.literal.text : '')
            .filter(Boolean)
            .sort();
        }
      }
    }
    if (ts.isInterfaceDeclaration(node) && node.name.text === className) {
      for (const member of node.members) {
        if (member.type && member.type.getText(source).startsWith('EventEmitter<')) outputs.push(propertyName(member.name));
      }
    }
  });
  if (selector !== component) throw new Error(`Wrapper Angular nao expoe o seletor ${component}.`);
  return {selector, inputs, outputs: outputs.sort(), projectableSlots};
}

export function readPublicSurface(repo: string, component: string, overrides: {cemPath?: string; reactPath?: string; angularPath?: string} = {}): PublicSurface {
  const cemPath = overrides.cemPath || path.join(repo, 'packages/components/custom-elements.json');
  const reactPath = overrides.reactPath || path.join(repo, 'packages/components-react/dist/index.d.ts');
  const angularPath = overrides.angularPath || path.join(repo, 'packages/components-angular/dist/index.d.ts');
  const cem = JSON.parse(fs.readFileSync(cemPath, 'utf8'));
  const declaration = (cem.modules || []).flatMap((module: {declarations?: unknown[]}) => module.declarations || [])
    .find((item: {tagName?: string}) => item.tagName === component);
  if (!declaration) throw new Error(`Custom Elements Manifest nao declara ${component}.`);
  const named = (items: Array<{name: string; type?: {text?: string}}> = []) =>
    sortNamed(items.map(item => ({name: item.name, type: item.type?.text || 'unknown'})));
  const exportName = pascalCase(component);
  return {
    component,
    wc: {
      attributes: named(declaration.attributes),
      properties: named((declaration.members || []).filter((item: {kind?: string}) => item.kind === 'field')),
      events: named(declaration.events),
      slots: (declaration.slots || []).map((slot: {name?: string}) => slot.name || '').sort(),
    },
    react: reactSurface(reactPath, exportName),
    angular: angularSurface(angularPath, exportName, component),
  };
}
```

- [ ] **Step 5: Implementar digest, persistência e diff**

Criar `packages/web/src/runner/fingerprint.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {PublicSurface} from './publicSurface.ts';

export interface ReviewedFingerprint {
  schemaVersion: 1;
  component: string;
  digest: string;
  surface: PublicSurface;
}

export interface FingerprintDiff {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  value?: unknown;
  before?: unknown;
  after?: unknown;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

export function createFingerprint(surface: PublicSurface): ReviewedFingerprint {
  const digest = createHash('sha256').update(canonical(surface)).digest('hex');
  return {schemaVersion: 1, component: surface.component, digest, surface};
}

function flatten(value: unknown, prefix = '', out = new Map<string, unknown>()) {
  if (Array.isArray(value)) {
    out.set(prefix, value);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      flatten(item, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out.set(prefix, value);
  }
  return out;
}

export function diffFingerprints(reviewed: ReviewedFingerprint, current: ReviewedFingerprint): FingerprintDiff[] {
  const before = flatten(reviewed.surface);
  const after = flatten(current.surface);
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const diffs: FingerprintDiff[] = [];
  for (const itemPath of paths) {
    const left = before.get(itemPath);
    const right = after.get(itemPath);
    if (Array.isArray(left) && Array.isArray(right)) {
      const leftValues = new Set(left.map(item => typeof item === 'string' ? item : JSON.stringify(item)));
      const rightValues = new Set(right.map(item => typeof item === 'string' ? item : JSON.stringify(item)));
      for (const value of [...rightValues].filter(item => !leftValues.has(item)).sort()) diffs.push({path: itemPath, kind: 'added', value: JSON.parse(value.startsWith('{') ? value : JSON.stringify(value))});
      for (const value of [...leftValues].filter(item => !rightValues.has(item)).sort()) diffs.push({path: itemPath, kind: 'removed', value: JSON.parse(value.startsWith('{') ? value : JSON.stringify(value))});
    } else if (canonical(left) !== canonical(right)) {
      diffs.push({path: itemPath, kind: left === undefined ? 'added' : right === undefined ? 'removed' : 'changed', before: left, after: right});
    }
  }
  return diffs;
}

export function readReviewedFingerprint(file: string): ReviewedFingerprint {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeReviewedFingerprint(file: string, fingerprint: ReviewedFingerprint) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(fingerprint, null, 2)}\n`);
}
```

- [ ] **Step 6: Rodar testes e typecheck**

Run: `node --test packages/web/test/fingerprint.test.js && npm run typecheck -w packages/web`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/runner/publicSurface.ts packages/web/src/runner/fingerprint.ts packages/web/test/fingerprint.test.js packages/web/test/fixtures/public-surface
git commit -m "feat(web): fingerprint component public surface"
```

---

### Task 5: Criar o WC harness e unificar o contexto declarativo de montagem

**Files:**
- Create: `packages/web/harness/wc/package.json`
- Create: `packages/web/harness/wc/package-lock.json`
- Create: `packages/web/harness/wc/.gitignore`
- Create: `packages/web/harness/wc/index.html`
- Create: `packages/web/harness/wc/src/main.ts`
- Create: `packages/web/harness/wc/vite.config.ts`
- Create: `packages/web/src/hosts/wc-harness.js`
- Modify: `packages/web/harness/react/src/main.tsx`
- Modify: `packages/web/harness/angular/src/app.component.ts`
- Modify: `packages/web/src/hosts/react.js`
- Modify: `packages/web/src/hosts/angular.js`
- Modify: `package.json`
- Test: `packages/web/test/scene-harness.test.js`

**Interfaces:**
- Consumes: `SceneDefinition.args`, `slots` e `context` da Task 2.
- Produces: três harnesses que aceitam os mesmos query params `c`, `brand`, `theme`, `args`, `slots`, `context`, `background`; host novo `makeWcHarnessHost(repo)`.

- [ ] **Step 1: Escrever os testes estruturais e de URL que falham**

Criar `packages/web/test/scene-harness.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {makeWcHarnessHost} = require('../src/hosts/wc-harness');
const {makeReactHost} = require('../src/hosts/react');
const {makeAngularHost} = require('../src/hosts/angular');

const ROOT = path.resolve(__dirname, '..');
const cell = {
  component: 'tgr-button', sceneId: 'submit', brand: 'gol', theme: 'light',
  viewport: 'sm', args: {type: 'submit'}, slots: {'': 'Enviar'},
  context: {kind: 'form', id: 'button-form'},
};

test('os tres hosts serializam a mesma Cena declarativa', () => {
  for (const host of [makeWcHarnessHost('/repo'), makeReactHost('/repo'), makeAngularHost('/repo')]) {
    const url = new URL(host.urlFor(cell, 'http://127.0.0.1:3000'));
    assert.equal(url.searchParams.get('c'), 'tgr-button');
    assert.deepEqual(JSON.parse(url.searchParams.get('args')), {type: 'submit'});
    assert.deepEqual(JSON.parse(url.searchParams.get('slots')), {'': 'Enviar'});
    assert.deepEqual(JSON.parse(url.searchParams.get('context')), {kind: 'form', id: 'button-form'});
    assert.equal(host.selectorFor(cell), '#evidence-root');
  }
});

test('WC harness pertence ao Anemoi e nao importa Storybook', () => {
  const source = fs.readFileSync(path.join(ROOT, 'harness/wc/src/main.ts'), 'utf8');
  assert.match(source, /defineCustomElements/);
  assert.doesNotMatch(source, /storybook/i);
  assert.match(source, /evidence-root/);
});

test('setup:harnesses instala wc, react e angular', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(ROOT, '../..', 'package.json'), 'utf8'));
  assert.match(pkg.scripts['setup:harnesses'], /harness\/wc install/);
  assert.match(pkg.scripts['setup:harnesses'], /harness\/react install/);
  assert.match(pkg.scripts['setup:harnesses'], /harness\/angular install/);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test packages/web/test/scene-harness.test.js`

Expected: FAIL porque `hosts/wc-harness.js` não existe.

- [ ] **Step 3: Criar o WC harness Vite**

Criar `packages/web/harness/wc/package.json`:

```json
{
  "name": "harness-wc",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {"build": "vite build", "dev": "vite"},
  "devDependencies": {"typescript": "^5.7.3", "vite": "^6.0.7"}
}
```

Criar `.gitignore` com `node_modules/` e `dist/`. Criar `index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8" /><title>harness-wc</title><style>body { margin: 0; padding: 1rem; }</style></head>
  <body><div id="evidence-root"></div><script type="module" src="/src/main.ts"></script></body>
</html>
```

Criar `packages/web/harness/wc/vite.config.ts`:

```ts
import {defineConfig} from 'vite';
import path from 'node:path';

const repo = process.env.DS_REPO;
if (!repo) throw new Error('DS_REPO must point to the configured tangerina-web-core checkout.');

export default defineConfig({
  resolve: {alias: {
    '@gol-smiles/tangerina-web-core': path.join(repo, 'packages/components'),
    '@gol-smiles/tangerina-token': path.join(repo, 'packages/tokens'),
    '@gol-smiles/tangerina-fonts': path.join(repo, 'packages/fonts'),
  }},
  build: {emptyOutDir: true},
});
```

Criar `packages/web/harness/wc/src/main.ts`:

```ts
import '@gol-smiles/tangerina-token/dist/tokens.css';
import '@gol-smiles/tangerina-fonts/dist/fonts.css';
import {defineCustomElements} from '@gol-smiles/tangerina-web-core/dist/components';

defineCustomElements();

const params = new URLSearchParams(location.search);
const component = params.get('c') || '';
const brand = params.get('brand') || 'gol';
const theme = params.get('theme') || 'light';
const background = params.get('background') || '';
const args = JSON.parse(params.get('args') || '{}') as Record<string, unknown>;
const slots = JSON.parse(params.get('slots') || '{}') as Record<string, string | {icon: string}>;
const context = JSON.parse(params.get('context') || 'null') as {kind: 'form'; id: string} | null;

document.documentElement.toggleAttribute('data-theme', theme === 'dark');
if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
if (brand !== 'gol') document.documentElement.setAttribute('data-brand', brand);
else document.documentElement.removeAttribute('data-brand');
document.body.style.background = background;

const root = document.getElementById('evidence-root')!;
const container = context?.kind === 'form' ? document.createElement('form') : document.createElement('div');
if (context?.kind === 'form') {
  container.id = context.id;
  container.addEventListener('submit', event => event.preventDefault());
}
const element = document.createElement(component) as HTMLElement & Record<string, unknown>;
Object.assign(element, args);
for (const [name, value] of Object.entries(slots)) {
  const slot = document.createElement('span');
  if (name) slot.setAttribute('slot', name);
  if (typeof value === 'string') slot.innerHTML = value;
  else slot.appendChild(document.createElement(`tgr-icon-${value.icon}`));
  element.appendChild(slot);
}
container.appendChild(element);
root.appendChild(container);
```

Gerar lockfile:

```bash
npm install --prefix packages/web/harness/wc
```

- [ ] **Step 4: Criar o host do WC harness**

Criar `packages/web/src/hosts/wc-harness.js`:

```js
'use strict';
const path = require('node:path');
const {runLogged} = require('../process');
const {VIEWPORT_WIDTHS} = require('../brands');
const {backgroundForCell} = require('./environment');

const HARNESS = path.join(__dirname, '..', '..', 'harness', 'wc');

function build(repo, outDir, {logPath = path.join(path.dirname(outDir), 'wc-harness-build.log'), run = runLogged} = {}) {
  run('npx', ['vite', 'build', '--outDir', outDir], {
    cwd: HARNESS,
    env: {...process.env, DS_REPO: repo},
    logPath,
    echo: true,
  });
  return outDir;
}

function urlFor(cell, baseUrl) {
  const query = new URLSearchParams({
    c: cell.component,
    scene: cell.sceneId || cell.storyId || '',
    brand: cell.brand || 'gol',
    theme: cell.theme || 'light',
    viewport: cell.viewport || 'sm',
    args: JSON.stringify(cell.args || {}),
    slots: JSON.stringify(cell.slots || {}),
    context: JSON.stringify(cell.context || null),
    background: backgroundForCell(cell),
  });
  return `${baseUrl}/index.html?${query}`;
}

async function verify(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#evidence-root');
    const customElement = root && [...root.querySelectorAll('*')].find(element => element.tagName.includes('-'));
    return Boolean(customElement && customElement.shadowRoot);
  }, {timeout: 15000});
}

function makeWcHarnessHost(repo, options = {}) {
  return {
    framework: 'wc',
    viewportWidths: VIEWPORT_WIDTHS,
    build: (value, outDir, buildOptions = {}) => build(value || repo, outDir, {...options, ...buildOptions}),
    urlFor,
    selectorFor: () => '#evidence-root',
    verify,
  };
}

module.exports = {makeWcHarnessHost};
```

- [ ] **Step 5: Serializar `context` nos hosts React e Angular**

Em `urlFor` de `packages/web/src/hosts/react.js` e `angular.js`, acrescentar:

```js
const context = encodeURIComponent(JSON.stringify(cell.context || null));
return `${baseUrl}/index.html?c=${c}&story=${story}&brand=${brand}&theme=${theme}&viewport=${viewport}&args=${args}&slots=${slots}&context=${context}&background=${background}`;
```

Manter os demais campos e mudar `selectorFor` nos três hosts para `#evidence-root`.

Como Cenas de formulário adicionam um wrapper, substituir o `verify` superficial do host React
pela mesma espera recursiva de custom element hidratado usada no Angular:

```js
async function verify(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#evidence-root');
    const customElement = root && [...root.querySelectorAll('*')]
      .find(element => element.tagName.includes('-'));
    return Boolean(customElement && customElement.shadowRoot);
  }, {timeout: 15000});
}
```

- [ ] **Step 6: Montar contexto `form` nos wrappers**

No React, ler `context` e substituir a chamada final de `root.render` por:

```tsx
const context: {kind: 'form'; id: string} | null = JSON.parse(
  decodeURIComponent(params.get('context') || 'null')
);
const componentNode = createElement(Comp, args as React.ComponentProps<typeof Comp>, ...slotChildren);
root.render(context?.kind === 'form'
  ? createElement('form', {id: context.id, onSubmit: event => event.preventDefault()}, componentNode)
  : componentNode);
```

No Angular, adicionar `context` à classe, lê-lo em `ngOnInit`, e substituir o template por:

```html
<div id="evidence-root">
  @if (Cmp) {
    @if (context?.kind === 'form') {
      <form [id]="context!.id" (submit)="$event.preventDefault()">
        <ng-container *ngComponentOutlet="Cmp; inputs: args; environmentInjector: envInjector"></ng-container>
      </form>
    } @else {
      <ng-container *ngComponentOutlet="Cmp; inputs: args; environmentInjector: envInjector"></ng-container>
    }
  }
</div>
```

O campo é:

```ts
context: {kind: 'form'; id: string} | null = null;
```

e a leitura em `ngOnInit`:

```ts
this.context = JSON.parse(decodeURIComponent(p.get('context') || 'null'));
```

- [ ] **Step 7: Instalar o novo harness no setup raiz**

Alterar `package.json#scripts.setup:harnesses` para:

```json
"setup:harnesses": "npm --prefix packages/web/harness/wc install && npm --prefix packages/web/harness/react install && npm --prefix packages/web/harness/angular install"
```

- [ ] **Step 8: Rodar testes e builds dos harnesses**

Run:

```bash
node --test packages/web/test/scene-harness.test.js packages/web/test/host-urls.test.js
npm --prefix packages/web/harness/wc run build -- --outDir /tmp/anemoi-wc-harness-check
```

Expected: testes PASS; o build só deve ser executado com `DS_REPO` apontando para o Tangerina configurado e termina com `index.html` no diretório informado.

- [ ] **Step 9: Commit**

```bash
git add package.json packages/web/harness/wc packages/web/harness/react/src/main.tsx packages/web/harness/angular/src/app.component.ts packages/web/src/hosts/wc-harness.js packages/web/src/hosts/react.js packages/web/src/hosts/angular.js packages/web/test/scene-harness.test.js
git commit -m "feat(web): mount Anemoi scenes in isolated harnesses"
```

---

### Task 6: Declarar o contrato e as Cenas do `tgr-button`

**Files:**
- Create: `packages/web/contracts/tangerina/tgr-button/contract.ts`
- Create: `packages/web/contracts/tangerina/tgr-button/scenes.ts`
- Create: `packages/web/contracts/tangerina/tgr-button/fingerprint.json` (gerado)
- Test: `packages/web/test/tgr-button-contract.test.js`

**Interfaces:**
- Consumes: `defineContract`, `validateContract`, `readPublicSurface`, `createFingerprint`.
- Produces: `contract`, `scenes` e fingerprint revisado usados pelo preflight e pelo spec da Task 11.

- [ ] **Step 1: Criar o contrato completo do tracer**

Criar `packages/web/contracts/tangerina/tgr-button/contract.ts`:

```ts
import {defineContract} from '../../../src/runner/contracts.ts';

export const contract = defineContract({
  schemaVersion: 1,
  consumer: 'tangerina',
  component: 'tgr-button',
  requiredBehaviors: [
    'activation-emits-tgr-click',
    'disabled-blocks-activation',
    'loading-blocks-activation',
    'loading-remains-focusable',
    'submit-emits-form-submit',
    'reset-emits-form-reset',
    'slotted-content-defines-name',
  ],
  routes: [
    {id: 'activation', sceneId: 'primary', covers: ['activation-emits-tgr-click']},
    {id: 'disabled', sceneId: 'disabled', covers: ['disabled-blocks-activation']},
    {id: 'loading', sceneId: 'loading', covers: ['loading-blocks-activation', 'loading-remains-focusable']},
    {id: 'submit', sceneId: 'submit', covers: ['submit-emits-form-submit']},
    {id: 'reset', sceneId: 'reset', covers: ['reset-emits-form-reset']},
    {id: 'slotted-label', sceneId: 'slotted-label', covers: ['slotted-content-defines-name']},
  ],
});
```

- [ ] **Step 2: Declarar as Cenas visuais e comportamentais**

Criar `packages/web/contracts/tangerina/tgr-button/scenes.ts`:

```ts
import type {SceneDefinition} from '../../../src/runner/types.ts';

const defaults = {
  label: 'Salvar', variant: 'primary', size: 'lg', type: 'button',
  disabled: false, loading: false, fullWidth: false, brand: false,
};

const scene = (id: string, name: string, args = {}, slots = {}, extra = {}): SceneDefinition => ({
  id, name, component: 'tgr-button', args: {...defaults, ...args}, slots, ...extra,
});

export const scenes: SceneDefinition[] = [
  scene('default', 'Default', {}, {}, {legacyStoryName: 'Default'}),
  scene('primary', 'Primary', {variant: 'primary'}, {}, {legacyStoryName: 'Primary'}),
  scene('secondary', 'Secondary', {variant: 'secondary'}, {}, {legacyStoryName: 'Secondary'}),
  scene('mini', 'Mini', {variant: 'mini', label: 'Ver mais'}, {}, {legacyStoryName: 'Mini'}),
  scene('disabled', 'Disabled', {disabled: true}, {}, {legacyStoryName: 'Disabled'}),
  scene('loading', 'Loading', {loading: true, label: 'Salvando'}, {}, {legacyStoryName: 'Loading'}),
  scene('with-icon', 'Com Icone', {label: 'Baixar'}, {
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" /></svg>',
  }, {legacyStoryName: 'Com Icone'}),
  scene('small', 'Small', {size: 'sm'}, {}, {legacyStoryName: 'Small'}),
  scene('full-width', 'Full Width', {fullWidth: true, label: 'Continuar'}, {}, {legacyStoryName: 'Full Width'}),
  scene('on-brand', 'On Brand', {brand: true, label: 'Entrar'}, {}, {legacyStoryName: 'On Brand'}),
  scene('submit', 'Submit', {type: 'submit', label: 'Enviar'}, {}, {context: {kind: 'form', id: 'submit-form'}}),
  scene('reset', 'Reset', {type: 'reset', label: 'Limpar'}, {}, {context: {kind: 'form', id: 'reset-form'}}),
  scene('slotted-label', 'Slotted Label', {label: 'Fallback'}, {'': 'Continuar'}),
];
```

- [ ] **Step 3: Escrever o teste que falha sem fingerprint**

Criar `packages/web/test/tgr-button-contract.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const DIR = path.resolve(__dirname, '../contracts/tangerina/tgr-button');

test('tgr-button possui cobertura integral e fingerprint revisado', async () => {
  const [{contract}, {scenes}, {validateContract}] = await Promise.all([
    import(pathToFileURL(path.join(DIR, 'contract.ts')).href),
    import(pathToFileURL(path.join(DIR, 'scenes.ts')).href),
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/contracts.ts')).href),
  ]);
  assert.deepEqual(validateContract(contract, scenes).missing, []);
  assert.equal(new Set(scenes.map(scene => scene.id)).size, scenes.length);
  const fingerprint = JSON.parse(fs.readFileSync(path.join(DIR, 'fingerprint.json'), 'utf8'));
  assert.equal(fingerprint.schemaVersion, 1);
  assert.equal(fingerprint.component, 'tgr-button');
  assert.match(fingerprint.digest, /^[a-f0-9]{64}$/);
});
```

Run: `node --test packages/web/test/tgr-button-contract.test.js`

Expected: FAIL com `ENOENT` para `fingerprint.json`.

- [ ] **Step 4: Gerar o fingerprint a partir do Tangerina configurado**

```bash
node -e "const {resolveRepository}=require('./packages/web/src/config'); const repo=resolveRepository({rootDir:process.cwd(),cwd:process.cwd(),repoArg:'tangerina'}); Promise.all([import('./packages/web/src/runner/publicSurface.ts'), import('./packages/web/src/runner/fingerprint.ts')]).then(([surface, fp]) => fp.writeReviewedFingerprint('./packages/web/contracts/tangerina/tgr-button/fingerprint.json', fp.createFingerprint(surface.readPublicSurface(repo, 'tgr-button'))))"
```

Expected: `fingerprint.json` formatado, com `schemaVersion: 1`, `component: "tgr-button"`, digest SHA-256 e as três superfícies.

- [ ] **Step 5: Rodar testes e typecheck**

Run: `node --test packages/web/test/tgr-button-contract.test.js && npm run typecheck -w packages/web`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/contracts/tangerina/tgr-button packages/web/test/tgr-button-contract.test.js
git commit -m "feat(web): define tgr-button confidence contract"
```

---

### Task 7: Extrair captura por `Page` e tornar os artefatos browser-aware

**Files:**
- Modify: `packages/core/src/capture.js`
- Modify: `packages/core/test/capture.test.js`
- Modify: `packages/web/src/parity.js`
- Modify: `packages/web/src/a11y.js`
- Modify: `packages/web/test/parity.test.js`
- Modify: `packages/web/test/a11y.test.js`

**Interfaces:**
- Consumes: uma `Page` fornecida pelo Playwright Test ou pelo executor legado.
- Produces:
  - `captureCellOnPage(page, cell, host, baseUrl, destDir, options): Promise<Capture>`
  - paths v2 `<browser>/<framework>/<brand>/<scene>/<viewport>/<theme>.*`
  - agrupamento e diffs que incluem browser na identidade sem quebrar capturas v1 sem `browser`;
  - `artifactPrefix` opcional para que diffs de cada retry permaneçam no diretório exclusivo da tentativa.

- [ ] **Step 1: Adicionar testes que falham para a primitiva de página**

Em `packages/core/test/capture.test.js`, adicionar:

```js
test('cellRelPath inclui browser somente quando informado', () => {
  const base = {framework: 'wc', brand: 'gol', storyId: 'primary', viewport: 'sm', theme: 'light'};
  assert.equal(cellRelPath(base), path.join('wc', 'gol', 'primary', 'sm', 'light.png'));
  assert.equal(cellRelPath({...base, browser: 'firefox'}), path.join('firefox', 'wc', 'gol', 'primary', 'sm', 'light.png'));
});

test('captureCellOnPage usa a Page recebida sem lancar browser', async t => {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-page-capture-'));
  t.after(() => fs.rmSync(dest, {recursive: true, force: true}));
  const calls = [];
  const page = {
    setViewportSize: async value => calls.push(['viewport', value]),
    goto: async value => calls.push(['goto', value]),
    locator: () => ({screenshot: async ({path: output}) => { fs.mkdirSync(path.dirname(output), {recursive: true}); fs.writeFileSync(output, 'png'); }}),
  };
  const host = {urlFor: () => 'http://fixture/scene', selectorFor: () => '#evidence-root', verify: async () => calls.push(['verify'])};
  const result = await captureCellOnPage(page, {
    browser: 'webkit', framework: 'wc', brand: 'gol', storyId: 'primary', storyName: 'Primary',
    viewport: 'sm', theme: 'light', width: 360,
  }, host, 'http://fixture', dest, {collectA11y: false});
  assert.equal(result.relPath, path.join('webkit', 'wc', 'gol', 'primary', 'sm', 'light.png'));
  assert.deepEqual(calls.map(call => call[0]), ['viewport', 'goto', 'verify']);
});
```

Atualizar o import do teste para incluir `captureCellOnPage` e `cellRelPath`.

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test packages/core/test/capture.test.js`

Expected: FAIL porque `captureCellOnPage` não é exportada e o path não inclui browser.

- [ ] **Step 3: Extrair `captureCellOnPage` e reutilizá-la no legado**

Em `packages/core/src/capture.js`, substituir `cellRelPath` e extrair a lógica interna do loop:

```js
function cellRelPath(cell) {
  const segments = [];
  if (cell.browser) segments.push(assertSafePathSegment(cell.browser, 'browser'));
  segments.push(
    assertSafePathSegment(cell.framework, 'framework'),
    assertSafePathSegment(cell.brand, 'brand'),
    assertSafePathSegment(cell.storyId || cell.sceneId, 'sceneId'),
    assertSafePathSegment(cell.viewport, 'viewport'),
    `${assertSafePathSegment(cell.theme, 'theme')}.png`,
  );
  return path.join(...segments);
}

async function captureCellOnPage(page, cell, host, baseUrl, destDir, {collectA11y = true} = {}) {
  const relPath = cellRelPath(cell);
  const outPath = path.join(destDir, relPath);
  fs.mkdirSync(path.dirname(outPath), {recursive: true});
  await page.setViewportSize({width: cell.width, height: 900});
  await page.goto(host.urlFor(cell, baseUrl), {waitUntil: 'networkidle', timeout: 30000});
  if (host.verify) await host.verify(page, cell);
  await page.locator(host.selectorFor(cell)).screenshot({path: outPath, animations: 'disabled'});
  const result = {...cell, storyId: cell.storyId || cell.sceneId, relPath};
  if (collectA11y) result.a11y = await collectCellA11y(page, host.selectorFor(cell), destDir, relPath);
  return result;
}
```

Dentro de `captureCells`, substituir a navegação/screenshot/coleta por:

```js
const result = await captureCellOnPage(page, cell, host, baseUrl, destDir, {collectA11y});
results.push(result);
```

Exportar:

```js
module.exports = {captureCells, captureCellOnPage, cellRelPath, assertSafePathSegment};
```

- [ ] **Step 4: Incluir browser nas chaves e paths de diff**

Em `packages/web/src/parity.js`:

```js
function keyOf(c) {
  return [c.browser || 'legacy', c.brand, c.storyId || c.sceneId, c.viewport, c.theme].join('|');
}
```

Ao criar cada grupo em `groupByCell`, persistir a identidade explícita:

```js
map.set(k, {
  browser: c.browser || null,
  brand: c.brand,
  storyId: c.storyId || c.sceneId,
  story: c.storyName,
  viewport: c.viewport,
  theme: c.theme,
  label: `${c.browser ? `${c.browser} · ` : ''}${c.brand} · ${c.storyName} · ${c.viewport} · ${c.theme}`,
  _cell: c,
});
```

Adicionar browser ao label e, quando presente, ao path. Estender `computeParity` para receber
`artifactPrefix` sem mudar o default v1:

```js
function computeParity(groups, runDir, {pairs = DEFAULT_PAIRS, artifactPrefix = ''} = {}) {
  // ...loop existente...
const browser = g._cell.browser ? assertSafePathSegment(g._cell.browser, 'browser') : null;
const diffSegments = artifactPrefix ? [artifactPrefix, 'diff'] : ['diff'];
if (browser) diffSegments.push(browser);
diffSegments.push(`${against}-vs-${reference}`, `${brand}-${storyId}-${viewport}-${theme}.png`);
const diffRel = path.join(...diffSegments);
  // `writeDiff` continua lendo e escrevendo paths relativos a runDir.
  // Ao final do map, retornar `{...g, parity}`; `_cell` ainda é necessário pelo Axe/ARIA.
}
```

Em `packages/web/src/a11y.js`, parar de inferir identidade removendo o primeiro segmento. Gerar o nome a partir de `g._cell` e colocar browser no path quando existir:

```js
function computeA11y(groups, runDir, {pairs = DEFAULT_PAIRS, artifactPrefix = ''} = {}) {
  // ...loop existente...
const {_a11y, _cell: cell, ...rest} = g;
if (!_a11y) return rest;
const fileBase = [cell.brand, cell.storyId || cell.sceneId, cell.viewport, cell.theme].join('-');
const parts = artifactPrefix ? [artifactPrefix, 'aria-diff'] : ['aria-diff'];
if (cell.browser) parts.push(cell.browser);
parts.push(`${against}-vs-${reference}`, `${fileBase}.txt`);
const diffRel = path.join(...parts);
return {...rest, a11y: {audits, ariaParity}};
}
```

Preservar `_cell` na saída de `computeParity`; em `computeA11y`, removê-lo somente no objeto
final retornado depois de gerar os paths ARIA.

- [ ] **Step 5: Adicionar regressões cross-browser em parity/a11y**

Em `parity.test.js`, atualizar a expectativa antiga para que `_cell` sobreviva até `computeA11y` e adicionar:

```js
test('groupByCell nao mistura a mesma Cena entre browsers', () => {
  const base = {framework: 'wc', brand: 'gol', storyId: 'button--primary', storyName: 'Primary', viewport: 'sm', theme: 'light'};
  const groups = groupByCell([
    {...base, browser: 'chromium', relPath: 'chromium/wc.png'},
    {...base, browser: 'firefox', relPath: 'firefox/wc.png'},
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => group.browser), ['chromium', 'firefox']);
});

test('computeParity grava diff dentro do browser', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-browser-'));
  writeSolidPng(runDir, 'chromium/wc.png', 10);
  writeSolidPng(runDir, 'chromium/react.png', 240);
  const [group] = computeParity([{
    browser: 'chromium', brand: 'gol', storyId: 'button--primary', story: 'Primary', viewport: 'sm', theme: 'light',
    label: 'chromium · gol · Primary · sm · light', wc: 'chromium/wc.png', react: 'chromium/react.png',
    _cell: {browser: 'chromium', brand: 'gol', storyId: 'button--primary', viewport: 'sm', theme: 'light'},
  }], runDir);
  assert.match(group.parity[0].diffPath, /^diff\/chromium\/react-vs-wc\//);
  assert.equal(group._cell.browser, 'chromium');
});

test('computeParity isola diff no prefixo da tentativa', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-attempt-'));
  writeSolidPng(runDir, 'chromium/wc.png', 10);
  writeSolidPng(runDir, 'chromium/react.png', 240);
  const [group] = computeParity([{
    browser: 'chromium', brand: 'gol', storyId: 'primary', story: 'Primary', viewport: 'sm', theme: 'light',
    wc: 'chromium/wc.png', react: 'chromium/react.png',
    _cell: {browser: 'chromium', brand: 'gol', storyId: 'primary', viewport: 'sm', theme: 'light'},
  }], runDir, {artifactPrefix: 'results/primary--chromium/attempt-1/evidence'});
  assert.match(group.parity[0].diffPath, /^results\/primary--chromium\/attempt-1\/evidence\/diff\/chromium\//);
});
```

Em `a11y.test.js`, substituir o helper `group` por:

```js
function group(_a11y, browser) {
  const browserFields = browser ? {browser} : {};
  return {
    ...browserFields,
    label: 'gol · Primary · sm · light',
    wc: 'wc.png',
    react: 'react.png',
    parity: [],
    _a11y,
    _cell: {...browserFields, brand: 'gol', storyId: 'button--primary', viewport: 'sm', theme: 'light'},
  };
}
```

Adicionar:

```js
test('computeA11y grava diff dentro do browser e remove _cell ao finalizar', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-browser-'));
  const source = group({
    wc: entry('wc'),
    react: entry('react', {ariaSnapshot: '- button\n'}),
  }, 'webkit');
  const [result] = computeA11y([source], runDir, {artifactPrefix: 'results/primary--webkit/attempt-1/evidence'});
  assert.match(result.a11y.ariaParity[0].diffPath, /^results\/primary--webkit\/attempt-1\/evidence\/aria-diff\/webkit\/react-vs-wc\//);
  assert.equal('_cell' in result, false);
});
```

- [ ] **Step 6: Rodar as suítes focadas**

Run:

```bash
node --test packages/core/test/capture.test.js
node --test packages/web/test/parity.test.js packages/web/test/a11y.test.js
```

Expected: PASS, incluindo os testes v1 existentes sem `browser`.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/capture.js packages/core/test/capture.test.js packages/web/src/parity.js packages/web/src/a11y.js packages/web/test/parity.test.js packages/web/test/a11y.test.js
git commit -m "refactor(web): capture cells on Playwright Test pages"
```

---

### Task 8: Gerar e persistir o `run-plan.json` imutável

**Files:**
- Create: `packages/web/src/runner/runPlan.ts`
- Create: `packages/web/src/runner/builds.ts`
- Create: `packages/web/src/runner/preflight.ts`
- Test: `packages/web/test/run-plan.test.js`

**Interfaces:**
- Consumes: matriz, contrato, Cenas, fingerprint e hosts das Tasks 2–7.
- Produces:
  - `buildRunPlan(input): RunPlan`
  - `writeRunPlan(file, plan)` por rename atômico
  - `readRunPlan(file): RunPlan`
  - `prepareHarnessBuilds(repo, runDir): {wc, react, angular}`
  - `preflightRun(options): Promise<{plan, planPath}>` para a CLI.

- [ ] **Step 1: Escrever testes de expansão, filtro e imutabilidade**

Criar `packages/web/test/run-plan.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/runPlan.ts')).href);
}

const scene = {id: 'primary', name: 'Primary', component: 'tgr-button', args: {}, slots: {}};
const contractState = {status: 'current', fingerprintDigest: 'a', currentDigest: 'a', requiredBehaviors: ['activate'], coveredBehaviors: ['activate'], routes: [{id: 'activation', sceneId: 'primary', covers: ['activate']}]};

test('buildRunPlan expande ambiente/viewport e preserva browsers obrigatorios', async () => {
  const {buildRunPlan} = await subject();
  const plan = buildRunPlan({
    runId: 'run-1', runDir: '/tmp/run', repo: '/tmp/tangerina', consumer: 'tangerina',
    component: 'tgr-button', card: 'CDCOM-1', specPath: '/anemoi/behaviors.spec.ts', hostsPath: '/tmp/run/hosts.json',
  support: {schemaVersion: 1, required: ['chromium', 'firefox', 'webkit'], optional: []},
    scenes: [scene], contractState, brands: ['gol'], themes: ['light', 'dark'],
    viewports: ['sm'], viewportWidths: {sm: 360},
  });
  assert.deepEqual(plan.browsers, ['chromium', 'firefox', 'webkit']);
  assert.equal(plan.diagnostic, false);
  assert.equal(plan.collectA11y, true);
  assert.equal(plan.scenes.length, 2);
  assert.equal(new Set(plan.scenes.map(item => item.cellId)).size, 2);
});

test('filtro de browser reduz execucao mas marca plano diagnostico', async () => {
  const {buildRunPlan} = await subject();
  const plan = buildRunPlan({
    runId: 'run-1', runDir: '/tmp/run', repo: '/tmp/tangerina', consumer: 'tangerina',
    component: 'tgr-button', card: 'x', specPath: '/spec.ts', hostsPath: '/hosts.json',
    support: {schemaVersion: 1, required: ['chromium', 'firefox', 'webkit'], optional: []},
    selectedBrowsers: ['chromium'], scenes: [scene], contractState,
    brands: ['gol'], themes: ['light'], viewports: ['sm'], viewportWidths: {sm: 360},
  });
  assert.deepEqual(plan.browsers, ['chromium']);
  assert.equal(plan.diagnostic, true);
});

test('writeRunPlan grava JSON completo por rename atomico', async t => {
  const {writeRunPlan, readRunPlan} = await subject();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-plan-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'run-plan.json');
  const plan = {schemaVersion: 1, runId: 'x', scenes: []};
  writeRunPlan(file, plan);
  assert.deepEqual(readRunPlan(file), plan);
  assert.deepEqual(fs.readdirSync(dir), ['run-plan.json']);
  assert.throws(() => writeRunPlan(file, plan), /run-plan ja existe/);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test packages/web/test/run-plan.test.js`

Expected: FAIL com `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implementar expansão e persistência**

Criar `packages/web/src/runner/runPlan.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {BrowserName, RunPlan, SceneDefinition, SupportMatrix} from './types.ts';

interface BuildInput {
  runId: string; runDir: string; repo: string; consumer: string; component: string; card: string;
  specPath: string; hostsPath: string; support: SupportMatrix; selectedBrowsers?: BrowserName[]; collectA11y?: boolean;
  forceDiagnostic?: boolean;
  scenes: SceneDefinition[]; contractState: RunPlan['contract']; brands: string[]; themes: string[];
  viewports: string[]; viewportWidths: Record<string, number>;
}

function cellId(parts: string[]) {
  const slug = parts.join('--').replace(/[^a-zA-Z0-9._-]/g, '-');
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 8);
  return `${slug}--${digest}`;
}

export function buildRunPlan(input: BuildInput): RunPlan {
  const browsers = input.selectedBrowsers || input.support.required;
  if (browsers.length === 0 || new Set(browsers).size !== browsers.length) {
    throw new Error('Selecao de browsers vazia ou duplicada.');
  }
  for (const browser of browsers) {
    if (![...input.support.required, ...input.support.optional].includes(browser)) {
      throw new Error(`Browser fora da Matriz de Suporte: ${browser}.`);
    }
  }
  const scenes = input.scenes.flatMap(scene => input.brands.flatMap(brand =>
    input.themes.flatMap(theme => input.viewports.map(viewport => {
      const width = input.viewportWidths[viewport];
      if (!width) throw new Error(`Viewport desconhecido: ${viewport}.`);
      return {...scene, brand, theme, viewport, width, cellId: cellId([scene.id, brand, theme, viewport])};
    }))));
  const collectA11y = input.collectA11y !== false;
  const diagnostic = Boolean(input.forceDiagnostic)
    || !collectA11y
    || input.support.required.some(browser => !browsers.includes(browser));
  return {
    schemaVersion: 1,
    runId: input.runId,
    runDir: input.runDir,
    repo: input.repo,
    consumer: input.consumer,
    component: input.component,
    card: input.card,
    diagnostic,
    collectA11y,
    browsers,
    requiredBrowsers: input.support.required,
    frameworks: ['wc', 'react', 'angular'],
    specPath: input.specPath,
    hostsPath: input.hostsPath,
    scenes,
    contract: input.contractState,
  };
}

export function writeRunPlan(file: string, plan: RunPlan | object) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  if (fs.existsSync(file)) throw new Error(`run-plan ja existe e e imutavel: ${file}.`);
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(plan, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

export function readRunPlan(file = process.env.ANEMOI_RUN_PLAN || ''): RunPlan {
  if (!file) throw new Error('ANEMOI_RUN_PLAN nao informado.');
  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (plan.schemaVersion !== 1) throw new Error(`run-plan schemaVersion invalido: ${plan.schemaVersion}.`);
  return plan;
}
```

- [ ] **Step 4: Implementar builds dos três harnesses**

Criar `packages/web/src/runner/builds.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {makeWcHarnessHost} = require('../hosts/wc-harness');
const {makeReactHost} = require('../hosts/react');
const {makeAngularHost} = require('../hosts/angular');

export function prepareHarnessBuilds(repo: string, runDir: string) {
  const factories = {wc: makeWcHarnessHost, react: makeReactHost, angular: makeAngularHost};
  const builds: Record<string, string> = {};
  for (const [framework, factory] of Object.entries(factories)) {
    const host = factory(repo);
    const outDir = path.join(runDir, 'build', framework);
    builds[framework] = host.build(repo, outDir, {
      logPath: path.join(runDir, 'logs', `${framework}-harness-build.log`),
    }) || outDir;
  }
  fs.writeFileSync(path.join(runDir, 'builds.json'), `${JSON.stringify(builds, null, 2)}\n`);
  return builds as {wc: string; react: string; angular: string};
}
```

- [ ] **Step 5: Criar o adaptador de preflight da CLI**

Criar `packages/web/src/runner/preflight.ts`:

```ts
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {runTangerinaBuilds} = require('../tangerina');
const {assertCaptureReady} = require('../doctor');
const {VIEWPORT_WIDTHS} = require('../brands');

const RUNNER_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(RUNNER_DIR, '..', '..');

async function importTs(relativePath: string) {
  return import(pathToFileURL(path.join(RUNNER_DIR, relativePath)).href);
}

export async function preflightRun({
  repo,
  runDir,
  consumer = 'tangerina',
  component,
  card,
  brands = ['gol'],
  themes = ['light', 'dark'],
  viewports = ['sm', 'lg'],
  scenesFilter,
  selectedBrowsers,
  collectA11y = true,
  skipBuild = false,
}: any, dependencies: Record<string, any> = {}) {
  const [supportModule, contractsModule, surfaceModule, fingerprintModule, planModule, buildsModule] = await Promise.all([
    importTs('supportMatrix.ts'),
    importTs('contracts.ts'),
    importTs('publicSurface.ts'),
    importTs('fingerprint.ts'),
    importTs('runPlan.ts'),
    importTs('builds.ts'),
  ]);
  const runtime = {
    ...supportModule,
    ...contractsModule,
    ...surfaceModule,
    ...fingerprintModule,
    ...planModule,
    ...buildsModule,
    prepareConsumer(repoPath: string, options: Record<string, unknown>) {
      runTangerinaBuilds(repoPath, options);
      assertCaptureReady(repoPath);
    },
    ...dependencies,
  };

  const contractDir = dependencies.contractDir || path.join(WEB_ROOT, 'contracts', consumer, component);
  const definition = dependencies.definition || await Promise.all([
    import(pathToFileURL(path.join(contractDir, 'contract.ts')).href),
    import(pathToFileURL(path.join(contractDir, 'scenes.ts')).href),
  ]).then(([contractFile, scenesFile]) => ({contract: contractFile.contract, scenes: scenesFile.scenes}));
  const scenes = scenesFilter?.length
    ? definition.scenes.filter((scene: any) => scenesFilter.includes(scene.id) || scenesFilter.includes(scene.name))
    : definition.scenes;
  if (scenes.length === 0) throw new Error(`Nenhuma Cena corresponde ao filtro: ${(scenesFilter || []).join(', ')}.`);

  const support = dependencies.support || runtime.loadSupportMatrix(repo);

  // O fingerprint deve observar os artefatos produzidos pelo build atual, nunca dist antigo.
  runtime.prepareConsumer(repo, {
    skipBuild,
    logDir: path.join(runDir, 'logs', 'tangerina'),
  });
  const coverage = runtime.validateContract(definition.contract, definition.scenes);
  const fingerprintFile = path.join(contractDir, 'fingerprint.json');
  const reviewed = dependencies.reviewedFingerprint || runtime.readReviewedFingerprint(fingerprintFile);
  const current = dependencies.currentFingerprint || runtime.createFingerprint(runtime.readPublicSurface(repo, component));
  const contractStatus = reviewed.digest === current.digest && coverage.missing.length === 0 ? 'current' : 'stale';
  runtime.prepareHarnessBuilds(repo, runDir);

  const forceDiagnostic = scenes.length !== definition.scenes.length
    || !['gol'].every((value: string) => brands.includes(value))
    || !['light', 'dark'].every((value: string) => themes.includes(value))
    || !['sm', 'lg'].every((value: string) => viewports.includes(value));

  const plan = runtime.buildRunPlan({
    runId: path.basename(runDir),
    runDir,
    repo,
    consumer,
    component,
    card,
    specPath: path.join(contractDir, 'behaviors.spec.ts'),
    hostsPath: path.join(runDir, 'hosts.json'),
    support,
    selectedBrowsers,
    collectA11y,
    forceDiagnostic,
    scenes,
    contractState: {
      status: contractStatus,
      fingerprintDigest: reviewed.digest,
      currentDigest: current.digest,
      requiredBehaviors: coverage.required,
      coveredBehaviors: coverage.covered,
      routes: definition.contract.routes,
    },
    brands,
    themes,
    viewports,
    viewportWidths: VIEWPORT_WIDTHS,
  });
  const planPath = path.join(runDir, 'run-plan.json');
  runtime.writeRunPlan(planPath, plan);
  return {plan, planPath};
}
```

- [ ] **Step 6: Adicionar teste de integração do preflight com dependências injetadas**

Adicionar a `run-plan.test.js`:

```js
test('preflight preserva outras coletas quando o fingerprint esta stale', async t => {
  const {preflightRun} = await import(pathToFileURL(path.resolve(__dirname, '../src/runner/preflight.ts')).href);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-preflight-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const definition = {
    contract: {schemaVersion: 1, consumer: 'tangerina', component: 'tgr-button', requiredBehaviors: ['activate'], routes: [{id: 'activation', sceneId: 'primary', covers: ['activate']}]},
    scenes: [scene],
  };
  const {plan, planPath} = await preflightRun({
    repo: '/tmp/tangerina', runDir: dir, component: 'tgr-button', card: 'C-1',
    brands: ['gol'], themes: ['light'], viewports: ['sm'],
  }, {
    definition,
    contractDir: path.join(dir, 'contract'),
    reviewedFingerprint: {digest: 'reviewed'},
    currentFingerprint: {digest: 'current'},
    support: {schemaVersion: 1, required: ['chromium', 'firefox', 'webkit'], optional: []},
    prepareConsumer: () => {},
    prepareHarnessBuilds: () => fs.writeFileSync(path.join(dir, 'builds.json'), '{}'),
  });
  assert.equal(plan.contract.status, 'stale');
  assert.equal(plan.scenes.length, 1);
  assert.equal(fs.existsSync(planPath), true);
});

test('preflight marca run filtrado como diagnostico', async t => {
  const {preflightRun} = await import(pathToFileURL(path.resolve(__dirname, '../src/runner/preflight.ts')).href);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-filtered-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const secondary = {...scene, id: 'secondary', name: 'Secondary'};
  const definition = {
    contract: {schemaVersion: 1, consumer: 'tangerina', component: 'tgr-button', requiredBehaviors: ['activate'], routes: [{id: 'activation', sceneId: 'primary', covers: ['activate']}]},
    scenes: [scene, secondary],
  };
  const {plan} = await preflightRun({
    repo: '/tmp/tangerina', runDir: dir, component: 'tgr-button', card: 'C-1', scenesFilter: ['primary'],
    brands: ['gol'], themes: ['light', 'dark'], viewports: ['sm', 'lg'],
  }, {
    definition, contractDir: path.join(dir, 'contract'), reviewedFingerprint: {digest: 'same'}, currentFingerprint: {digest: 'same'},
    support: {schemaVersion: 1, required: ['chromium', 'firefox', 'webkit'], optional: []}, prepareConsumer: () => {},
    prepareHarnessBuilds: () => fs.writeFileSync(path.join(dir, 'builds.json'), '{}'),
  });
  assert.equal(plan.diagnostic, true);
});
```

- [ ] **Step 7: Rodar testes e typecheck**

Run: `node --test packages/web/test/run-plan.test.js && npm run typecheck -w packages/web`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/runner/runPlan.ts packages/web/src/runner/builds.ts packages/web/src/runner/preflight.ts packages/web/test/run-plan.test.js
git commit -m "feat(web): generate immutable browser run plan"
```

---

### Task 9: Executar Roteiros collect-all e calcular paridade comportamental

**Files:**
- Create: `packages/web/src/runner/observation.ts`
- Create: `packages/web/src/runner/behavior.ts`
- Test: `packages/web/test/behavior.test.js`

**Interfaces:**
- Consumes: `BehaviorScript`, `BehaviorObservation`, `BehaviorRouteDefinition`, `Framework`.
- Produces:
  - `assertObservation(value): BehaviorObservation`
  - `compareObservations(reference, against): {match, diff?}`
  - `executeBehaviorRoute(input): Promise<RouteResult>` com conformidade por framework e paridade separada.

- [ ] **Step 1: Escrever testes para conformidade, paridade e erro de montagem**

Criar `packages/web/test/behavior.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/behavior.ts')).href);
}

const route = {id: 'activation', sceneId: 'primary', covers: ['activate']};
const scene = {id: 'primary', cellId: 'primary-gol-light-sm', component: 'tgr-button', name: 'Primary', args: {}, slots: {}, brand: 'gol', theme: 'light', viewport: 'sm', width: 360};
const observation = count => ({focus: 'button', events: Array.from({length: count}, () => ({name: 'tgrClick', detail: {clicked: true}})), visibility: {button: true}, state: {disabled: false}});

function mountWith(values) {
  return async framework => {
    if (values[framework] instanceof Error) throw values[framework];
    return {page: {}, root: {}, listen: async () => {}, readEvents: async () => []};
  };
}

test('executeBehaviorRoute aprova conformidade e paridade exatas', async () => {
  const {executeBehaviorRoute} = await subject();
  const script = async () => ({observation: observation(1), assert: value => assert.equal(value.events.length, 1)});
  const result = await executeBehaviorRoute({route, scene, script, mount: mountWith({wc: 1, react: 1, angular: 1})});
  assert.equal(result.frameworks.wc.conformance, 'passed');
  assert.equal(result.frameworks.react.conformance, 'passed');
  assert.equal(result.parity, 'passed');
});

test('resultado inesperado mas igual falha conformidade e preserva paridade', async () => {
  const {executeBehaviorRoute} = await subject();
  const script = async () => ({observation: observation(0), assert: value => assert.equal(value.events.length, 1)});
  const result = await executeBehaviorRoute({route, scene, script, mount: mountWith({wc: 1, react: 1, angular: 1})});
  assert.deepEqual(Object.values(result.frameworks).map(value => value.conformance), ['failed', 'failed', 'failed']);
  assert.equal(result.parity, 'passed');
});

test('observacoes diferentes falham paridade com diff estruturado', async () => {
  const {executeBehaviorRoute} = await subject();
  let index = 0;
  const script = async () => {
    index += 1;
    const current = observation(index === 2 ? 0 : 1);
    return {observation: current, assert: () => {}};
  };
  const result = await executeBehaviorRoute({route, scene, script, mount: mountWith({wc: 1, react: 1, angular: 1})});
  assert.equal(result.parity, 'failed');
  assert.ok(result.diff);
});

test('erro de um framework nao impede os demais e torna paridade nao comparavel', async () => {
  const {executeBehaviorRoute} = await subject();
  const calls = [];
  const script = async context => { calls.push(context); return {observation: observation(1), assert: () => {}}; };
  const result = await executeBehaviorRoute({
    route, scene, script,
    mount: mountWith({wc: 1, react: new Error('mount react'), angular: 1}),
  });
  assert.equal(result.frameworks.react.execution, 'error');
  assert.equal(result.frameworks.react.conformance, 'not-run');
  assert.equal(result.frameworks.angular.execution, 'passed');
  assert.equal(result.parity, 'not-comparable');
  assert.equal(calls.length, 2);
});

test('envelope de observacao exige focus events visibility e state serializaveis', async () => {
  const {assertObservation} = await import(pathToFileURL(path.resolve(__dirname, '../src/runner/observation.ts')).href);
  assert.throws(() => assertObservation({events: [], visibility: {}, state: {}}), /Observacao Comportamental invalida/);
  assert.throws(() => assertObservation({focus: false, events: [], visibility: {}, state: {bad: undefined}}), /nao e serializavel/);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test packages/web/test/behavior.test.js`

Expected: FAIL com `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implementar validação e diff de observações**

Criar `packages/web/src/runner/observation.ts`:

```ts
import {isDeepStrictEqual} from 'node:util';
import type {BehaviorObservation} from './types.ts';

function assertSerializable(value: unknown, path = 'observation', seen = new Set<object>()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object') throw new Error(`${path} nao e serializavel.`);
  if (seen.has(value as object)) throw new Error(`${path} possui referencia circular.`);
  seen.add(value as object);
  if (Array.isArray(value)) value.forEach((item, index) => assertSerializable(item, `${path}[${index}]`, seen));
  else Object.entries(value as Record<string, unknown>).forEach(([key, item]) => assertSerializable(item, `${path}.${key}`, seen));
  seen.delete(value as object);
}

export function assertObservation(value: BehaviorObservation): BehaviorObservation {
  if (!value || !('focus' in value) || !Array.isArray(value.events) || !value.visibility || !('state' in value)) {
    throw new Error('Observacao Comportamental invalida: focus, events, visibility e state sao obrigatorios.');
  }
  assertSerializable(value);
  return JSON.parse(JSON.stringify(value));
}

function diff(reference: unknown, against: unknown, path = ''): Array<{path: string; reference: unknown; against: unknown}> {
  if (isDeepStrictEqual(reference, against)) return [];
  if (reference && against && typeof reference === 'object' && typeof against === 'object' && !Array.isArray(reference) && !Array.isArray(against)) {
    const referenceRecord = reference as Record<string, unknown>;
    const againstRecord = against as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(referenceRecord), ...Object.keys(againstRecord)])].sort();
    return keys.flatMap(key => diff(referenceRecord[key], againstRecord[key], path ? `${path}.${key}` : key));
  }
  return [{path, reference, against}];
}

export function compareObservations(reference: BehaviorObservation, against: BehaviorObservation) {
  const differences = diff(reference, against);
  return differences.length === 0 ? {match: true as const} : {match: false as const, diff: differences};
}
```

- [ ] **Step 4: Implementar execução collect-all/fail-late**

Criar `packages/web/src/runner/behavior.ts`:

```ts
import type {BehaviorContext, BehaviorRouteDefinition, BehaviorScript, Framework, PlannedScene, RouteResult} from './types.ts';
import {assertObservation, compareObservations} from './observation.ts';

const FRAMEWORKS: Framework[] = ['wc', 'react', 'angular'];

interface MountedContext {
  page: BehaviorContext['page'];
  root: BehaviorContext['root'];
  listen(names: string[]): Promise<void>;
  readEvents(): Promise<Array<{name: string; detail?: unknown}>>;
}

interface ExecuteInput {
  route: BehaviorRouteDefinition;
  scene: PlannedScene;
  script: BehaviorScript;
  mount(framework: Framework, scene: PlannedScene): Promise<MountedContext>;
}

export async function executeBehaviorRoute({route, scene, script, mount}: ExecuteInput): Promise<RouteResult> {
  const frameworks = {} as RouteResult['frameworks'];
  for (const framework of FRAMEWORKS) {
    try {
      const mounted = await mount(framework, scene);
      const execution = await script({...mounted, scene});
      const observation = assertObservation(execution.observation);
      try {
        await execution.assert(observation);
        frameworks[framework] = {execution: 'passed', conformance: 'passed', observation};
      } catch (error) {
        frameworks[framework] = {execution: 'passed', conformance: 'failed', observation, error: String((error as Error)?.message || error)};
      }
    } catch (error) {
      frameworks[framework] = {execution: 'error', conformance: 'not-run', error: String((error as Error)?.message || error)};
    }
  }

  if (FRAMEWORKS.some(framework => frameworks[framework].execution === 'error')) {
    return {routeId: route.id, covers: route.covers, frameworks, parity: 'not-comparable'};
  }
  const reference = frameworks.wc.observation!;
  const comparisons = ['react', 'angular'].map(framework => ({
    framework,
    ...compareObservations(reference, frameworks[framework as Framework].observation!),
  }));
  const failed = comparisons.filter(item => !item.match);
  return failed.length === 0
    ? {routeId: route.id, covers: route.covers, frameworks, parity: 'passed'}
    : {routeId: route.id, covers: route.covers, frameworks, parity: 'failed', diff: failed};
}
```

- [ ] **Step 5: Rodar testes e typecheck**

Run: `node --test packages/web/test/behavior.test.js && npm run typecheck -w packages/web`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/runner/observation.ts packages/web/src/runner/behavior.ts packages/web/test/behavior.test.js
git commit -m "feat(web): compare behavioral conformance and parity"
```

---

### Task 10: Gravar Resultados Atômicos e classificar retries

**Files:**
- Create: `packages/web/src/runner/atomicResult.ts`
- Test: `packages/web/test/atomic-result.test.js`

**Interfaces:**
- Consumes: `AtomicResult` da Task 2.
- Produces:
  - `atomicResultPath(runDir, logicalTestId, attempt)`
  - `validateAtomicResult(result): AtomicResult`
  - `writeAtomicResult(runDir, result): string`
  - `readAtomicResults(runDir): AtomicResult[]`
  - `consolidateAttempts(results): LogicalResult[]`, preservando todas as tentativas e derivando `stable | flaky`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `packages/web/test/atomic-result.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/atomicResult.ts')).href);
}

function result(overrides = {}) {
  return {
    schemaVersion: 1, logicalTestId: 'primary--chromium', attempt: 0, browser: 'chromium',
    scene: {id: 'primary', cellId: 'primary', name: 'Primary', component: 'tgr-button', args: {}, slots: {}, brand: 'gol', theme: 'light', viewport: 'sm', width: 360},
    status: 'failed', captures: [], proofs: {groups: []}, routes: [], diagnostics: {console: [], pageErrors: [], attachments: []},
    ...overrides,
  };
}

test('writeAtomicResult grava cada tentativa em path exclusivo sem tmp residual', async t => {
  const {writeAtomicResult, readAtomicResults} = await subject();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-result-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const first = writeAtomicResult(dir, result());
  const second = writeAtomicResult(dir, result({attempt: 1, status: 'passed'}));
  assert.notEqual(first, second);
  assert.deepEqual(readAtomicResults(dir).map(item => item.attempt), [0, 1]);
  assert.equal(fs.readdirSync(path.dirname(first)).some(name => name.endsWith('.tmp')), false);
  assert.throws(() => writeAtomicResult(dir, result()), /Resultado Atomico ja existe/);
});

test('consolidateAttempts classifica retry divergente como flaky', async () => {
  const {consolidateAttempts} = await subject();
  const [logical] = consolidateAttempts([result(), result({attempt: 1, status: 'passed'})]);
  assert.equal(logical.stability, 'flaky');
  assert.equal(logical.attempts.length, 2);
  assert.equal(logical.final.status, 'passed');
});

test('consolidateAttempts mantem falha repetida identica como stable', async () => {
  const {consolidateAttempts} = await subject();
  const [logical] = consolidateAttempts([result(), result({attempt: 1})]);
  assert.equal(logical.stability, 'stable');
});

test('consolidateAttempts ignora paths exclusivos de cada tentativa', async () => {
  const {consolidateAttempts} = await subject();
  const capture = relPath => ({framework: 'wc', relPath, a11y: {relPath: `${relPath}.a11y.json`, violations: []}});
  const [logical] = consolidateAttempts([
    result({captures: [capture('results/x/attempt-0/evidence/wc.png')]}),
    result({attempt: 1, captures: [capture('results/x/attempt-1/evidence/wc.png')]}),
  ]);
  assert.equal(logical.stability, 'stable');
});

test('atomicResultPath rejeita traversal', async () => {
  const {atomicResultPath} = await subject();
  assert.throws(() => atomicResultPath('/tmp/run', '../escape', 0), /logicalTestId invalido/);
});

test('validateAtomicResult rejeita schema e artifact path fora do run', async () => {
  const {validateAtomicResult} = await subject();
  assert.throws(() => validateAtomicResult(result({schemaVersion: 2})), /schemaVersion invalido/);
  assert.throws(() => validateAtomicResult(result({diagnostics: {console: [], pageErrors: [], attachments: ['../trace.zip']}})), /artifact path invalido/);
  assert.throws(() => validateAtomicResult(result({captures: [{relPath: '/tmp/outside.png'}]})), /artifact path invalido/);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test packages/web/test/atomic-result.test.js`

Expected: FAIL com `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implementar escrita e consolidação**

Criar `packages/web/src/runner/atomicResult.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import type {AtomicResult, Stability} from './types.ts';

function safeId(value: string) {
  if (!value || value === '.' || value === '..' || /[\\/\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`logicalTestId invalido: ${JSON.stringify(value)}.`);
  }
  return value;
}

export function atomicResultPath(runDir: string, logicalTestId: string, attempt: number) {
  if (!Number.isInteger(attempt) || attempt < 0) throw new Error(`attempt invalido: ${attempt}.`);
  return path.join(runDir, 'results', safeId(logicalTestId), `attempt-${attempt}`, 'result.json');
}

function validateArtifactPaths(value: unknown) {
  if (Array.isArray(value)) return value.forEach(validateArtifactPaths);
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if ((key.toLowerCase().endsWith('path') || key === 'attachments') && typeof item === 'string') {
      if (path.isAbsolute(item) || path.normalize(item).startsWith('..')) throw new Error(`artifact path invalido: ${item}.`);
    } else if (key === 'attachments' && Array.isArray(item)) {
      for (const attachment of item) {
        if (typeof attachment !== 'string' || path.isAbsolute(attachment) || path.normalize(attachment).startsWith('..')) {
          throw new Error(`artifact path invalido: ${String(attachment)}.`);
        }
      }
    } else {
      validateArtifactPaths(item);
    }
  }
}

export function validateAtomicResult(result: AtomicResult): AtomicResult {
  if (result.schemaVersion !== 1) throw new Error(`Resultado Atomico schemaVersion invalido: ${result.schemaVersion}.`);
  safeId(result.logicalTestId);
  if (!Number.isInteger(result.attempt) || result.attempt < 0) throw new Error(`attempt invalido: ${result.attempt}.`);
  validateArtifactPaths(result);
  return result;
}

export function writeAtomicResult(runDir: string, result: AtomicResult) {
  validateAtomicResult(result);
  const file = atomicResultPath(runDir, result.logicalTestId, result.attempt);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  if (fs.existsSync(file)) throw new Error(`Resultado Atomico ja existe e e imutavel: ${file}.`);
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(result, null, 2)}\n`);
  fs.renameSync(temporary, file);
  return file;
}

export function readAtomicResults(runDir: string): AtomicResult[] {
  const root = path.join(runDir, 'results');
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  for (const logical of fs.readdirSync(root)) {
    const logicalDir = path.join(root, logical);
    for (const attempt of fs.readdirSync(logicalDir)) {
      const file = path.join(logicalDir, attempt, 'result.json');
      if (fs.existsSync(file)) files.push(file);
    }
  }
  return files.map(file => validateAtomicResult(JSON.parse(fs.readFileSync(file, 'utf8')))).sort((a, b) =>
    a.logicalTestId.localeCompare(b.logicalTestId) || a.attempt - b.attempt);
}

function withoutPaths(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPaths);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !key.toLowerCase().endsWith('path'))
      .map(([key, item]) => [key, withoutPaths(item)]));
  }
  return value;
}

function signature(result: AtomicResult) {
  return JSON.stringify(withoutPaths({status: result.status, captures: result.captures, proofs: result.proofs, routes: result.routes}));
}

export function consolidateAttempts(results: AtomicResult[]) {
  const groups = new Map<string, AtomicResult[]>();
  for (const result of results) groups.set(result.logicalTestId, [...(groups.get(result.logicalTestId) || []), result]);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([logicalTestId, attempts]) => {
    attempts.sort((a, b) => a.attempt - b.attempt);
    const stability: Stability = new Set(attempts.map(signature)).size === 1 ? 'stable' : 'flaky';
    return {logicalTestId, stability, attempts, final: attempts.at(-1)!};
  });
}
```

- [ ] **Step 4: Rodar testes e typecheck**

Run: `node --test packages/web/test/atomic-result.test.js && npm run typecheck -w packages/web`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/runner/atomicResult.ts packages/web/test/atomic-result.test.js
git commit -m "feat(web): persist atomic retry evidence"
```

---

### Task 11: Ligar Playwright projects, servidores, fixture Anemoi e spec nativo

**Files:**
- Create: `packages/web/playwright.config.ts`
- Create: `packages/web/src/runner/globalSetup.ts`
- Create: `packages/web/src/runner/fixtures.ts`
- Create: `packages/web/contracts/tangerina/tgr-button/behaviors.spec.ts`
- Test: `packages/web/test/playwright-config.test.js`

**Interfaces:**
- Consumes: run plan, hosts, `captureCellOnPage`, `executeBehaviorRoute`, `writeAtomicResult`.
- Produces: fixture `test` com `{anemoi.runScene(...)}`; um teste por Cena materializada e project por browser.

- [ ] **Step 1: Escrever teste estrutural da configuração**

Criar `packages/web/test/playwright-config.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('config deriva projects e testMatch do run plan', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../playwright.config.ts'), 'utf8');
  assert.match(source, /plan\.browsers\.map/);
  assert.match(source, /browserName/);
  assert.match(source, /trace: 'off'/);
  assert.match(source, /timeout: 120000/);
  assert.match(source, /globalSetup/);
  assert.match(source, /plan\.specPath/);
  const fixture = fs.readFileSync(path.resolve(__dirname, '../src/runner/fixtures.ts'), 'utf8');
  assert.match(fixture, /tentativa interrompida antes da publicacao do Resultado Atomico/);
  assert.match(fixture, /artifactPrefix/);
});
```

Run: `node --test packages/web/test/playwright-config.test.js`

Expected: FAIL porque `playwright.config.ts` não existe.

- [ ] **Step 2: Implementar o global setup com teardown**

Criar `packages/web/src/runner/globalSetup.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {readRunPlan} from './runPlan.ts';
const require = createRequire(import.meta.url);
const {serveStatic} = require('@gol-smiles/anemoi-core');

export default async function globalSetup() {
  const plan = readRunPlan();
  const builds = JSON.parse(fs.readFileSync(path.join(plan.runDir, 'builds.json'), 'utf8'));
  const servers: Array<{close(): Promise<void>}> = [];
  const hosts: Record<string, {url: string}> = {};
  for (const framework of plan.frameworks) {
    const server = await serveStatic(builds[framework]);
    servers.push(server);
    hosts[framework] = {url: server.url};
  }
  fs.writeFileSync(plan.hostsPath, `${JSON.stringify(hosts, null, 2)}\n`);
  return async () => {
    await Promise.all(servers.map(server => server.close()));
  };
}
```

Na Task 8, fazer `prepareHarnessBuilds` gravar também `<runDir>/builds.json` antes de retornar.

- [ ] **Step 3: Implementar a configuração Playwright dinâmica**

Criar `packages/web/playwright.config.ts`:

```ts
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from '@playwright/test';
import {readRunPlan} from './src/runner/runPlan.ts';

const plan = readRunPlan();
const WEB_ROOT = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: path.dirname(plan.specPath),
  testMatch: path.basename(plan.specPath),
  outputDir: path.join(plan.runDir, 'playwright'),
  timeout: 120000,
  expect: {timeout: 10000},
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['line']],
  globalSetup: path.join(WEB_ROOT, 'src/runner/globalSetup.ts'),
  use: {
    deviceScaleFactor: 2,
    trace: 'off',
    screenshot: 'off',
  },
  projects: plan.browsers.map(browserName => ({name: browserName, use: {browserName}})),
});
```

- [ ] **Step 4: Implementar a fixture `anemoi`**

Criar `packages/web/src/runner/fixtures.ts` com:

```ts
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {test as base, expect} from '@playwright/test';
import {readRunPlan} from './runPlan.ts';
import {executeBehaviorRoute} from './behavior.ts';
import {atomicResultPath, writeAtomicResult} from './atomicResult.ts';
import type {AtomicResult, BehaviorScripts, ContractDefinition, Framework, PlannedScene} from './types.ts';
const require = createRequire(import.meta.url);
const {captureCellOnPage} = require('@gol-smiles/anemoi-core');
const {groupByCell, computeParity} = require('../parity');
const {computeA11y, hasA11yDivergence} = require('../a11y');
const {makeWcHarnessHost} = require('../hosts/wc-harness');
const {makeReactHost} = require('../hosts/react');
const {makeAngularHost} = require('../hosts/angular');

const factories: Record<Framework, (repo: string) => any> = {
  wc: makeWcHarnessHost,
  react: makeReactHost,
  angular: makeAngularHost,
};

interface RunSceneInput {
  contract: ContractDefinition;
  scene: PlannedScene;
  scripts: BehaviorScripts;
}

interface AnemoiFixture {
  runScene(input: RunSceneInput): Promise<void>;
}

interface ActiveAttempt {
  browser: AtomicResult['browser'];
  logicalTestId: string;
  scene: PlannedScene;
  captures: AtomicResult['captures'];
  groups: AtomicResult['proofs']['groups'];
  routes: AtomicResult['routes'];
  attachments: string[];
}

function prefixCapturePaths(capture: any, evidenceRoot: string, runDir: string) {
  const prefix = (value: string) => path.relative(runDir, path.join(evidenceRoot, value));
  return {
    ...capture,
    relPath: prefix(capture.relPath),
    ...(capture.a11y ? {a11y: {
      ...capture.a11y,
      ...(capture.a11y.relPath ? {relPath: prefix(capture.a11y.relPath)} : {}),
      ...(capture.a11y.ariaRelPath ? {ariaRelPath: prefix(capture.a11y.ariaRelPath)} : {}),
    }} : {}),
  };
}

export const test = base.extend<{anemoi: AnemoiFixture}>({
  anemoi: async ({page, context}, use, testInfo) => {
    const plan = readRunPlan();
    const hosts = JSON.parse(fs.readFileSync(plan.hostsPath, 'utf8'));
    const consoleMessages: string[] = [];
    const pageErrors: string[] = [];
    const state: {active: ActiveAttempt | null; resultWritten: boolean} = {active: null, resultWritten: false};
    let tracing = testInfo.retry > 0;
    if (tracing) await context.tracing.start({screenshots: true, snapshots: true, sources: true});
    page.on('console', message => consoleMessages.push(`${message.type()}: ${message.text()}`));
    page.on('pageerror', error => pageErrors.push(error.message));

    try {
      await use({
      async runScene({contract, scene, scripts}) {
        const browser = testInfo.project.name as AtomicResult['browser'];
        const logicalTestId = `${scene.cellId}--${browser}`;
        const resultFile = atomicResultPath(plan.runDir, logicalTestId, testInfo.retry);
        const attemptDir = path.dirname(resultFile);
        const evidenceRoot = path.join(attemptDir, 'evidence');
        const attachmentRoot = path.join(attemptDir, 'attachments');
        fs.mkdirSync(attachmentRoot, {recursive: true});
        const captures: AtomicResult['captures'] = [];
        state.active = {browser, logicalTestId, scene, captures, groups: [], routes: [], attachments: []};
        state.resultWritten = false;
        for (const framework of plan.frameworks) {
          const host = factories[framework](plan.repo);
          try {
            const capture = await captureCellOnPage(page, {
              ...scene, browser, framework, storyId: scene.id, storyName: scene.name,
            }, host, hosts[framework].url, evidenceRoot, {collectA11y: plan.collectA11y});
            captures.push(prefixCapturePaths(capture, evidenceRoot, plan.runDir));
          } catch (error) {
            captures.push({framework, browser, error: String((error as Error)?.message || error)});
          }
        }

        const mount = async (framework: Framework, current: PlannedScene) => {
          const host = factories[framework](plan.repo);
          await page.setViewportSize({width: current.width, height: 900});
          await page.goto(host.urlFor(current, hosts[framework].url), {waitUntil: 'networkidle', timeout: 30000});
          await host.verify(page, current);
          const root = page.locator(host.selectorFor(current));
          return {
            page,
            root,
            async listen(names: string[]) {
              await root.evaluate((element, eventNames) => {
                const target = element as HTMLElement & {__anemoiEvents?: unknown[]};
                target.__anemoiEvents = [];
                for (const name of eventNames) target.addEventListener(name, event => {
                  const custom = event as CustomEvent;
                  const serialized = custom.detail === undefined
                    ? undefined
                    : JSON.stringify(custom.detail, (_key, value) => value instanceof Event ? undefined : value);
                  const detail = serialized === undefined ? undefined : JSON.parse(serialized);
                  target.__anemoiEvents!.push(detail === undefined ? {name} : {name, detail});
                });
              }, names);
            },
            async readEvents() {
              return root.evaluate(element => (element as HTMLElement & {__anemoiEvents?: Array<{name: string; detail?: unknown}>}).__anemoiEvents || []) as
                Promise<Array<{name: string; detail?: unknown}>>;
            },
          };
        };

        const routes: AtomicResult['routes'] = [];
        if (plan.contract.status === 'current') {
          for (const route of contract.routes.filter(item => item.sceneId === scene.id)) {
            const script = scripts[route.id];
            if (!script) throw new Error(`Roteiro sem script: ${route.id}.`);
            routes.push(await executeBehaviorRoute({route, scene, script, mount}));
          }
        }
        state.active!.routes = routes;
        const validCaptures = captures.filter(capture => !('error' in capture));
        const artifactPrefix = path.relative(plan.runDir, evidenceRoot);
        const parityGroups = computeParity(groupByCell(validCaptures), plan.runDir, {artifactPrefix});
        const groups: any[] = computeA11y(parityGroups, plan.runDir, {artifactPrefix});
        state.active!.groups = groups;
        const visualFailed = groups.flatMap((group: any) => group.parity || [])
          .some((parity: any) => parity.mismatch > 0 || parity.sizeMatch === false);
        const failed = captures.some(capture => 'error' in capture)
          || visualFailed
          || hasA11yDivergence(groups)
          || routes.some(route => route.parity !== 'passed' || Object.values(route.frameworks).some((value: any) => value.conformance !== 'passed'));
        const attachments: string[] = [];
        state.active!.attachments = attachments;
        if (failed) {
          const screenshot = path.join(attachmentRoot, 'failure.png');
          await page.screenshot({path: screenshot, fullPage: true});
          attachments.push(path.relative(plan.runDir, screenshot));
        }
        if (tracing) {
          const trace = path.join(attachmentRoot, 'trace.zip');
          await context.tracing.stop({path: trace});
          tracing = false;
          attachments.push(path.relative(plan.runDir, trace));
        }
        const result: AtomicResult = {
          schemaVersion: 1,
          logicalTestId,
          attempt: testInfo.retry,
          browser,
          scene,
          status: failed ? 'failed' : 'passed',
          captures,
          proofs: {groups},
          routes,
          diagnostics: {console: consoleMessages, pageErrors, attachments},
        };
        const resultPath = writeAtomicResult(plan.runDir, result);
        state.resultWritten = true;
        await testInfo.attach('anemoi-result', {path: resultPath, contentType: 'application/json'});
        expect(result.status, JSON.stringify({logicalTestId, routes}, null, 2)).toBe('passed');
      },
      });
    } finally {
      // Timeout, exceção inesperada ou fixture interrompida também deve deixar uma
      // tentativa explícita. Sem isto, retry que passa esconderia a primeira falha.
      const active = state.active;
      if (active && !state.resultWritten) {
        const resultFile = atomicResultPath(plan.runDir, active.logicalTestId, testInfo.retry);
        const attachmentRoot = path.join(path.dirname(resultFile), 'attachments');
        fs.mkdirSync(attachmentRoot, {recursive: true});
        try {
          if (!page.isClosed()) {
            const screenshot = path.join(attachmentRoot, 'failure.png');
            await page.screenshot({path: screenshot, fullPage: true});
            active.attachments.push(path.relative(plan.runDir, screenshot));
          }
        } catch (error) {
          pageErrors.push(`screenshot: ${String((error as Error)?.message || error)}`);
        }
        if (tracing) {
          try {
            const trace = path.join(attachmentRoot, 'trace.zip');
            await context.tracing.stop({path: trace});
            active.attachments.push(path.relative(plan.runDir, trace));
          } catch (error) {
            pageErrors.push(`trace: ${String((error as Error)?.message || error)}`);
          }
          tracing = false;
        }
        const reason = testInfo.error?.message || 'tentativa interrompida antes da publicacao do Resultado Atomico';
        const emergency: AtomicResult = {
          schemaVersion: 1,
          logicalTestId: active.logicalTestId,
          attempt: testInfo.retry,
          browser: active.browser,
          scene: active.scene,
          status: 'error',
          captures: active.captures,
          proofs: {groups: active.groups},
          routes: active.routes,
          diagnostics: {console: consoleMessages, pageErrors: [...pageErrors, `execution: ${reason}`], attachments: active.attachments},
        };
        const emergencyPath = writeAtomicResult(plan.runDir, emergency);
        state.resultWritten = true;
        await testInfo.attach('anemoi-result', {path: emergencyPath, contentType: 'application/json'});
      }
      if (tracing) await context.tracing.stop();
    }
  },
});

export {expect};
```

- [ ] **Step 5: Implementar o spec nativo do `tgr-button`**

Criar `packages/web/contracts/tangerina/tgr-button/behaviors.spec.ts` começando por:

```ts
import {test, expect} from '../../../src/runner/fixtures.ts';
import {readRunPlan} from '../../../src/runner/runPlan.ts';
import type {BehaviorScripts} from '../../../src/runner/types.ts';
import {contract} from './contract.ts';
import {scenes} from './scenes.ts';

function clicked(detail: unknown) {
  return Boolean((detail as {clicked?: boolean} | undefined)?.clicked);
}
```

Em seguida, definir `scripts` com as seis chaves exatas abaixo:

```ts
const scripts: BehaviorScripts = {
  activation: async ({root, listen, readEvents}) => {
    await listen(['tgrClick']);
    const button = root.getByRole('button', {name: 'Salvar'});
    await button.click();
    const events = (await readEvents()).map(event => ({name: event.name, detail: {clicked: clicked(event.detail)}}));
    const observation = {focus: await button.evaluate(element => (element.getRootNode() as ShadowRoot).activeElement === element), events, visibility: {button: await button.isVisible()}, state: {disabled: await button.isDisabled()}};
    return {observation, assert: value => {
      expect(value.events).toEqual([{name: 'tgrClick', detail: {clicked: true}}]);
      expect(value.visibility.button).toBe(true);
    }};
  },
  disabled: async ({root, listen, readEvents}) => {
    await listen(['tgrClick']);
    const button = root.getByRole('button', {name: 'Salvar'});
    await button.evaluate((element: HTMLButtonElement) => element.click());
    const observation = {focus: false, events: await readEvents(), visibility: {button: await button.isVisible()}, state: {disabled: await button.isDisabled()}};
    return {observation, assert: value => { expect(value.state.disabled).toBe(true); expect(value.events).toEqual([]); }};
  },
  loading: async ({root, page, listen, readEvents}) => {
    await listen(['tgrClick']);
    const button = root.getByRole('button', {name: 'Salvando'});
    await button.focus();
    await page.keyboard.press('Enter');
    const observation = {focus: await button.evaluate(element => (element.getRootNode() as ShadowRoot).activeElement === element), events: await readEvents(), visibility: {button: await button.isVisible()}, state: {ariaBusy: await button.getAttribute('aria-busy'), disabled: await button.isDisabled()}};
    return {observation, assert: value => { expect(value.focus).toBe(true); expect(value.events).toEqual([]); expect(value.state).toEqual({ariaBusy: 'true', disabled: false}); }};
  },
  submit: async ({root, listen, readEvents}) => {
    await listen(['tgrClick', 'submit']);
    await root.getByRole('button', {name: 'Enviar'}).click();
    const button = root.getByRole('button', {name: 'Enviar'});
    const events = (await readEvents()).map(event => event.name === 'tgrClick' ? {name: event.name, detail: {clicked: clicked(event.detail)}} : {name: event.name});
    const observation = {focus: await button.evaluate(element => (element.getRootNode() as ShadowRoot).activeElement === element), events, visibility: {button: await button.isVisible()}, state: {submitted: events.some(event => event.name === 'submit')}};
    return {observation, assert: value => expect(value.state.submitted).toBe(true)};
  },
  reset: async ({root, listen, readEvents}) => {
    await listen(['tgrClick', 'reset']);
    await root.getByRole('button', {name: 'Limpar'}).click();
    const button = root.getByRole('button', {name: 'Limpar'});
    const events = (await readEvents()).map(event => event.name === 'tgrClick' ? {name: event.name, detail: {clicked: clicked(event.detail)}} : {name: event.name});
    const observation = {focus: await button.evaluate(element => (element.getRootNode() as ShadowRoot).activeElement === element), events, visibility: {button: await button.isVisible()}, state: {reset: events.some(event => event.name === 'reset')}};
    return {observation, assert: value => expect(value.state.reset).toBe(true)};
  },
  'slotted-label': async ({root}) => {
    const button = root.getByRole('button', {name: 'Continuar'});
    const observation = {focus: false, events: [], visibility: {button: await button.isVisible()}, state: {matchedAccessibleName: true}};
    return {observation, assert: value => { expect(value.visibility.button).toBe(true); expect(value.state.matchedAccessibleName).toBe(true); }};
  },
};
```

Final do arquivo:

```ts
const plan = readRunPlan();
const sceneById = new Map(scenes.map(scene => [scene.id, scene]));
for (const planned of plan.scenes) {
  test(planned.cellId, async ({anemoi}) => {
    if (!sceneById.has(planned.id)) throw new Error(`Cena nao declarada: ${planned.id}.`);
    await anemoi.runScene({contract, scene: planned, scripts});
  });
}
```

- [ ] **Step 6: Rodar teste estrutural e typecheck**

Run:

```bash
npm run typecheck -w packages/web
node --test packages/web/test/playwright-config.test.js
```

Expected: typecheck e teste estrutural PASS. A execução browser end-to-end entra na Contraprova Controlada da Task 15.

- [ ] **Step 7: Commit**

```bash
git add packages/web/playwright.config.ts packages/web/src/runner/globalSetup.ts packages/web/src/runner/fixtures.ts packages/web/contracts/tangerina/tgr-button/behaviors.spec.ts packages/web/test/playwright-config.test.js
git commit -m "feat(web): execute component scenes with Playwright Test"
```

---

### Task 12: Consolidar vereditos e publicar `manifest.json` v2

**Files:**
- Create: `packages/web/src/runner/verdict.ts`
- Create: `packages/web/src/runner/finalize.ts`
- Modify: `packages/core/src/manifest.js`
- Modify: `packages/core/test/manifest.test.js`
- Modify: `packages/core/src/output.js`
- Modify: `packages/core/test/output.test.js`
- Modify: `packages/web/src/provenance.js`
- Modify: `packages/web/test/provenance.test.js`
- Test: `packages/web/test/verdict.test.js`
- Test: `packages/web/test/finalize.test.js`

**Interfaces:**
- Consumes: run plan e Resultados Atômicos que já contêm os vereditos visuais/a11y calculados dentro da tentativa.
- Produces:
  - `buildConfidenceGate(input): ConfidenceGate`
  - `finalizeRun(planPath): ManifestV2`
  - `buildManifestV2(input)` no core, preservando `buildManifest` e `buildFailureManifest` v1.

- [ ] **Step 1: Escrever tabela de gate que falha**

Criar `packages/web/test/verdict.test.js` com casos explícitos:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/verdict.ts')).href);
}

const passed = {status: 'passed', required: true, unavailable: 0, failed: 0};

test('gate aprova somente com todas as dimensoes obrigatorias estaveis', async () => {
  const {buildConfidenceGate} = await subject();
  const gate = buildConfidenceGate({diagnostic: false, dimensions: {
    browserCoverage: passed, visualParity: passed, dimensions: passed, axe: passed, ariaParity: passed,
    behavioralConformance: passed, behavioralParity: passed, contractCoverage: passed, stability: passed,
  }});
  assert.equal(gate.status, 'passed');
  assert.equal(gate.trusted, true);
});

test('indisponivel, failed, flaky ou matriz diagnostica nunca aprovam gate confiavel', async () => {
  const {buildConfidenceGate} = await subject();
  for (const dimension of [
    {...passed, status: 'failed', failed: 1},
    {...passed, status: 'unavailable', unavailable: 1},
  ]) {
    const gate = buildConfidenceGate({diagnostic: false, dimensions: {...baseDimensions(), stability: dimension}});
    assert.equal(gate.status, 'failed');
  }
  const diagnostic = buildConfidenceGate({diagnostic: true, dimensions: baseDimensions()});
  assert.equal(diagnostic.trusted, false);
  assert.equal(diagnostic.status, 'not-approved');
});

function baseDimensions() {
  return {
    browserCoverage: passed, visualParity: passed, dimensions: passed, axe: passed, ariaParity: passed,
    behavioralConformance: passed, behavioralParity: passed, contractCoverage: passed, stability: passed,
  };
}
```

- [ ] **Step 2: Implementar `verdict.ts`**

```ts
export interface DimensionVerdict {
  status: 'passed' | 'failed' | 'unavailable';
  required: boolean;
  failed: number;
  unavailable: number;
}

export function buildConfidenceGate({diagnostic, dimensions}: {diagnostic: boolean; dimensions: Record<string, DimensionVerdict>}) {
  const blocked = Object.values(dimensions).some(value => value.required && value.status !== 'passed');
  return {
    status: diagnostic ? 'not-approved' : blocked ? 'failed' : 'passed',
    trusted: !diagnostic && !blocked,
    dimensions,
  } as const;
}
```

- [ ] **Step 3: Adicionar o produtor v2 no core**

Em `packages/core/src/manifest.js`, adicionar sem alterar os produtores v1:

```js
function buildManifestV2({tool, status, card, component, mode, axes, cellCount, groups, provenance, a11y, behavior, gate, attempts, runDir, now = new Date()}) {
  requireFields({tool, status, card, component, mode, runDir, gate});
  return {
    schemaVersion: 2,
    tool,
    status,
    card,
    component,
    mode,
    layout: 'confidence',
    parityLabel: 'Paridade vs wc no mesmo browser',
    axes,
    cellCount,
    groups,
    provenance,
    a11y,
    behavior,
    gate,
    attempts,
    generatedAt: now.toISOString(),
    runDir,
  };
}

function manifestSchemaVersion(manifest) {
  return manifest && manifest.schemaVersion === 2 ? 2 : 1;
}

module.exports = {buildManifest, buildManifestV2, buildFailureManifest, manifestSchemaVersion};
```

Adicionar ao `manifest.test.js`:

```js
test('buildManifestV2 publica schema explicito e leitor trata manifesto sem versao como v1', () => {
  const {buildManifestV2, manifestSchemaVersion} = require('../src/manifest');
  const manifest = buildManifestV2({
    tool: 'Anemoi Web', status: 'passed', card: 'C-1', component: 'tgr-button', mode: 'current',
    axes: {}, cellCount: 0, groups: [], behavior: {}, gate: {status: 'passed'}, attempts: [], runDir: '/tmp/run', now: NOW,
  });
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifestSchemaVersion(manifest), 2);
  assert.equal(manifestSchemaVersion(buildManifest({tool: 'Anemoi Web', card: 'C-1', component: 'tgr-button', mode: 'current', runDir: '/tmp/run', now: NOW})), 1);
});
```

No mesmo step, tornar `writeManifest` de `packages/core/src/output.js` atômico para v1 e v2,
sem mudar assinatura nem path público:

```js
function writeManifest(runDir, manifest) {
  const manifestPath = path.join(runDir, 'manifest.json');
  const temporary = `${manifestPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n');
  fs.renameSync(temporary, manifestPath);
  return manifestPath;
}
```

Em `packages/core/test/output.test.js`, acrescentar uma regressão que chama `writeManifest`,
relê o JSON e confirma que o runDir não contém arquivo terminado em `.tmp`.

- [ ] **Step 4: Escrever o teste do finalizador**

Criar `packages/web/test/finalize.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function modules() {
  return Promise.all([
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/runPlan.ts')).href),
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/atomicResult.ts')).href),
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/finalize.ts')).href),
  ]);
}

function fixture() {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-finalize-'));
  const scene = {id: 'primary', cellId: 'primary-gol-light-sm', name: 'Primary', component: 'tgr-button', args: {}, slots: {}, brand: 'gol', theme: 'light', viewport: 'sm', width: 360};
  const plan = {
    schemaVersion: 1, runId: 'run', runDir, repo: '/repo', consumer: 'tangerina', component: 'tgr-button', card: 'C-1', diagnostic: false, collectA11y: true,
    browsers: ['chromium'], requiredBrowsers: ['chromium'], frameworks: ['wc', 'react', 'angular'], specPath: '/spec.ts', hostsPath: path.join(runDir, 'hosts.json'), scenes: [scene],
    contract: {status: 'current', fingerprintDigest: 'a', currentDigest: 'a', requiredBehaviors: ['activate'], coveredBehaviors: ['activate'], routes: [{id: 'activation', sceneId: 'primary', covers: ['activate']}]},
  };
  return {runDir, scene, plan, planPath: path.join(runDir, 'run-plan.json')};
}

function result(scene, overrides = {}) {
  const frameworkResult = {execution: 'passed', conformance: 'passed', observation: {focus: true, events: [{name: 'tgrClick'}], visibility: {button: true}, state: {}}};
  const group = {browser: 'chromium', label: 'Primary', wc: 'wc.png', react: 'react.png', angular: 'angular.png', parity: [{against: 'react', mismatch: 0, sizeMatch: true}, {against: 'angular', mismatch: 0, sizeMatch: true}], a11y: {audits: {wc: {violations: []}, react: {violations: []}, angular: {violations: []}}, ariaParity: [{against: 'react', match: true}, {against: 'angular', match: true}]}};
  return {
    schemaVersion: 1, logicalTestId: `${scene.cellId}--chromium`, attempt: 0, browser: 'chromium', scene, status: 'passed',
    captures: ['wc', 'react', 'angular'].map(framework => ({framework, browser: 'chromium', brand: 'gol', storyId: 'primary', storyName: 'Primary', viewport: 'sm', theme: 'light', relPath: `${framework}.png`, a11y: {violations: [], ariaSnapshot: 'button'}})),
    proofs: {groups: [group]},
    routes: [{routeId: 'activation', covers: ['activate'], frameworks: {wc: frameworkResult, react: frameworkResult, angular: frameworkResult}, parity: 'passed'}],
    diagnostics: {console: [], pageErrors: [], attachments: []},
    ...overrides,
  };
}

function dependencies(runDir) {
  return {
    summarizeA11y: () => ({totalViolations: 0, ariaMismatches: 0}),
    buildManifestV2: input => ({schemaVersion: 2, ...input}),
    writeManifest: (_dir, manifest) => fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest)),
  };
}

test('finalizeRun rejeita matriz incompleta', async t => {
  const [{writeRunPlan}, , {finalizeRun}] = await modules();
  const value = fixture();
  t.after(() => fs.rmSync(value.runDir, {recursive: true, force: true}));
  writeRunPlan(value.planPath, value.plan);
  assert.throws(() => finalizeRun(value.planPath, dependencies(value.runDir)), /Resultado Atomico ausente/);
});

test('finalizeRun publica v2 aprovado quando todas as provas estao presentes', async t => {
  const [{writeRunPlan}, {writeAtomicResult}, {finalizeRun}] = await modules();
  const value = fixture();
  t.after(() => fs.rmSync(value.runDir, {recursive: true, force: true}));
  writeRunPlan(value.planPath, value.plan);
  writeAtomicResult(value.runDir, result(value.scene));
  const manifest = finalizeRun(value.planPath, dependencies(value.runDir));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.gate.status, 'passed');
  assert.equal(manifest.behavior.results.length, 1);
});

test('finalizeRun preserva retries e reprova stability flaky', async t => {
  const [{writeRunPlan}, {writeAtomicResult}, {finalizeRun}] = await modules();
  const value = fixture();
  t.after(() => fs.rmSync(value.runDir, {recursive: true, force: true}));
  writeRunPlan(value.planPath, value.plan);
  writeAtomicResult(value.runDir, result(value.scene, {status: 'failed'}));
  writeAtomicResult(value.runDir, result(value.scene, {attempt: 1, status: 'passed', diagnostics: {console: [], pageErrors: [], attachments: ['results/primary/attempt-1/attachments/trace.zip']}}));
  const manifest = finalizeRun(value.planPath, dependencies(value.runDir));
  assert.equal(manifest.gate.dimensions.stability.status, 'failed');
  assert.equal(manifest.attempts[0].attempts.length, 2);
  assert.match(manifest.attempts[0].attempts[1].resultPath, /attempt-1\/result\.json$/);
  assert.deepEqual(manifest.attempts[0].attempts[1].attachments, ['results/primary/attempt-1/attachments/trace.zip']);
});

test('finalizeRun marca Roteiro ausente como evidencia indisponivel', async t => {
  const [{writeRunPlan}, {writeAtomicResult}, {finalizeRun}] = await modules();
  const value = fixture();
  t.after(() => fs.rmSync(value.runDir, {recursive: true, force: true}));
  writeRunPlan(value.planPath, value.plan);
  writeAtomicResult(value.runDir, result(value.scene, {routes: []}));
  const manifest = finalizeRun(value.planPath, dependencies(value.runDir));
  assert.equal(manifest.gate.dimensions.behavioralConformance.status, 'unavailable');
  assert.equal(manifest.gate.dimensions.behavioralParity.status, 'unavailable');
});

test('finalizeRun nao aprova provas visuais ou a11y estruturalmente ausentes', async t => {
  const [{writeRunPlan}, {writeAtomicResult}, {finalizeRun}] = await modules();
  const value = fixture();
  t.after(() => fs.rmSync(value.runDir, {recursive: true, force: true}));
  writeRunPlan(value.planPath, value.plan);
  writeAtomicResult(value.runDir, result(value.scene, {proofs: {groups: []}}));
  const manifest = finalizeRun(value.planPath, dependencies(value.runDir));
  assert.equal(manifest.gate.dimensions.visualParity.status, 'unavailable');
  assert.equal(manifest.gate.dimensions.axe.status, 'unavailable');
  assert.equal(manifest.gate.status, 'failed');
});

test('finalizeRun trata tentativa inicial ausente como estabilidade indisponivel', async t => {
  const [{writeRunPlan}, {writeAtomicResult}, {finalizeRun}] = await modules();
  const value = fixture();
  t.after(() => fs.rmSync(value.runDir, {recursive: true, force: true}));
  writeRunPlan(value.planPath, value.plan);
  writeAtomicResult(value.runDir, result(value.scene, {attempt: 1}));
  const manifest = finalizeRun(value.planPath, dependencies(value.runDir));
  assert.equal(manifest.gate.dimensions.stability.status, 'unavailable');
});
```

- [ ] **Step 5: Registrar proveniência do runner e das três engines**

Em `packages/web/src/provenance.js`, substituir `playwrightVersion` por:

```js
function playwrightVersion() {
  for (const packageName of ['@playwright/test/package.json', 'playwright/package.json']) {
    try {
      return require(packageName).version;
    } catch {}
  }
  return null;
}
```

Alterar a assinatura para receber `browsers` sem mudar o default de `anemoiDir` existente:

```js
function collectProvenance({repo, browsers = ['chromium'], anemoiDir = path.resolve(__dirname, '..')})
```

Produzir no retorno:

```js
environment: {
  os: `${process.platform} ${os.release()}`,
  node: process.version,
  browser: browsers.length === 1 ? browsers[0] : null,
  browsers,
  runner: '@playwright/test',
  playwright: playwrightVersion(),
}
```

Adicionar a `provenance.test.js`:

```js
test('collectProvenance registra Playwright Test e todas as engines do run', () => {
  const provenance = collectProvenance({repo: os.tmpdir(), browsers: ['chromium', 'firefox', 'webkit']});
  assert.equal(provenance.environment.runner, '@playwright/test');
  assert.equal(provenance.environment.browser, null);
  assert.deepEqual(provenance.environment.browsers, ['chromium', 'firefox', 'webkit']);
  assert.match(provenance.environment.playwright, /^1\.61\./);
});
```

- [ ] **Step 6: Implementar o finalizador**

Criar `packages/web/src/runner/finalize.ts`. Algoritmo obrigatório, sem estado global:

```ts
import path from 'node:path';
import {createRequire} from 'node:module';
import {readRunPlan} from './runPlan.ts';
import {atomicResultPath, readAtomicResults, consolidateAttempts} from './atomicResult.ts';
import {buildConfidenceGate} from './verdict.ts';
const require = createRequire(import.meta.url);
const {buildManifestV2, writeManifest} = require('@gol-smiles/anemoi-core');
const {summarizeA11y} = require('../a11y');
const {collectProvenance} = require('../provenance');

interface FinalizeDependencies {
  summarizeA11y: typeof summarizeA11y;
  buildManifestV2: typeof buildManifestV2;
  writeManifest: typeof writeManifest;
}

export function finalizeRun(planPath: string, overrides: Partial<FinalizeDependencies> = {}) {
  const dependencies: FinalizeDependencies = {summarizeA11y, buildManifestV2, writeManifest, ...overrides};
  const plan = readRunPlan(planPath);
  const logical = consolidateAttempts(readAtomicResults(plan.runDir));
  const expected = new Set(plan.scenes.flatMap(scene => plan.browsers.map(browser => `${scene.cellId}--${browser}`)));
  const actual = new Set(logical.map(result => result.logicalTestId));
  const missing = [...expected].filter(id => !actual.has(id));
  const unexpected = [...actual].filter(id => !expected.has(id));
  if (missing.length || unexpected.length) {
    throw new Error(`Matriz de Resultados Atomicos invalida. Resultado Atomico ausente: ${missing.join(', ') || '(nenhum)'}. Inesperado: ${unexpected.join(', ') || '(nenhum)'}.`);
  }

  const allCaptures = logical.flatMap(result => result.final.captures) as any[];
  const captureErrors = allCaptures.filter(capture => 'error' in capture);
  const captures = allCaptures.filter(capture => !('error' in capture));
  const groups = logical.flatMap(result => result.final.proofs.groups) as any[];
  const proofUnavailable = logical.filter(result => result.final.proofs.groups.length !== 1).length;
  const parityEntries = groups.flatMap(group => group.parity || []) as any[];
  const parityUnavailable = Math.max(0, logical.length * 2 - parityEntries.length) + proofUnavailable;
  const routeResults = logical.flatMap(result => result.final.routes);
  const missingRoutes = logical.flatMap(result => {
    const expectedRoutes = plan.contract.routes.filter(route => route.sceneId === result.final.scene.id).map(route => route.id);
    const actualRoutes = new Set(result.final.routes.map(route => route.routeId));
    return expectedRoutes.filter(routeId => !actualRoutes.has(routeId)).map(routeId => `${result.logicalTestId}:${routeId}`);
  });
  const conformanceUnavailable = routeResults.filter(route => Object.values(route.frameworks).some(value => value.execution === 'error')).length;
  const conformanceFailed = routeResults.filter(route => Object.values(route.frameworks).some(value => value.conformance === 'failed')).length;
  const behaviorParityUnavailable = routeResults.filter(route => route.parity === 'not-comparable').length;
  const behaviorParityFailed = routeResults.filter(route => route.parity === 'failed').length;
  const audits = groups.flatMap(group => Object.values(group.a11y?.audits || {})) as any[];
  const ariaEntries = groups.flatMap(group => group.a11y?.ariaParity || []) as any[];
  const expectedAudits = plan.collectA11y ? logical.length * plan.frameworks.length : 0;
  const expectedAriaPairs = plan.collectA11y ? logical.length * 2 : 0;
  const a11yUnavailable = audits.filter(audit => audit.error).length + Math.max(0, expectedAudits - audits.length);
  const ariaUnavailable = Math.max(0, expectedAriaPairs - ariaEntries.length);
  const axeFailed = audits.filter(audit => (audit.violations || []).length > 0).length;
  const interruptedAttempts = logical.filter(result => result.final.status === 'error').length;
  const attemptGaps = logical.filter(result => result.attempts.some((attempt, index) => attempt.attempt !== index)).length;
  const uncoveredBehaviors = plan.contract.requiredBehaviors.filter(id => !plan.contract.coveredBehaviors.includes(id));
  const dimensions = {
    browserCoverage: verdict(missing.length, 0),
    visualParity: verdict(captureErrors.length + parityUnavailable, parityEntries.filter(item => item.mismatch > 0).length),
    dimensions: verdict(captureErrors.length + parityUnavailable, parityEntries.filter(item => item.sizeMatch === false).length),
    axe: verdict(captureErrors.length + a11yUnavailable + (plan.collectA11y ? 0 : 1), axeFailed),
    ariaParity: verdict(captureErrors.length + a11yUnavailable + ariaUnavailable + (plan.collectA11y ? 0 : 1), ariaEntries.filter(item => item.match === false).length),
    behavioralConformance: verdict((plan.contract.status === 'stale' ? 1 : 0) + conformanceUnavailable + missingRoutes.length, conformanceFailed),
    behavioralParity: verdict((plan.contract.status === 'stale' ? 1 : 0) + behaviorParityUnavailable + missingRoutes.length, behaviorParityFailed),
    contractCoverage: verdict((plan.contract.status === 'stale' ? 1 : 0) + missingRoutes.length, uncoveredBehaviors.length),
    stability: verdict(interruptedAttempts + attemptGaps, logical.filter(result => result.stability === 'flaky').length),
  };
  const gate = buildConfidenceGate({diagnostic: plan.diagnostic, dimensions});
  const manifest = dependencies.buildManifestV2({
    tool: 'Anemoi Web', status: gate.status === 'passed' ? 'passed' : 'failed', card: plan.card,
    component: plan.component, mode: 'current', axes: {browsers: plan.browsers, frameworks: plan.frameworks},
    cellCount: captures.length, groups, a11y: dependencies.summarizeA11y(groups),
    provenance: collectProvenance({repo: plan.repo, browsers: plan.browsers}),
    behavior: {contract: plan.contract, results: logical.map(result => ({logicalTestId: result.logicalTestId, stability: result.stability, routes: result.final.routes}))},
    gate, attempts: logical.map(result => ({
      logicalTestId: result.logicalTestId,
      stability: result.stability,
      attempts: result.attempts.map(item => ({
        attempt: item.attempt,
        status: item.status,
        resultPath: path.relative(plan.runDir, atomicResultPath(plan.runDir, item.logicalTestId, item.attempt)),
        attachments: item.diagnostics.attachments,
      })),
    })),
    runDir: plan.runDir,
  });
  dependencies.writeManifest(plan.runDir, manifest);
  return manifest;
}

function verdict(unavailable: number, failed: number) {
  return {status: unavailable ? 'unavailable' : failed ? 'failed' : 'passed', required: true, unavailable, failed};
}
```

Depois, acrescentar `writeSummary` e `renderHtml` somente na Task 13, para que esta task permaneça focada no contrato de dados.

- [ ] **Step 7: Rodar testes**

Run:

```bash
node --test packages/core/test/manifest.test.js
node --test packages/core/test/output.test.js
node --test packages/web/test/verdict.test.js packages/web/test/finalize.test.js packages/web/test/provenance.test.js
npm run typecheck -w packages/web
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/runner/verdict.ts packages/web/src/runner/finalize.ts packages/core/src/manifest.js packages/core/test/manifest.test.js packages/core/src/output.js packages/core/test/output.test.js packages/web/src/provenance.js packages/web/test/provenance.test.js packages/web/test/verdict.test.js packages/web/test/finalize.test.js
git commit -m "feat(web): finalize multidimensional confidence manifest"
```

---

### Task 13: Publicar summary e galeria offline do schema v2

**Files:**
- Create: `packages/web/src/runner/outputV2.ts`
- Modify: `packages/web/src/runner/finalize.ts`
- Test: `packages/web/test/output-v2.test.js`

**Interfaces:**
- Consumes: `ManifestV2` retornado pelo finalizador.
- Produces:
  - `renderSummaryV2(manifest): string`
  - `renderHtmlV2(manifest): string`
  - arquivos públicos `summary.md` e `index.html` no runDir.

- [ ] **Step 1: Escrever testes da saída offline**

Criar `packages/web/test/output-v2.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/outputV2.ts')).href);
}

const manifest = {
  schemaVersion: 2, tool: 'Anemoi Web', status: 'failed', card: 'CDCOM-1', component: 'tgr-button',
  generatedAt: '2026-07-18T12:00:00.000Z', cellCount: 9,
  axes: {browsers: ['chromium', 'firefox', 'webkit'], frameworks: ['wc', 'react', 'angular']},
  gate: {status: 'failed', trusted: false, dimensions: {
    visualParity: {status: 'passed', required: true, failed: 0, unavailable: 0},
    behavioralParity: {status: 'failed', required: true, failed: 1, unavailable: 0},
  }},
  groups: [{browser: 'firefox', label: 'firefox · gol · Primary · sm · light', wc: 'firefox/wc/a.png', react: 'firefox/react/a.png', angular: 'firefox/angular/a.png', parity: []}],
  behavior: {results: [{logicalTestId: 'primary--firefox', stability: 'stable', routes: [{routeId: 'activation', parity: 'failed', frameworks: {wc: {conformance: 'passed'}, react: {conformance: 'passed'}, angular: {conformance: 'passed'}}}]}]},
  attempts: [{logicalTestId: 'primary--firefox', stability: 'flaky', attempts: [
    {attempt: 0, status: 'failed', resultPath: 'results/primary--firefox/attempt-0/result.json', attachments: ['results/primary--firefox/attempt-0/attachments/failure.png']},
    {attempt: 1, status: 'passed', resultPath: 'results/primary--firefox/attempt-1/result.json', attachments: ['results/primary--firefox/attempt-1/attachments/trace.zip']},
  ]}],
};

test('summary v2 lista browsers e dimensoes independentes', async () => {
  const {renderSummaryV2} = await subject();
  const summary = renderSummaryV2(manifest);
  assert.match(summary, /Chromium, Firefox, WebKit/);
  assert.match(summary, /behavioralParity: failed/);
  assert.match(summary, /Gate confiavel: não/);
});

test('galeria v2 e autocontida e mostra browser, comportamento e estabilidade', async () => {
  const {renderHtmlV2} = await subject();
  const html = renderHtmlV2(manifest);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /firefox/);
  assert.match(html, /activation/);
  assert.match(html, /stable/);
  assert.match(html, /trace\.zip/);
  assert.match(html, /attempt-1\/result\.json/);
  assert.doesNotMatch(html, /https?:\/\/(?!127\.0\.0\.1)/);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test packages/web/test/output-v2.test.js`

Expected: FAIL com `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implementar o summary e a galeria v2**

Criar `packages/web/src/runner/outputV2.ts`:

```ts
function escape(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]!));
}

function titleCase(value: string) {
  return value[0].toUpperCase() + value.slice(1);
}

export function renderSummaryV2(manifest: any) {
  const dimensions = Object.entries(manifest.gate.dimensions).map(([name, value]: [string, any]) =>
    `- ${name}: ${value.status} (falhas: ${value.failed}, indisponíveis: ${value.unavailable})`);
  const flaky = (manifest.attempts || []).filter((item: any) => item.stability === 'flaky').length;
  return [
    `# ${manifest.tool} - ${manifest.component}`,
    '',
    `- Card: ${manifest.card}`,
    `- Status: ${manifest.status}`,
    `- Gate confiável: ${manifest.gate.trusted ? 'sim' : 'não'}`,
    `- Browsers: ${manifest.axes.browsers.map(titleCase).join(', ')}`,
    `- Células capturadas: ${manifest.cellCount}`,
    `- Resultados flaky: ${flaky}`,
    '',
    '## Dimensões de confiança',
    '',
    ...dimensions,
    '',
    '## Artefatos',
    '',
    '- Manifest: manifest.json',
    '- Galeria: index.html',
    '',
  ].join('\n');
}

export function renderHtmlV2(manifest: any) {
  const dimensionRows = Object.entries(manifest.gate.dimensions).map(([name, value]: [string, any]) =>
    `<tr><td>${escape(name)}</td><td class="${escape(value.status)}">${escape(value.status)}</td><td>${value.failed}</td><td>${value.unavailable}</td></tr>`).join('');
  const visualRows = manifest.groups.map((group: any) => `<tr data-browser="${escape(group.browser || group._cell?.browser)}">
    <td>${escape(group.browser || group._cell?.browser)}</td><td>${escape(group.label)}</td>
    ${['wc', 'react', 'angular'].map(framework => `<td>${group[framework] ? `<img src="${escape(group[framework])}" alt="${framework}" />` : 'indisponível'}</td>`).join('')}
  </tr>`).join('');
  const behaviorRows = (manifest.behavior?.results || []).flatMap((result: any) =>
    result.routes.map((route: any) => `<tr><td>${escape(result.logicalTestId)}</td><td>${escape(result.stability)}</td><td>${escape(route.routeId)}</td><td>${escape(route.parity)}</td></tr>`)).join('');
  const attemptRows = (manifest.attempts || []).flatMap((logical: any) => logical.attempts.map((attempt: any) =>
    `<tr><td>${escape(logical.logicalTestId)}</td><td>${attempt.attempt}</td><td>${escape(attempt.status)}</td><td><a href="${escape(attempt.resultPath)}">result.json</a></td><td>${(attempt.attachments || []).map((item: string) => `<a href="${escape(item)}">${escape(item.split('/').at(-1))}</a>`).join(' ') || '—'}</td></tr>`)).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escape(manifest.component)} — confiança</title>
  <style>body{font:14px system-ui;margin:24px;background:#f6f7f9;color:#1d2433}table{border-collapse:collapse;width:100%;background:white;margin:16px 0}th,td{border:1px solid #d8dce3;padding:8px;text-align:left}img{max-width:240px}.passed{color:#167044}.failed,.unavailable{color:#b42318}.chips button{margin-right:8px}</style></head><body>
  <h1>${escape(manifest.component)}</h1><p>Gate: <strong>${escape(manifest.gate.status)}</strong> · confiável: ${manifest.gate.trusted ? 'sim' : 'não'}</p>
  <h2>Dimensões</h2><table><thead><tr><th>Dimensão</th><th>Status</th><th>Falhas</th><th>Indisponíveis</th></tr></thead><tbody>${dimensionRows}</tbody></table>
  <h2>Evidência visual por browser</h2><div class="chips">${manifest.axes.browsers.map((browser: string) => `<button data-filter="${escape(browser)}">${escape(browser)}</button>`).join('')}<button data-filter="all">todos</button></div>
  <table><thead><tr><th>Browser</th><th>Cena</th><th>WC</th><th>React</th><th>Angular</th></tr></thead><tbody id="visual">${visualRows}</tbody></table>
  <h2>Comportamento</h2><table><thead><tr><th>Teste</th><th>Estabilidade</th><th>Roteiro</th><th>Paridade</th></tr></thead><tbody>${behaviorRows}</tbody></table>
  <h2>Tentativas e diagnósticos</h2><table><thead><tr><th>Teste</th><th>Tentativa</th><th>Status</th><th>Resultado</th><th>Attachments</th></tr></thead><tbody>${attemptRows}</tbody></table>
  <script>document.querySelector('.chips').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;document.querySelectorAll('#visual tr').forEach(row=>row.hidden=button.dataset.filter!=='all'&&row.dataset.browser!==button.dataset.filter);});</script>
  </body></html>`;
}
```

- [ ] **Step 4: Publicar o manifesto por último como marcador de bundle completo**

Em `finalizeRun`, renderizar tudo em memória, gravar summary e galeria por rename atômico e
chamar `writeManifest` somente por último. Substituir a chamada final direta a
`dependencies.writeManifest` por:

```ts
import fs from 'node:fs';
import {renderHtmlV2, renderSummaryV2} from './outputV2.ts';

function writeTextAtomic(file: string, content: string) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

const summary = renderSummaryV2(manifest);
const html = renderHtmlV2(manifest);
writeTextAtomic(path.join(plan.runDir, 'summary.md'), summary);
writeTextAtomic(path.join(plan.runDir, 'index.html'), html);
dependencies.writeManifest(plan.runDir, manifest);
```

Adicionar a `finalize.test.js` assertions de que `summary.md`, `index.html` e `manifest.json`
existem após sucesso e que nenhum arquivo `.tmp` ficou no runDir.

- [ ] **Step 5: Rodar testes e typecheck**

Run: `node --test packages/web/test/output-v2.test.js packages/web/test/finalize.test.js && npm run typecheck -w packages/web`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/runner/outputV2.ts packages/web/src/runner/finalize.ts packages/web/test/output-v2.test.js packages/web/test/finalize.test.js
git commit -m "feat(web): publish offline confidence gallery"
```

---

### Task 14: Integrar o executor novo à CLI e ao doctor

**Files:**
- Rename: `packages/web/src/run.js` → `packages/web/src/run-legacy.js`
- Create: `packages/web/src/run.js`
- Create: `packages/web/src/runner/invoke.ts`
- Create: `packages/web/src/runner/reviewContract.ts`
- Modify: `packages/web/src/doctor.js`
- Modify: `packages/web/src/index.js`
- Modify: `packages/web/bin/anemoi-web.js`
- Test: `packages/web/test/invoke.test.js`
- Test: `packages/web/test/review-contract.test.js`
- Test: `packages/web/test/run-playwright.test.js`
- Modify: `packages/web/test/doctor.test.js`

**Interfaces:**
- Consumes: `preflightRun`, Playwright config e `finalizeRun`.
- Produces: opção temporária `--engine playwright-test|legacy`; comando `--review-contract`; doctor dos três browsers; exit `0/1/2` preservado.

- [ ] **Step 1: Mover o executor atual sem alterá-lo**

```bash
git mv packages/web/src/run.js packages/web/src/run-legacy.js
```

Atualizar imports internos de testes temporariamente para `run-legacy`. Não modificar sua lógica nesta etapa.

- [ ] **Step 2: Escrever testes do child process assíncrono**

Criar `packages/web/test/invoke.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

test('invokePlaywright passa o run plan e devolve exit do runner sem bloquear servidores', async () => {
  const {invokePlaywright} = await import(pathToFileURL(path.resolve(__dirname, '../src/runner/invoke.ts')).href);
  let captured;
  const spawn = (command, args, options) => {
    captured = {command, args, options};
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    queueMicrotask(() => child.emit('close', 1, null));
    return child;
  };
  const result = await invokePlaywright({planPath: '/tmp/run/run-plan.json', logPath: '/tmp/run/playwright.log', spawn, writeFile: () => {}});
  assert.equal(captured.command, process.execPath);
  assert.equal(captured.options.env.ANEMOI_RUN_PLAN, '/tmp/run/run-plan.json');
  assert.equal(result.exitCode, 1);
});
```

- [ ] **Step 3: Implementar `invokePlaywright`**

Criar `packages/web/src/runner/invoke.ts`:

```ts
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url);
const RUNNER_DIR = path.dirname(fileURLToPath(import.meta.url));

export function invokePlaywright({planPath, logPath, spawn = childProcess.spawn, writeFile = fs.writeFileSync}: any) {
  return new Promise<{exitCode: number; signal: NodeJS.Signals | null}>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const cli = require.resolve('@playwright/test/cli');
    const child = spawn(process.execPath, [cli, 'test', '--config', path.resolve(RUNNER_DIR, '../../playwright.config.ts')], {
      cwd: path.resolve(RUNNER_DIR, '../..'),
      env: {...process.env, ANEMOI_RUN_PLAN: planPath},
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
      process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
      fs.mkdirSync(path.dirname(logPath), {recursive: true});
      writeFile(logPath, Buffer.concat(chunks));
      resolve({exitCode: exitCode ?? 2, signal});
    });
  });
}
```

- [ ] **Step 4: Implementar revisão explícita de contrato**

O branch `--review-contract` da CLI deve primeiro executar `prepareCapture` com um runDir de
`contract-review`, como mostrado no Step 6. Assim o diff usa CEM e declarações de wrappers do
build atual; a confirmação continua sendo a única operação que grava o fingerprint no Anemoi.

Criar `packages/web/src/runner/reviewContract.ts`:

```ts
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import readline from 'node:readline/promises';
const RUNNER_DIR = path.dirname(fileURLToPath(import.meta.url));

export async function askConfirmation(prompt: string) {
  const input = readline.createInterface({input: process.stdin, output: process.stdout});
  try {
    return input.question(prompt);
  } finally {
    input.close();
  }
}

export function formatDiff(diff: any) {
  if (diff.kind === 'added') return `+ ${diff.path}: ${JSON.stringify(diff.value ?? diff.after)}`;
  if (diff.kind === 'removed') return `- ${diff.path}: ${JSON.stringify(diff.value ?? diff.before)}`;
  return `~ ${diff.path}: ${JSON.stringify(diff.before)} -> ${JSON.stringify(diff.after)}`;
}

export async function reviewContract({repo, consumer = 'tangerina', component, confirm = askConfirmation, write = console.log}: any, overrides: Record<string, any> = {}) {
  const [surfaceModule, fingerprintModule] = await Promise.all([
    import(pathToFileURL(path.join(RUNNER_DIR, 'publicSurface.ts')).href),
    import(pathToFileURL(path.join(RUNNER_DIR, 'fingerprint.ts')).href),
  ]);
  const runtime = {...surfaceModule, ...fingerprintModule, ...overrides};
  const file = path.resolve(RUNNER_DIR, '..', '..', 'contracts', consumer, component, 'fingerprint.json');
  const reviewed = runtime.readReviewedFingerprint(file);
  const current = runtime.createFingerprint(runtime.readPublicSurface(repo, component));
  const diffs = runtime.diffFingerprints(reviewed, current);
  for (const diff of diffs) write(formatDiff(diff));
  if (diffs.length === 0) return {updated: false, diffs};
  const answer = String(await confirm('Atualizar fingerprint revisado? [y/N] ')).trim().toLowerCase();
  if (!['y', 'yes'].includes(answer)) return {updated: false, diffs};
  runtime.writeReviewedFingerprint(file, current);
  return {updated: true, diffs};
}
```

Criar `packages/web/test/review-contract.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

test('reviewContract nao grava sem confirmacao explicita', async () => {
  const {reviewContract} = await import(pathToFileURL(path.resolve(__dirname, '../src/runner/reviewContract.ts')).href);
  let writes = 0;
  const result = await reviewContract({repo: '/repo', component: 'tgr-button', confirm: async () => 'n', write: () => {}}, {
    readReviewedFingerprint: () => ({digest: 'old'}),
    readPublicSurface: () => ({}),
    createFingerprint: () => ({digest: 'new'}),
    diffFingerprints: () => [{path: 'wc.events', kind: 'added', value: 'tgrClick'}],
    writeReviewedFingerprint: () => { writes += 1; },
  });
  assert.equal(result.updated, false);
  assert.equal(writes, 0);
});

test('reviewContract grava somente depois de yes', async () => {
  const {reviewContract} = await import(pathToFileURL(path.resolve(__dirname, '../src/runner/reviewContract.ts')).href);
  let writes = 0;
  const result = await reviewContract({repo: '/repo', component: 'tgr-button', confirm: async () => 'yes', write: () => {}}, {
    readReviewedFingerprint: () => ({digest: 'old'}), readPublicSurface: () => ({}),
    createFingerprint: () => ({digest: 'new'}), diffFingerprints: () => [{path: 'wc.events', kind: 'added', value: 'tgrClick'}],
    writeReviewedFingerprint: () => { writes += 1; },
  });
  assert.equal(result.updated, true);
  assert.equal(writes, 1);
});
```

- [ ] **Step 5: Escrever teste da nova orquestração**

Criar `packages/web/test/run-playwright.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {runPlaywrightState} = require('../src/run');

function baseArgs() {
  return {repo: '/repo', component: 'tgr-button', card: 'C-1'};
}

test('executor novo sempre finaliza depois de exit 1 dos specs e usa o gate como exit final', async () => {
  const calls = [];
  const manifest = await runPlaywrightState(baseArgs(), '/cwd', {
    createRunDir: () => '/tmp/run',
    preflight: async () => ({planPath: '/tmp/run/run-plan.json'}),
    invoke: async () => ({exitCode: 1}),
    finalize: async () => { calls.push('finalize'); return {gate: {status: 'failed'}, status: 'failed'}; },
    setExitCode: value => calls.push(`exit:${value}`),
  });
  assert.equal(manifest.status, 'failed');
  assert.deepEqual(calls, ['finalize', 'exit:1']);
});

test('exit 2 do Playwright e erro de infraestrutura e nao publica aprovacao', async () => {
  await assert.rejects(() => runPlaywrightState(baseArgs(), '/cwd', {
    createRunDir: () => '/tmp/run', preflight: async () => ({planPath: '/tmp/plan'}),
    invoke: async () => ({exitCode: 2}), finalize: async () => { throw new Error('nao deveria finalizar'); },
  }), /Playwright Test falhou com exit 2/);
});

test('run diagnostico termina sem mentir que o gate foi aprovado', async () => {
  const exits = [];
  const manifest = await runPlaywrightState({...baseArgs(), browsers: 'chromium'}, '/cwd', {
    createRunDir: () => '/tmp/run', preflight: async () => ({planPath: '/tmp/plan'}), invoke: async () => ({exitCode: 0}),
    finalize: async () => ({gate: {status: 'not-approved', trusted: false}, status: 'failed'}), setExitCode: value => exits.push(value),
  });
  assert.equal(manifest.gate.trusted, false);
  assert.deepEqual(exits, [0]);
});
```

- [ ] **Step 6: Criar o orquestrador temporário**

Criar `packages/web/src/run.js`:

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const legacy = require('./run-legacy');
const {runDoctor} = require('./doctor');
const {writeFailureManifest} = require('./failure');

function list(value, fallback) {
  return value ? String(value).split(',').map(item => item.trim()).filter(Boolean) : fallback;
}

async function defaultFinalize(planPath) {
  const {finalizeRun} = await import('./runner/finalize.ts');
  return finalizeRun(planPath);
}

async function defaultPreflight(options) {
  const {preflightRun} = await import('./runner/preflight.ts');
  return preflightRun(options);
}

async function defaultInvoke(options) {
  const {invokePlaywright} = await import('./runner/invoke.ts');
  return invokePlaywright(options);
}

async function defaultReview(options) {
  const {reviewContract} = await import('./runner/reviewContract.ts');
  return reviewContract(options);
}

async function runPlaywrightState(args, cwd, overrides = {}) {
  if (!args.component) throw new Error('informe --component <nome> (ex.: tgr-button).');
  if (args['before-after']) throw new Error('before/after ainda nao implementado. Use o modo estado-atual.');
  const a11y = legacy.resolveA11yFlags(args);
  const repo = args.repo || cwd;
  const component = args.component;
  const card = args.card || 'sem-card';
  const createRunDir = overrides.createRunDir || legacy.createRunDir;
  const preflight = overrides.preflight || defaultPreflight;
  const invoke = overrides.invoke || defaultInvoke;
  const finalize = overrides.finalize || defaultFinalize;
  const setExitCode = overrides.setExitCode || (value => { process.exitCode = value; });
  const writeFailure = overrides.writeFailure || writeFailureManifest;
  const runDir = createRunDir(repo, card, component);
  fs.mkdirSync(runDir, {recursive: true});
  let stage = 'preflight';
  try {
    const {plan, planPath} = await preflight({
      repo, runDir, consumer: 'tangerina', component, card,
      brands: list(args.brands, ['gol']),
      themes: list(args.themes, ['light', 'dark']),
      viewports: list(args.viewports, ['sm', 'lg']),
      scenesFilter: list(args.stories, undefined),
      selectedBrowsers: list(args.browsers, undefined),
      collectA11y: a11y.collectA11y,
      skipBuild: Boolean(args['skip-build']),
    });
    if (args['list-stories']) {
      for (const scene of plan.scenes.filter((value, index, all) => all.findIndex(item => item.id === value.id) === index)) {
        console.log(`  - ${scene.name} (${scene.id})`);
      }
      return {plan};
    }
    stage = 'playwright-test';
    const execution = await invoke({planPath, logPath: path.join(runDir, 'logs', 'playwright-test.log')});
    if (![0, 1].includes(execution.exitCode)) throw new Error(`Playwright Test falhou com exit ${execution.exitCode}.`);
    stage = 'finalize';
    const manifest = await finalize(planPath);
    setExitCode(manifest.gate.status === 'failed' ? 1 : 0);
    return manifest;
  } catch (error) {
    try {
      writeFailure(runDir, {stage, card, component}, error);
    } catch {}
    throw error;
  }
}

async function runCurrentState(args, cwd) {
  if (args.doctor) return runDoctor(args.repo || cwd);
  if (args['review-contract']) {
    if (!args.component) throw new Error('--review-contract exige --component.');
    const repo = args.repo || cwd;
    const reviewRunDir = legacy.createRunDir(repo, 'contract-review', args.component);
    legacy.prepareCapture(repo, {logDir: path.join(reviewRunDir, 'logs', 'tangerina')});
    return defaultReview({repo, consumer: 'tangerina', component: args.component});
  }
  if (args.engine === 'playwright-test') return runPlaywrightState(args, cwd);
  if (args.engine && args.engine !== 'legacy') throw new Error(`Engine desconhecida: ${args.engine}.`);
  return legacy.runCurrentState(args, cwd);
}

module.exports = {
  ...legacy,
  runCurrentState,
  runPlaywrightState,
};
```

- [ ] **Step 7: Atualizar doctor para os três browsers**

Em `doctor.js`, importar os browser types e adicionar:

```js
const {chromium, firefox, webkit} = require('@playwright/test');

function playwrightBrowserChecks({
  browserTypes = {chromium, firefox, webkit},
  exists = fs.existsSync,
} = {}) {
  return Object.entries(browserTypes).map(([name, browserType]) => ({
    id: `playwright-${name}`,
    label: `Browser ${name} do Playwright instalado`,
    ok: exists(browserType.executablePath()),
    detail: exists(browserType.executablePath())
      ? browserType.executablePath()
      : 'rode `npx playwright install chromium firefox webkit` no motor',
  }));
}
```

Trocar o check singular por `checks.push(...browserChecks())`, injetando `browserChecks = playwrightBrowserChecks` em `collectChecks`. Exportar `playwrightBrowserChecks`.

Remover o check `storybook`: o executor canônico não depende mais de Storybook. No lugar,
adicionar checks fail-closed para `packages/components/browser-support.json` e
`packages/components/custom-elements.json`. Atualizar a mensagem de `assertCaptureReady` de
“antes de Storybook/captura” para “antes da captura Web”.

Adicionar ao teste existente:

```js
test('doctor verifica Chromium Firefox e WebKit separadamente', () => {
  const {playwrightBrowserChecks} = require('../src/doctor');
  const fake = name => ({executablePath: () => `/browsers/${name}`});
  const checks = playwrightBrowserChecks({
    browserTypes: {chromium: fake('chromium'), firefox: fake('firefox'), webkit: fake('webkit')},
    exists: value => !value.endsWith('/webkit'),
  });
  assert.deepEqual(checks.map(check => [check.id, check.ok]), [
    ['playwright-chromium', true],
    ['playwright-firefox', true],
    ['playwright-webkit', false],
  ]);
});

test('doctor exige contratos publicados e nao exige Storybook', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.resolve(__dirname, '../src/doctor.js'), 'utf8');
  assert.doesNotMatch(source, /id: 'storybook'/);
  assert.match(source, /browser-support\.json/);
  assert.match(source, /custom-elements\.json/);
});
```

Atualizar também as expectativas existentes de IDs em `doctor.test.js`: remover `storybook`
e exigir os novos IDs `browser-support` e `custom-elements-manifest`. Nos helpers unitários,
injetar `browserChecks: () => []` ou checks falsos explícitos; nenhum teste unitário pode
depender dos browsers instalados na máquina.

- [ ] **Step 8: Atualizar bin e barrel**

No bin, documentar `0 = gate aprovado ou run diagnóstico concluído`, `1 = Gate de Confiabilidade reprovado`, `2 = erro de execução`. No barrel, manter exports anteriores e acrescentar `runPlaywrightState` sem exportar módulos internos de contrato.

- [ ] **Step 9: Rodar suítes focadas**

Run:

```bash
node --test packages/web/test/invoke.test.js packages/web/test/review-contract.test.js packages/web/test/run-playwright.test.js packages/web/test/doctor.test.js packages/web/test/run-*.test.js
npm run typecheck -w packages/web
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/web/src/run.js packages/web/src/run-legacy.js packages/web/src/runner/invoke.ts packages/web/src/runner/reviewContract.ts packages/web/src/doctor.js packages/web/src/index.js packages/web/bin/anemoi-web.js packages/web/test/invoke.test.js packages/web/test/review-contract.test.js packages/web/test/run-playwright.test.js packages/web/test/doctor.test.js packages/web/test/run-*.test.js
git commit -m "feat(web): expose Playwright Test confidence runner"
```

---

### Task 15: Provar a Contraprova Controlada end-to-end

**Files:**
- Create: `packages/web/test/fixtures/controlled-counterproof/wc/index.html`
- Create: `packages/web/test/fixtures/controlled-counterproof/react/index.html`
- Create: `packages/web/test/fixtures/controlled-counterproof/angular/index.html`
- Create: `packages/web/test/browser/controlled-counterproof.spec.ts`
- Create: `packages/web/test/controlled-counterproof.test.js`

**Interfaces:**
- Consumes: fixture, Playwright config, Resultado Atômico e finalizador reais.
- Produces: prova automatizada de que um wrapper que perde `tgrClick` reprova `behavioralParity` e o gate sem tocar no Tangerina.

- [ ] **Step 1: Criar páginas sintéticas equivalentes, exceto React**

Usar este HTML em WC e Angular:

```html
<!doctype html><html lang="pt-BR"><body><div id="evidence-root"><tgr-button></tgr-button></div><script>
customElements.define('tgr-button', class extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({mode: 'open'});
    const button = document.createElement('button');
    button.textContent = 'Salvar';
    button.addEventListener('click', event => this.dispatchEvent(new CustomEvent('tgrClick', {bubbles: true, composed: true, detail: {clicked: true, originalEvent: event}})));
    root.appendChild(button);
  }
});
</script></body></html>
```

Usar este HTML em React, a falha controlada:

```html
<!doctype html><html lang="pt-BR"><body><div id="evidence-root"><tgr-button></tgr-button></div><script>
customElements.define('tgr-button', class extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({mode: 'open'});
    const button = document.createElement('button');
    button.textContent = 'Salvar';
    root.appendChild(button);
  }
});
</script></body></html>
```

- [ ] **Step 2: Criar o spec da contraprova**

Criar `packages/web/test/browser/controlled-counterproof.spec.ts`:

```ts
import {test, expect} from '../../src/runner/fixtures.ts';
import {readRunPlan} from '../../src/runner/runPlan.ts';
import type {BehaviorScripts, ContractDefinition} from '../../src/runner/types.ts';

const contract: ContractDefinition = {
  schemaVersion: 1,
  consumer: 'fixture',
  component: 'tgr-button',
  requiredBehaviors: ['activation-emits-tgr-click'],
  routes: [{id: 'activation', sceneId: 'primary', covers: ['activation-emits-tgr-click']}],
};

const scripts: BehaviorScripts = {
  activation: async ({root, listen, readEvents}) => {
    await listen(['tgrClick']);
    const button = root.getByRole('button', {name: 'Salvar'});
    await button.click();
    const events = (await readEvents()).map(event => ({
      name: event.name,
      detail: {clicked: Boolean((event.detail as {clicked?: boolean} | undefined)?.clicked)},
    }));
    const observation = {focus: true, events, visibility: {button: await button.isVisible()}, state: {}};
    return {
      observation,
      assert: value => expect(value.events).toEqual([{name: 'tgrClick', detail: {clicked: true}}]),
    };
  },
};

const plan = readRunPlan();
for (const scene of plan.scenes) {
  test(scene.cellId, async ({anemoi}) => {
    await anemoi.runScene({contract, scene, scripts});
  });
}
```

- [ ] **Step 3: Criar o teste orquestrador**

Criar `packages/web/test/controlled-counterproof.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

test('Contraprova Controlada reprova divergencia React nos tres browsers', {timeout: 240000}, async t => {
  const [{writeRunPlan}, {finalizeRun}, {invokePlaywright}] = await Promise.all([
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/runPlan.ts')).href),
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/finalize.ts')).href),
    import(pathToFileURL(path.resolve(__dirname, '../src/runner/invoke.ts')).href),
  ]);
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-counterproof-'));
  t.after(() => fs.rmSync(runDir, {recursive: true, force: true}));
  const fixtureRoot = path.join(__dirname, 'fixtures', 'controlled-counterproof');
  fs.writeFileSync(path.join(runDir, 'builds.json'), JSON.stringify({
    wc: path.join(fixtureRoot, 'wc'),
    react: path.join(fixtureRoot, 'react'),
    angular: path.join(fixtureRoot, 'angular'),
  }));
  const scene = {
    id: 'primary', cellId: 'primary-gol-light-sm', name: 'Primary', component: 'tgr-button', args: {}, slots: {},
    brand: 'gol', theme: 'light', viewport: 'sm', width: 360,
  };
  const plan = {
    schemaVersion: 1, runId: 'counterproof', runDir, repo: '/fixture', consumer: 'fixture', component: 'tgr-button', card: 'COUNTERPROOF',
    diagnostic: false, collectA11y: true, browsers: ['chromium', 'firefox', 'webkit'], requiredBrowsers: ['chromium', 'firefox', 'webkit'], frameworks: ['wc', 'react', 'angular'],
    specPath: path.join(__dirname, 'browser', 'controlled-counterproof.spec.ts'), hostsPath: path.join(runDir, 'hosts.json'), scenes: [scene],
    contract: {status: 'current', fingerprintDigest: 'fixture', currentDigest: 'fixture', requiredBehaviors: ['activation-emits-tgr-click'], coveredBehaviors: ['activation-emits-tgr-click'], routes: [{id: 'activation', sceneId: 'primary', covers: ['activation-emits-tgr-click']}]},
  };
  const planPath = path.join(runDir, 'run-plan.json');
  writeRunPlan(planPath, plan);
  const execution = await invokePlaywright({planPath, logPath: path.join(runDir, 'playwright.log')});
  assert.equal(execution.exitCode, 1);
  const manifest = finalizeRun(planPath);
  assert.equal(manifest.gate.dimensions.behavioralParity.status, 'failed');
  assert.equal(manifest.gate.status, 'failed');
  assert.deepEqual(manifest.axes.browsers, ['chromium', 'firefox', 'webkit']);
  assert.equal(manifest.behavior.results.length, 3);
  for (const logical of manifest.behavior.results) {
    const route = logical.routes[0];
    assert.equal(route.frameworks.wc.observation.events.length, 1);
    assert.equal(route.frameworks.react.observation.events.length, 0);
    assert.equal(route.frameworks.angular.observation.events.length, 1);
  }
});
```

- [ ] **Step 4: Rodar a contraprova**

Run: `node --test packages/web/test/controlled-counterproof.test.js`

Expected: PASS do teste orquestrador; internamente os três projects Playwright falham de forma
esperada e o gate registra a divergência comportamental em Chromium, Firefox e WebKit.

- [ ] **Step 5: Commit**

```bash
git add packages/web/test/fixtures/controlled-counterproof packages/web/test/browser/controlled-counterproof.spec.ts packages/web/test/controlled-counterproof.test.js
git commit -m "test(web): prove controlled behavioral divergence"
```

---

### Task 16: Comparar os motores no tracer e cortar o executor Web antigo

**Files:**
- Create: `packages/web/src/runner/legacy-adapter.js` (temporário; removido nesta task após a prova)
- Create: `packages/web/scripts/compare-web-engines.js`
- Create: `packages/web/test/compare-web-engines.test.js`
- Create: `docs/migration/2026-07-18-playwright-test-tgr-button-cutover.md`
- Delete: `packages/web/src/run-legacy.js`
- Delete: `packages/web/src/runner/legacy-adapter.js`
- Delete: `packages/web/src/stories.js`
- Delete: `packages/web/src/storyArgs.js`
- Delete: `packages/web/test/stories.test.js`
- Delete: `packages/web/test/storyArgs.test.js`
- Delete: `packages/web/test/fixtures/index.json`
- Delete: `packages/web/test/fixtures/sample.stories.ts`
- Modify: `packages/web/src/run.js`
- Modify: `packages/web/src/index.js`
- Modify: `packages/web/test/run-stage.test.js`

**Interfaces:**
- Consumes: as mesmas Cenas, builds e primitiva `captureCellOnPage` nos dois motores.
- Produces: relatório de equivalência do `tgr-button`; CLI sem flag de engine e sem executor manual Web permanente.

- [ ] **Step 1: Adaptar temporariamente o motor antigo ao mesmo run plan**

Criar `packages/web/src/runner/legacy-adapter.js`:

```js
'use strict';
const fs = require('node:fs');
const {serveStatic} = require('@gol-smiles/anemoi-core');
const {capturePipeline} = require('../pipeline');
const {makeWcHarnessHost} = require('../hosts/wc-harness');
const {makeReactHost} = require('../hosts/react');
const {makeAngularHost} = require('../hosts/angular');

const factories = {wc: makeWcHarnessHost, react: makeReactHost, angular: makeAngularHost};

async function runLegacyFromPlan(plan) {
  if (plan.browsers.length !== 1 || plan.browsers[0] !== 'chromium') {
    throw new Error('legacy-adapter aceita somente o projeto chromium.');
  }
  const builds = JSON.parse(fs.readFileSync(`${plan.runDir}/builds.json`, 'utf8'));
  const cells = plan.scenes.flatMap(scene => plan.frameworks.map(framework => ({
    ...scene,
    browser: 'chromium',
    framework,
    storyId: scene.id,
    storyName: scene.name,
  })));
  const acquireHost = async framework => {
    const host = factories[framework](plan.repo);
    const server = await serveStatic(builds[framework]);
    return {host, url: server.url, release: () => server.close()};
  };
  return capturePipeline({
    cells,
    acquireHost,
    runDir: plan.runDir,
    statusFromParity: true,
    statusFromA11y: true,
    collectA11y: plan.collectA11y,
    manifestMeta: {
      tool: 'Anemoi Web Legacy Validation',
      card: plan.card,
      component: plan.component,
      mode: 'current',
      axes: {browsers: ['chromium'], frameworks: plan.frameworks},
    },
  });
}

module.exports = {runLegacyFromPlan};
```

Adicionar temporariamente a `run.js`:

```js
const {runLegacyFromPlan} = require('./runner/legacy-adapter');

async function runLegacyPlanState(args, cwd, overrides = {}) {
  if (!args.component) throw new Error('informe --component <nome> (ex.: tgr-button).');
  const repo = args.repo || cwd;
  const component = args.component;
  const card = args.card || 'sem-card';
  const runDir = (overrides.createRunDir || legacy.createRunDir)(repo, card, component);
  fs.mkdirSync(runDir, {recursive: true});
  const {plan} = await (overrides.preflight || defaultPreflight)({
    repo,
    runDir,
    consumer: 'tangerina',
    component,
    card,
    brands: list(args.brands, ['gol']),
    themes: list(args.themes, ['light', 'dark']),
    viewports: list(args.viewports, ['sm', 'lg']),
    scenesFilter: list(args.stories, undefined),
    selectedBrowsers: ['chromium'],
    collectA11y: !args['no-a11y'],
    skipBuild: Boolean(args['skip-build']),
  });
  const result = await (overrides.execute || runLegacyFromPlan)(plan);
  (overrides.setExitCode || (value => { process.exitCode = value; }))(result.manifest.status === 'passed' ? 0 : 1);
  return result.manifest;
}
```

Em `runCurrentState`, inserir antes do branch `playwright-test`:

```js
if (args.engine === 'legacy-plan') return runLegacyPlanState(args, cwd);
```

Exportar `runLegacyPlanState` apenas durante a migração e removê-la no Step 7.

- [ ] **Step 2: Escrever o comparador de equivalência**

Criar `packages/web/scripts/compare-web-engines.js`:

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');

function key(group) {
  return [group.brand, group.storyId, group.viewport, group.theme].join('|');
}

function normalizeGroup(group) {
  const parity = Object.fromEntries((group.parity || []).map(item => [item.against, {mismatch: item.mismatch, sizeMatch: item.sizeMatch !== false}]));
  const audits = group.a11y?.audits || {};
  return {
    captures: Object.fromEntries(['wc', 'react', 'angular'].map(framework => [framework, Boolean(group[framework])])),
    parity,
    axe: Object.fromEntries(Object.entries(audits).map(([framework, audit]) => [framework, {unavailable: Boolean(audit.error), violations: (audit.violations || []).length}])),
    aria: Object.fromEntries((group.a11y?.ariaParity || []).map(item => [item.against, item.match])),
  };
}

function compareEngineManifests(legacy, current) {
  const legacyGroups = new Map(legacy.groups.filter(group => !group.browser || group.browser === 'chromium').map(group => [key(group), normalizeGroup(group)]));
  const currentGroups = new Map(current.groups.filter(group => group.browser === 'chromium').map(group => [key(group), normalizeGroup(group)]));
  const keys = [...new Set([...legacyGroups.keys(), ...currentGroups.keys()])].sort();
  const differences = [];
  for (const cellKey of keys) {
    const before = legacyGroups.get(cellKey);
    const after = currentGroups.get(cellKey);
    if (JSON.stringify(before) !== JSON.stringify(after)) differences.push({path: `groups.${cellKey}`, legacy: before, current: after});
  }
  return {match: differences.length === 0, differences};
}

function parseArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 2) output[argv[index].replace(/^--/, '')] = argv[index + 1];
  return output;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.legacy || !args.current) throw new Error('use --legacy <manifest> --current <manifest>.');
  const result = compareEngineManifests(JSON.parse(fs.readFileSync(args.legacy, 'utf8')), JSON.parse(fs.readFileSync(args.current, 'utf8')));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.match ? 0 : 1;
}

module.exports = {compareEngineManifests};
```

- [ ] **Step 3: Escrever fixtures/testes do comparador**

Criar `packages/web/test/compare-web-engines.test.js`:

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {compareEngineManifests} = require('../scripts/compare-web-engines');

function group(overrides = {}) {
  return {
    browser: 'chromium', brand: 'gol', storyId: 'primary', viewport: 'sm', theme: 'light',
    wc: 'wc.png', react: 'react.png', angular: 'angular.png',
    parity: [{against: 'react', mismatch: 0, sizeMatch: true}, {against: 'angular', mismatch: 0, sizeMatch: true}],
    a11y: {audits: {wc: {violations: []}, react: {violations: []}, angular: {violations: []}}, ariaParity: [{against: 'react', match: true}, {against: 'angular', match: true}]},
    ...overrides,
  };
}

test('comparador aprova manifestos equivalentes apesar dos paths', () => {
  const legacy = {groups: [group({browser: null, wc: 'wc/old.png'})]};
  const current = {groups: [group({wc: 'chromium/wc/new.png'})]};
  assert.deepEqual(compareEngineManifests(legacy, current), {match: true, differences: []});
});

for (const [name, mutate] of [
  ['celula ausente', () => []],
  ['captura ausente', value => [{...value, react: undefined}]],
  ['pixel diferente', value => [{...value, parity: [{against: 'react', mismatch: 4, sizeMatch: true}]}]],
  ['dimensao diferente', value => [{...value, parity: [{against: 'react', mismatch: 0, sizeMatch: false}]}]],
  ['axe diferente', value => [{...value, a11y: {...value.a11y, audits: {...value.a11y.audits, react: {violations: [{id: 'button-name'}]}}}}]],
  ['aria diferente', value => [{...value, a11y: {...value.a11y, ariaParity: [{against: 'react', match: false}]}}]],
]) {
  test(`comparador detecta ${name}`, () => {
    const base = group();
    assert.equal(compareEngineManifests({groups: [base]}, {groups: mutate(base)}).match, false);
  });
}
```

Run: `node --test packages/web/test/compare-web-engines.test.js`

Expected: PASS.

- [ ] **Step 4: Rodar os dois motores no `tgr-button` real**

Com o Tangerina configurado e builds válidos:

```bash
TANGERINA_REPO=$(node -e "const {resolveRepository}=require('./packages/web/src/config'); process.stdout.write(resolveRepository({rootDir:process.cwd(),cwd:process.cwd(),repoArg:'tangerina'}))")
npm run web -- --repo tangerina --component tgr-button --card ANEMOI-CUTOVER --engine legacy-plan --browsers chromium --fail-on-diff --fail-on-a11y
LEGACY_MANIFEST=$(find "$TANGERINA_REPO/outputs/anemoi-web/ANEMOI-CUTOVER/tgr-button" -type f -name manifest.json -print | sort | tail -1)
npm run web -- --repo tangerina --component tgr-button --card ANEMOI-CUTOVER --engine playwright-test --browsers chromium --fail-on-diff --fail-on-a11y
CURRENT_MANIFEST=$(find "$TANGERINA_REPO/outputs/anemoi-web/ANEMOI-CUTOVER/tgr-button" -type f -name manifest.json -print | sort | tail -1)
node packages/web/scripts/compare-web-engines.js --legacy "$LEGACY_MANIFEST" --current "$CURRENT_MANIFEST"
```

Expected: comparador exit `0`, `match: true`, nenhuma diferença. Registrar no documento de migração os dois runDirs, commits Anemoi/Tangerina, quantidade de células e o JSON resumido; não commitar os outputs.

- [ ] **Step 5: Rodar comportamento completo nos três browsers**

```bash
npm run web -- --repo tangerina --component tgr-button --card ANEMOI-CUTOVER --engine playwright-test --fail-on-diff --fail-on-a11y
```

Expected: Chromium, Firefox e WebKit presentes; todas as dimensões aprovadas; `gate.trusted === true`; nenhum Resultado Atômico ausente ou flaky.

- [ ] **Step 6: Confirmar a Contraprova Controlada**

Run: `node --test packages/web/test/controlled-counterproof.test.js`

Expected: PASS do orquestrador e gate interno reprovado por `behavioralParity`.

- [ ] **Step 7: Remover o executor Web antigo**

Somente após Steps 4–6 aprovados:

- remover `run-legacy.js` e `legacy-adapter.js`;
- mover para `run.js`, sem alterar assinatura ou semântica, `createRunDir`, `prepareCapture`,
  `resolveExitCode` e `resolveA11yFlags` antes de apagar `run-legacy.js`; manter todos os exports
  públicos anteriores do barrel porque `packages/service` consome `createRunDir` e
  `capturePipeline`;
- manter os branches `--doctor` e `--review-contract` e delegar todo run de captura de
  `runCurrentState` a `runPlaywrightState`;
- rejeitar `--engine` com mensagem `--engine era temporario e foi removido; o Anemoi Web usa Playwright Test`;
- remover `stories.js`, `storyArgs.js`, `stories.test.js`, `storyArgs.test.js` e suas duas fixtures; a serialização das Cenas continua coberta por `assertObservation`, `writeRunPlan` e `tgr-button-contract.test.js`;
- manter `capturePipeline` somente como API legada de `packages/service`, marcada `@deprecated`, sem ser importada pela CLI Web;
- exportar `makeWcHarnessHost` como `makeWcHost` no barrel para preservar o nome público.

- [ ] **Step 8: Rodar toda a suíte depois do corte**

Run:

```bash
npm test
npm run typecheck -w packages/web
git diff --check
```

Expected: todas as suítes root/core/web/service passam; typecheck e diff-check saem `0`; `rg "run-legacy|engine playwright-test|ensureStorybookIndex" packages/web/src packages/web/test` não encontra referências ativas.

- [ ] **Step 9: Commit do corte**

```bash
git add packages/web/src packages/web/test packages/web/scripts docs/migration/2026-07-18-playwright-test-tgr-button-cutover.md
git commit -m "refactor(web): cut over to Playwright Test runner"
```

---

### Task 17: Atualizar documentação e executar verificação final

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/guides/web.md`
- Modify: `AGENTS.md` somente se comandos/estrutura estiverem desatualizados.
- Optional modify: `CONTEXT.md` somente se ele estiver rastreado na base limpa de execução e
  houver um hunk isolável deste plano; nunca adicionar o arquivo untracked/misto atual.

**Interfaces:**
- Consumes: CLI e manifesto finais.
- Produces: documentação operacional pronta para Dev/QA e evidência de verificação final.

- [ ] **Step 1: Documentar o fluxo público**

Adicionar exemplos exatos:

```bash
npm install
npx playwright install chromium firefox webkit
npm run web -- --repo tangerina --doctor
npm run web -- --repo tangerina --component tgr-button --card CDCOM-123
npm run web -- --repo tangerina --component tgr-button --review-contract
```

Explicar `run-plan.json`, Resultados Atômicos, `manifest.json` v2, dimensões, `stable/flaky`, runs diagnósticos por `--browsers` e que `--no-a11y` não pode emitir gate confiável.

- [ ] **Step 2: Atualizar arquitetura e linguagem**

Em `docs/architecture.md`, substituir o fluxo manual Web por `preflight → Playwright Test → Resultados Atômicos → finalizador`. Marcar `capturePipeline` como compatibilidade exclusiva do service/Koba e fora do executor Web canônico.

Se `CONTEXT.md` estiver rastreado na base limpa, garantir por patch seletivo que `Resultado
Atômico` continue definido por tentativa, não por teste, e que a Matriz de Suporte permaneça
propriedade do Tangerina. Se continuar untracked ou misto, deixar intacto: design e ADRs já
preservam essas decisões.

- [ ] **Step 3: Verificação local completa**

Run:

```bash
npm install
npm test
npm run typecheck -w packages/web
npm run web -- --repo tangerina --doctor
git diff --check
```

Expected: todos os comandos saem `0`; doctor confirma pnpm, builds e os três browsers.

- [ ] **Step 4: Verificação real focada**

Run:

```bash
npm run web -- --repo tangerina --component tgr-button --card ANEMOI-PLAYWRIGHT-TEST
```

Expected no manifesto:

```json
{
  "schemaVersion": 2,
  "status": "passed",
  "gate": {"status": "passed", "trusted": true}
}
```

Confirmar ainda: `axes.browsers` contém as três engines; todos os resultados são `stable`; conformidade e paridade comportamental estão separadas; `index.html` abre offline.

- [ ] **Step 5: Revisar o diff final**

```bash
git status --short
git diff --stat HEAD
git diff --check
```

Expected: somente arquivos deste plano; nenhum `output/`, build, trace, `.anemoi.local.json` ou mudança do Koba/Mobile.

- [ ] **Step 6: Commit documental**

```bash
git add README.md docs/architecture.md docs/guides/web.md AGENTS.md
# Somente se o requisito opcional acima for satisfeito:
git add -p CONTEXT.md
git commit -m "docs: explain component confidence workflow"
```
