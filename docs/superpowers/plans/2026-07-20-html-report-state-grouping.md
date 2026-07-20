# State-Grouped HTML Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar o `index.html` v2 do Anemoi em accordions por estado de cena, preservando todas as evidências e priorizando falhas.

**Architecture:** Uma função pura em `stateReport.ts` projetará o manifesto existente em grupos de estado, sem alterar `manifest.json`. `outputV2.ts` consumirá essa projeção para renderizar resumo global, accordions nativos e subseções progressivas; o JavaScript inline ficará limitado a abrir/fechar estados e filtrar browsers.

**Tech Stack:** Node.js 24.13.1, TypeScript 5.9, CommonJS tests com `node:test`, HTML/CSS/JavaScript nativos.

## Global Constraints

- Não alterar o schema ou o conteúdo do `manifest.json`.
- Não alterar captura, gate ou critérios de aprovação.
- Não adicionar dependência ou biblioteca de interface.
- Manter `summary.md` funcionalmente inalterado.
- Manter o relatório autocontido, offline, responsivo e navegável por teclado.
- Preservar escape de HTML e validação de todos os caminhos relativos.
- Dados não associáveis devem aparecer em “Evidências sem estado”; nunca devem ser descartados.
- Usar CommonJS no código JavaScript, dois espaços, ponto e vírgula, aspas simples e trailing commas multiline.

---

### Task 1: Projetar o manifesto em grupos de estado

**Files:**
- Create: `packages/web/src/runner/stateReport.ts`
- Create: `packages/web/test/state-report.test.js`

**Interfaces:**
- Consumes: manifesto v2 com `axes.frameworks`, `gate.dimensions`, `groups`, `behavior.results` e `attempts`.
- Produces: `projectStateReport(manifest: StateReportManifest): StateReportGroup[]`.
- Produces: `StateReportGroup` com `id`, `name`, `status`, `open`, `orphaned`, `groups`, `behavior`, `attempts`, `axes` e `issues`.
- Produces: `ReportStatus = 'failed' | 'unavailable' | 'passed'`.

- [ ] **Step 1: Escrever os testes falhos da projeção**

Criar `packages/web/test/state-report.test.js` com fixtures realistas: os caminhos de captura devem começar em `results/<logicalTestId>/attempt-0/`, pois esse prefixo é a associação canônica entre `groups`, comportamento e tentativas.

```js
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/stateReport.ts')).href);
}

function group({
  id,
  name,
  browser = 'chromium',
  parityFailed = false,
  axeFailed = false,
  axeError = false,
}) {
  const logicalTestId = `${id}--gol--light--sm--hash--${browser}`;
  const root = `results/${logicalTestId}/attempt-0/evidence/${browser}`;
  return {
    browser,
    brand: 'gol',
    storyId: id,
    story: name,
    viewport: 'sm',
    theme: 'light',
    label: `${browser} · gol · ${name} · sm · light`,
    wc: `${root}/wc.png`,
    react: `${root}/react.png`,
    angular: `${root}/angular.png`,
    parity: [
      {against: 'react', mismatch: parityFailed ? 1 : 0, sizeMatch: true},
      {against: 'angular', mismatch: 0, sizeMatch: true},
    ],
    a11y: {
      audits: {
        wc: axeError ? {error: 'axe timeout'} : {
          violations: axeFailed ? [{id: 'color-contrast', nodes: [{}]}] : [],
        },
        react: {violations: []},
        angular: {violations: []},
      },
      ariaParity: [{against: 'react', match: true}, {against: 'angular', match: true}],
    },
  };
}

function manifest(groups) {
  const logicalIds = groups.map(item => item.wc.split('/')[1]);
  return {
    axes: {frameworks: ['wc', 'react', 'angular']},
    gate: {dimensions: {axe: {status: 'failed'}}},
    groups,
    behavior: {
      results: logicalIds.map(logicalTestId => ({
        logicalTestId,
        stability: 'stable',
        routes: [],
      })),
    },
    attempts: logicalIds.map(logicalTestId => ({
      logicalTestId,
      stability: 'stable',
      attempts: [{
        attempt: 0,
        status: 'passed',
        resultPath: `results/${logicalTestId}/attempt-0/result.json`,
      }],
    })),
  };
}

test('agrupa todas as evidencias pelo storyId e preserva o nome visivel', async () => {
  const {projectStateReport} = await subject();
  const states = projectStateReport(manifest([
    group({id: 'primary', name: 'Primary', browser: 'chromium'}),
    group({id: 'primary', name: 'Primary', browser: 'firefox'}),
  ]));

  assert.equal(states.length, 1);
  assert.equal(states[0].id, 'primary');
  assert.equal(states[0].name, 'Primary');
  assert.equal(states[0].groups.length, 2);
  assert.equal(states[0].behavior.length, 2);
  assert.equal(states[0].attempts.length, 2);
});

test('ordena failed, unavailable e passed e abre apenas estados nao aprovados', async () => {
  const {projectStateReport} = await subject();
  const states = projectStateReport(manifest([
    group({id: 'passed', name: 'Passed'}),
    group({id: 'unavailable', name: 'Unavailable', axeError: true}),
    group({id: 'failed', name: 'Failed', axeFailed: true}),
  ]));

  assert.deepEqual(states.map(item => [item.id, item.status, item.open]), [
    ['failed', 'failed', true],
    ['unavailable', 'unavailable', true],
    ['passed', 'passed', false],
  ]);
});

test('coloca combinacoes falhas antes das aprovadas sem perder ordem estavel', async () => {
  const {projectStateReport} = await subject();
  const states = projectStateReport(manifest([
    group({id: 'primary', name: 'Primary', browser: 'chromium'}),
    group({id: 'primary', name: 'Primary', browser: 'firefox', parityFailed: true}),
    group({id: 'primary', name: 'Primary', browser: 'webkit'}),
  ]));

  assert.deepEqual(states[0].groups.map(item => item.browser), [
    'firefox',
    'chromium',
    'webkit',
  ]);
});

test('preserva resultados nao associaveis em Evidencias sem estado', async () => {
  const {projectStateReport} = await subject();
  const input = manifest([group({id: 'primary', name: 'Primary'})]);
  input.attempts.push({
    logicalTestId: 'orphan--chromium',
    stability: 'stable',
    attempts: [{attempt: 0, status: 'error', resultPath: 'results/orphan--chromium/attempt-0/result.json'}],
  });

  const orphan = projectStateReport(input).find(item => item.orphaned);
  assert.equal(orphan.name, 'Evidências sem estado');
  assert.equal(orphan.status, 'unavailable');
  assert.equal(orphan.attempts[0].logicalTestId, 'orphan--chromium');
});
```

- [ ] **Step 2: Executar o teste e confirmar a falha RED**

Run:

```bash
export PATH="/Users/user/.nvm/versions/node/v24.13.1/bin:$PATH"
node --test packages/web/test/state-report.test.js
```

Expected: FAIL com `ERR_MODULE_NOT_FOUND` para `stateReport.ts`.

- [ ] **Step 3: Implementar a projeção mínima**

Criar `packages/web/src/runner/stateReport.ts`. A implementação deve:

```ts
export type ReportStatus = 'failed' | 'unavailable' | 'passed';

type UnknownRecord = Record<string, any>;

export type StateReportManifest = {
  axes?: {frameworks?: string[]};
  gate?: {dimensions?: Record<string, {status?: string}>};
  groups?: UnknownRecord[];
  behavior?: {results?: UnknownRecord[]};
  attempts?: UnknownRecord[];
};

export type StateReportGroup = {
  id: string;
  name: string;
  status: ReportStatus;
  open: boolean;
  orphaned: boolean;
  groups: UnknownRecord[];
  behavior: UnknownRecord[];
  attempts: UnknownRecord[];
  axes: {browsers: string[]; themes: string[]; viewports: string[]};
  issues: {
    parityFailed: number;
    parityUnavailable: number;
    axeFailed: number;
    axeUnavailable: number;
    behaviorFailed: number;
    behaviorUnavailable: number;
    stabilityFailed: number;
    stabilityUnavailable: number;
  };
};

const STATUS_WEIGHT: Record<ReportStatus, number> = {passed: 0, unavailable: 1, failed: 2};
const FRAMEWORKS = ['wc', 'react', 'angular'];

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
}

function text(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function stateIdentity(group: UnknownRecord) {
  const cell = group._cell && typeof group._cell === 'object' ? group._cell : {};
  const id = text(group.storyId) || text(cell.storyId);
  const name = text(group.story) || text(cell.story) || id;
  return id && name ? {id, name} : null;
}

function logicalTestIdFromGroup(group: UnknownRecord) {
  for (const framework of FRAMEWORKS) {
    const source = text(group[framework]);
    const match = source?.match(/^results\/([^/]+)\/attempt-\d+\//);
    if (match) return match[1];
  }
  return null;
}

function visualStatus(group: UnknownRecord, frameworks: string[], axeExpected: boolean): ReportStatus {
  const parity = records(group.parity);
  const audits = group.a11y?.audits && typeof group.a11y.audits === 'object'
    ? group.a11y.audits
    : {};
  const aria = records(group.a11y?.ariaParity);
  if (parity.some(item => item.mismatch > 0 || item.sizeMatch === false)
    || Object.values(audits).some((audit: any) => records(audit?.violations).length > 0)
    || aria.some(item => item.match === false)) return 'failed';
  if (frameworks.some(framework => !text(group[framework]))
    || Object.values(audits).some((audit: any) => text(audit?.error))
    || (axeExpected && frameworks.some(framework => !(framework in audits)))) return 'unavailable';
  return 'passed';
}

function behaviorStatus(result: UnknownRecord): ReportStatus {
  const routes = records(result.routes);
  if (routes.some(route => route.parity === 'failed'
    || Object.values(route.frameworks || {}).some((value: any) => value?.conformance === 'failed'))) {
    return 'failed';
  }
  if (routes.some(route => ['not-comparable', 'not-run'].includes(route.parity)
    || Object.values(route.frameworks || {}).some((value: any) => value?.execution === 'error'
      || !value?.conformance))) return 'unavailable';
  return 'passed';
}

function attemptStatus(result: UnknownRecord): ReportStatus {
  const attempts = records(result.attempts);
  if (result.stability === 'flaky' || attempts.some(item => item.status === 'failed')) return 'failed';
  if (attempts.some(item => item.status === 'error')) return 'unavailable';
  return 'passed';
}

function worst(statuses: ReportStatus[]): ReportStatus {
  return statuses.reduce((current, status) =>
    STATUS_WEIGHT[status] > STATUS_WEIGHT[current] ? status : current, 'passed');
}

function unique(items: unknown[]) {
  return [...new Set(items.filter((item): item is string => typeof item === 'string' && item.length > 0))];
}

function countIssues(
  groups: UnknownRecord[],
  behavior: UnknownRecord[],
  attempts: UnknownRecord[],
  frameworks: string[],
  axeExpected: boolean,
) {
  const parity = groups.flatMap(group => records(group.parity));
  const audits = groups.flatMap(group => Object.values(group.a11y?.audits || {})) as UnknownRecord[];
  const routes = behavior.flatMap(result => records(result.routes));
  const attemptItems = attempts.flatMap(result => records(result.attempts));
  return {
    parityFailed: parity.filter(item => item.mismatch > 0 || item.sizeMatch === false).length,
    parityUnavailable: groups.reduce((total, group) => total
      + frameworks.filter(framework => !text(group[framework])).length
      + Math.max(0, 2 - records(group.parity).length), 0),
    axeFailed: audits.filter(item => records(item.violations).length > 0).length,
    axeUnavailable: audits.filter(item => text(item.error)).length
      + (axeExpected ? groups.reduce((total, group) => {
        const observed = group.a11y?.audits && typeof group.a11y.audits === 'object'
          ? Object.keys(group.a11y.audits)
          : [];
        return total + frameworks.filter(framework => !observed.includes(framework)).length;
      }, 0) : 0),
    behaviorFailed: routes.filter(route => behaviorStatus({routes: [route]}) === 'failed').length,
    behaviorUnavailable: routes.filter(route => behaviorStatus({routes: [route]}) === 'unavailable').length,
    stabilityFailed: attemptItems.filter(item => item.status === 'failed').length
      + attempts.filter(item => item.stability === 'flaky').length,
    stabilityUnavailable: attemptItems.filter(item => item.status === 'error').length,
  };
}

function finalize(
  group: Omit<StateReportGroup, 'status' | 'open' | 'axes' | 'issues'>,
  frameworks: string[],
  axeExpected: boolean,
) {
  group.groups.sort((left, right) => STATUS_WEIGHT[visualStatus(right, frameworks, axeExpected)]
    - STATUS_WEIGHT[visualStatus(left, frameworks, axeExpected)]);
  const status = group.orphaned ? 'unavailable' : worst([
    ...group.groups.map(item => visualStatus(item, frameworks, axeExpected)),
    ...group.behavior.map(behaviorStatus),
    ...group.attempts.map(attemptStatus),
  ]);
  return {
    ...group,
    status,
    open: status !== 'passed',
    axes: {
      browsers: unique(group.groups.map(item => item.browser)),
      themes: unique(group.groups.map(item => item.theme)),
      viewports: unique(group.groups.map(item => item.viewport)),
    },
    issues: countIssues(group.groups, group.behavior, group.attempts, frameworks, axeExpected),
  } satisfies StateReportGroup;
}

export function projectStateReport(manifest: StateReportManifest): StateReportGroup[] {
  const frameworks = manifest.axes?.frameworks || FRAMEWORKS;
  const axeExpected = Boolean(manifest.gate?.dimensions?.axe);
  const states = new Map<string, Omit<StateReportGroup, 'status' | 'open' | 'axes' | 'issues'>>();
  const logicalToState = new Map<string, string>();
  const orphan: Omit<StateReportGroup, 'status' | 'open' | 'axes' | 'issues'> = {
    id: '__orphan__',
    name: 'Evidências sem estado',
    orphaned: true,
    groups: [],
    behavior: [],
    attempts: [],
  };
  for (const group of records(manifest.groups)) {
    const identity = stateIdentity(group);
    if (!identity) {
      orphan.groups.push(group);
      continue;
    }
    if (!states.has(identity.id)) states.set(identity.id, {...identity, orphaned: false, groups: [], behavior: [], attempts: []});
    states.get(identity.id)!.groups.push(group);
    const logicalTestId = logicalTestIdFromGroup(group);
    if (logicalTestId) logicalToState.set(logicalTestId, identity.id);
  }
  for (const result of records(manifest.behavior?.results)) {
    const state = logicalToState.get(result.logicalTestId);
    (state ? states.get(state)!.behavior : orphan.behavior).push(result);
  }
  for (const result of records(manifest.attempts)) {
    const state = logicalToState.get(result.logicalTestId);
    (state ? states.get(state)!.attempts : orphan.attempts).push(result);
  }
  const projected = [...states.values()].map(item => finalize(item, frameworks, axeExpected));
  if (orphan.groups.length || orphan.behavior.length || orphan.attempts.length) {
    projected.push(finalize(orphan, frameworks, axeExpected));
  }
  return projected.sort((left, right) => STATUS_WEIGHT[right.status] - STATUS_WEIGHT[left.status]);
}
```

- [ ] **Step 4: Executar teste e typecheck**

Run:

```bash
node --test packages/web/test/state-report.test.js
npm run typecheck -w packages/web
```

Expected: todos os testes do arquivo passam e TypeScript termina com exit code `0`.

- [ ] **Step 5: Commitar a projeção**

```bash
git add packages/web/src/runner/stateReport.ts packages/web/test/state-report.test.js
git commit -m "feat(web): group report evidence by state"
```

---

### Task 2: Renderizar accordions e evidências progressivas por estado

**Files:**
- Modify: `packages/web/src/runner/outputV2.ts:1-390`
- Modify: `packages/web/test/output-v2.test.js:8-369`

**Interfaces:**
- Consumes: `projectStateReport(manifest)` e `StateReportGroup` da Task 1.
- Produces: `renderHtmlV2(manifest)` com `.state-group[data-state][data-status]`.
- Preserva: `renderSummaryV2(manifest)` e todas as funções de segurança atuais.

- [ ] **Step 1: Tornar a fixture compatível com associação canônica e escrever testes falhos**

Na fixture de `packages/web/test/output-v2.test.js`, adicionar `storyId: 'primary'` e substituir os três caminhos visuais por caminhos sob o mesmo teste lógico:

```js
storyId: 'primary',
wc: 'results/primary--firefox/attempt-1/evidence/firefox/wc/a.png',
react: 'results/primary--firefox/attempt-1/evidence/firefox/react/a.png',
angular: 'results/primary--firefox/attempt-1/evidence/firefox/angular/a.png',
parity: [
  {against: 'react', mismatch: 0, sizeMatch: true},
  {against: 'angular', mismatch: 0, sizeMatch: true},
],
```

Adicionar estes testes:

```js
test('galeria agrupa visual comportamento Axe e tentativas pelo estado', async () => {
  const {renderHtmlV2} = await subject();
  const html = renderHtmlV2(manifest);

  assert.match(html, /<details class="state-group failed" data-state="primary" data-status="failed" open>/);
  assert.match(html, /<summary[^>]*>.*Primary.*1 combina[cç][aã]o.*falh/is);
  assert.match(html, /data-state="primary"[\s\S]*Diagnostico Axe do estado[\s\S]*Evidencia visual[\s\S]*Comportamento[\s\S]*Tentativas e diagnosticos/);
});

test('galeria fecha estados aprovados e abre falhos ou indisponiveis', async () => {
  const {renderHtmlV2} = await subject();
  const passed = structuredClone(manifest.groups[0]);
  passed.storyId = 'secondary';
  passed.story = 'Secondary';
  passed.label = 'firefox · gol · Secondary · sm · light';
  passed.a11y.audits.wc.violations = [];
  passed.a11y.audits.react = {violations: []};
  passed.wc = passed.wc.replace('primary--firefox', 'secondary--firefox');
  passed.react = passed.react.replace('primary--firefox', 'secondary--firefox');
  passed.angular = passed.angular.replace('primary--firefox', 'secondary--firefox');
  const grouped = structuredClone(manifest);
  grouped.groups.push(passed);
  grouped.behavior.results.push({logicalTestId: 'secondary--firefox', stability: 'stable', routes: []});
  grouped.attempts.push({logicalTestId: 'secondary--firefox', stability: 'stable', attempts: [{
    attempt: 0,
    status: 'passed',
    resultPath: 'results/secondary--firefox/attempt-0/result.json',
  }]});

  const html = renderHtmlV2(grouped);
  assert.match(html, /class="state-group failed"[^>]*open/);
  assert.match(html, /class="state-group passed" data-state="secondary" data-status="passed">/);
});

test('galeria mostra evidencias orfas em grupo indisponivel aberto', async () => {
  const {renderHtmlV2} = await subject();
  const orphaned = structuredClone(manifest);
  orphaned.attempts.push({logicalTestId: 'orphan--webkit', stability: 'stable', attempts: [{
    attempt: 0,
    status: 'error',
    resultPath: 'results/orphan--webkit/attempt-0/result.json',
  }]});
  const html = renderHtmlV2(orphaned);

  assert.match(html, /data-state="__orphan__" data-status="unavailable" open/);
  assert.match(html, /Evidências sem estado/);
  assert.match(html, /orphan--webkit/);
});
```

- [ ] **Step 2: Executar o teste e confirmar a falha RED**

Run:

```bash
node --test packages/web/test/output-v2.test.js
```

Expected: FAIL porque `renderHtmlV2` ainda produz três tabelas globais.

- [ ] **Step 3: Integrar a projeção e adicionar renderizadores focados**

Em `outputV2.ts`, importar:

```ts
import {projectStateReport} from './stateReport.ts';
import type {StateReportGroup} from './stateReport.ts';
```

Adicionar funções com estas responsabilidades e assinaturas exatas:

```ts
function renderIssueBadges(state: StateReportGroup): string;
function renderStateAxe(state: StateReportGroup, frameworks: string[]): string;
function renderStateVisual(state: StateReportGroup, browsers: string[]): string;
function renderStateBehavior(state: StateReportGroup): string;
function renderStateAttempts(state: StateReportGroup): string;
function renderStateGroup(state: StateReportGroup, manifest: ManifestV2): string;
```

Os renderizadores devem reutilizar `escapeHtml`, `safeRelativeHref`, `expectedResultHref`, `scopedAttachmentHref`, `aggregateAxeDiagnostics` e `renderAxeHtml`. Não criar uma segunda implementação de segurança.

O esqueleto produzido por `renderStateGroup` deve ser:

```ts
function renderStateGroup(state: StateReportGroup, manifest: ManifestV2) {
  const open = state.open ? ' open' : '';
  return `<section class="state-shell">
<details class="state-group ${escapeHtml(state.status)}" data-state="${escapeHtml(state.id)}" data-status="${escapeHtml(state.status)}"${open}>
<summary><span class="state-title">${escapeHtml(state.name)}</span><span>${escapeHtml(plural(state.groups.length, 'combinação', 'combinações'))}</span>${renderIssueBadges(state)}</summary>
<div class="state-body">
${renderStateAxe(state, manifest.axes.frameworks || FRAMEWORKS)}
${renderStateVisual(state, manifest.axes.browsers)}
${renderStateBehavior(state)}
${renderStateAttempts(state)}
</div></details></section>`;
}
```

Regras obrigatórias dos renderizadores:

- `renderStateAxe`: chamar `aggregateAxeDiagnostics(state.groups, {expectedFrameworks})`; exibir contagens e a regra dominante imediatamente; manter cada regra/nó em `<details>` fechado; não duplicar links do mesmo artefato dentro do estado.
- `renderStateVisual`: produzir um `<details class="state-section visual-evidence">` fechado; dentro dele, um `<details class="browser-evidence" data-browser="...">` por browser presente; dentro de cada browser, tabela WC/React/Angular.
- `renderStateBehavior`: produzir `<details class="state-section behavior-evidence" open>` somente quando `behaviorFailed` ou `behaviorUnavailable` for maior que zero; ordenar roteiros falhos, indisponíveis e aprovados.
- `renderStateAttempts`: produzir `<details class="state-section attempt-evidence">` fechado; manter validação exata de `result.json` e attachments da tentativa.
- Se uma subseção não tiver dados, renderizar uma frase curta “Sem evidência aplicável.” em vez de omiti-la.

Em `renderHtmlV2`, substituir `visualRows`, `behaviorRows`, `attemptRows` e as três tabelas globais por:

```ts
const states = projectStateReport(manifest);
const stateGroups = states.map(state => renderStateGroup(state, manifest)).join('');
```

E no corpo:

```html
<h2>Estados do componente</h2>
<div class="report-controls">...</div>
<div id="state-report">${stateGroups}</div>
```

O diagnóstico Axe global deve virar um resumo compacto sem lista completa de nós ou artefatos. Os detalhes completos ficam em `renderStateAxe`.

- [ ] **Step 4: Executar testes focados e ajustar as asserções Axe existentes**

Atualizar testes que procuravam detalhes Axe na seção global para procurá-los dentro de `.state-group`. Preservar todas as asserções atuais de conteúdo causal, deduplicação e segurança.

Run:

```bash
node --test packages/web/test/state-report.test.js packages/web/test/output-v2.test.js
npm run typecheck -w packages/web
```

Expected: todos passam; TypeScript termina com exit code `0`.

- [ ] **Step 5: Commitar a renderização por estado**

```bash
git add packages/web/src/runner/outputV2.ts packages/web/test/output-v2.test.js
git commit -m "feat(web): render report evidence by state"
```

---

### Task 3: Adicionar controles, filtro e layout responsivo

**Files:**
- Modify: `packages/web/src/runner/outputV2.ts:332-390`
- Modify: `packages/web/test/output-v2.test.js`

**Interfaces:**
- Consumes: `.state-group[data-status]` e `.browser-evidence[data-browser]` da Task 2.
- Produces: botões `[data-action="open-failed"]`, `[data-action="close-all"]` e `[data-browser-filter]`.
- Mantém: HTML sem dependências externas.

- [ ] **Step 1: Escrever testes falhos para controles e responsividade**

```js
test('galeria oferece controles globais e filtro por browser sobre grupos locais', async () => {
  const {renderHtmlV2} = await subject();
  const html = renderHtmlV2(manifest);

  assert.match(html, /data-action="open-failed"[^>]*>Abrir estados com falha/);
  assert.match(html, /data-action="close-all"[^>]*>Fechar todos/);
  assert.match(html, /data-browser-filter="firefox"/);
  assert.match(html, /querySelectorAll\('\.state-group'\)/);
  assert.match(html, /querySelectorAll\('\.browser-evidence'\)/);
});

test('galeria usa details nativo e contem tabelas em wrappers responsivos', async () => {
  const {renderHtmlV2} = await subject();
  const html = renderHtmlV2(manifest);

  assert.match(html, /<details class="state-group/);
  assert.match(html, /<summary>/);
  assert.match(html, /class="table-scroll"/);
  assert.match(html, /\.table-scroll\{overflow-x:auto/);
  assert.doesNotMatch(html, /role="button"|tabindex="0"/);
});
```

- [ ] **Step 2: Executar o teste e confirmar a falha RED**

Run:

```bash
node --test packages/web/test/output-v2.test.js
```

Expected: FAIL porque controles e wrappers responsivos ainda não existem.

- [ ] **Step 3: Implementar controles e CSS sem biblioteca**

Renderizar os controles:

```ts
const browserButtons = manifest.axes.browsers.map(browser =>
  `<button type="button" data-browser-filter="${escapeHtml(browser)}">${escapeHtml(titleCase(browser))}</button>`).join('');

const reportControls = `<div class="report-controls">
<button type="button" data-action="open-failed">Abrir estados com falha</button>
<button type="button" data-action="close-all">Fechar todos</button>
<span class="browser-filters">${browserButtons}<button type="button" data-browser-filter="all">Todos os browsers</button></span>
</div>`;
```

Adicionar ao script inline:

```js
document.querySelector('.report-controls').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.action === 'open-failed') {
    document.querySelectorAll('.state-group').forEach(state => {
      state.open = state.dataset.status !== 'passed';
    });
  }
  if (button.dataset.action === 'close-all') {
    document.querySelectorAll('.state-group').forEach(state => { state.open = false; });
  }
  if (button.dataset.browserFilter) {
    document.querySelectorAll('.browser-evidence').forEach(group => {
      group.hidden = button.dataset.browserFilter !== 'all'
        && group.dataset.browser !== button.dataset.browserFilter;
    });
  }
});
```

Adicionar `.table-scroll` em volta de cada tabela interna e incluir CSS equivalente a:

```css
.report-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:16px 0}
.state-shell{margin:10px 0}
.state-group{background:#fff;border:1px solid #d8dce3;border-left:4px solid #167044;border-radius:8px;padding:0}
.state-group.failed{border-left-color:#b42318}
.state-group.unavailable{border-left-color:#b54708}
.state-group>summary{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px;cursor:pointer}
.state-title{font-size:16px;font-weight:700;margin-right:auto}
.state-body{padding:0 12px 12px}
.table-scroll{overflow-x:auto;max-width:100%}
.table-scroll table{min-width:720px}
.browser-evidence[hidden]{display:none}
```

- [ ] **Step 4: Rodar regressões de segurança, testes e typecheck**

Run:

```bash
node --test packages/web/test/output-v2.test.js packages/web/test/state-report.test.js
npm run typecheck -w packages/web
git diff --check
```

Expected: todos passam, TypeScript e `git diff --check` saem com código `0`; testes existentes continuam recusando `javascript:`, traversal, caminhos absolutos e attachments de outra tentativa.

- [ ] **Step 5: Commitar interação e responsividade**

```bash
git add packages/web/src/runner/outputV2.ts packages/web/test/output-v2.test.js
git commit -m "feat(web): add grouped report controls"
```

---

### Task 4: Documentar e validar o relatório real do tgr-button

**Files:**
- Modify: `docs/guides/web.md:190-211`
- Verify only: `packages/web/src/runner/outputV2.ts`
- Generated, never commit: `<tangerina>/outputs/anemoi-web/sem-card/tgr-button/<run-id>/`

**Interfaces:**
- Consumes: CLI `npm run web -- --repo tangerina --component tgr-button`.
- Produces: documentação operacional e um bundle real para inspeção.

- [ ] **Step 1: Atualizar o guia com a navegação por estado**

Substituir o parágrafo de navegação da galeria por texto equivalente a:

```markdown
Use `summary.md` para localizar rapidamente a causa representativa. No `index.html`, cada estado da
Cena reúne Axe, evidência visual, comportamento e tentativas. Estados com falha ou evidência
indisponível aparecem primeiro e abertos; estados aprovados aparecem fechados. Dentro de cada estado,
abra apenas a subseção necessária e consulte o `.a11y.json` vinculado quando precisar de todos os nós
e metadados originais daquela auditoria. Os controles no topo reabrem estados falhos, fecham todos os
estados e filtram evidências por browser sem alterar o veredito ou as contagens.
```

- [ ] **Step 2: Executar toda a suíte e o typecheck**

Run:

```bash
export PATH="/Users/user/.nvm/versions/node/v24.13.1/bin:$PATH"
npm test
npm run typecheck -w packages/web
git diff --check
```

Expected: todos os testes passam; TypeScript e `git diff --check` saem com código `0`.

- [ ] **Step 3: Executar o doctor do consumidor configurado**

Run:

```bash
npm run web -- --repo tangerina --doctor
```

Expected: preflight, builds, artefatos e browsers obrigatórios aprovados.

- [ ] **Step 4: Gerar um novo relatório real do tgr-button**

Run:

```bash
npm run web -- --repo tangerina --component tgr-button
```

Expected para o estado atual conhecido do Tangerina: exit code `1` porque o gate encontra violações reais; a finalização ainda deve publicar `manifest.json`, `summary.md` e `index.html` válidos. Exit code `2` indica erro de execução e deve ser investigado antes de prosseguir.

- [ ] **Step 5: Verificar estruturalmente o bundle real**

Resolver o checkout configurado e selecionar o bundle recém-gerado:

```bash
export ANEMOI_TANGERINA_REPO="$(node -p 'require("./.anemoi.local.json").repositories.tangerina.path')"
export ANEMOI_RUN_DIR="$(find "$ANEMOI_TANGERINA_REPO/outputs/anemoi-web/sem-card/tgr-button" -mindepth 1 -maxdepth 1 -type d -print | sort | tail -1)"
test -f "$ANEMOI_RUN_DIR/manifest.json"
test -f "$ANEMOI_RUN_DIR/summary.md"
test -f "$ANEMOI_RUN_DIR/index.html"
test "$(rg -o 'class="state-group' "$ANEMOI_RUN_DIR/index.html" | wc -l | tr -d ' ')" -eq 13
rg 'data-state="loading"|Diagnostico Axe do estado|Abrir estados com falha|Fechar todos' "$ANEMOI_RUN_DIR/index.html"
open "$ANEMOI_RUN_DIR/index.html"
```

Expected: os três arquivos existem; o HTML contém 13 `.state-group` para o run atual do `tgr-button`; `Loading`, diagnóstico Axe local e controles estão presentes.

Na janela aberta, verificar:

1. estados falhos/indisponíveis aparecem antes e abertos;
2. estados aprovados aparecem depois e fechados;
3. `Tab`, `Shift+Tab`, `Enter` e `Space` operam summaries e botões;
4. filtro de browser oculta apenas grupos visuais;
5. WC, React e Angular aparecem lado a lado;
6. links de `result.json`, attachments e `.a11y.json` abrem arquivos locais corretos;
7. nenhuma tabela amplia horizontalmente a página inteira.

- [ ] **Step 6: Commitar documentação e finalizar**

```bash
git add docs/guides/web.md
git commit -m "docs(web): explain state-grouped report"
git status --short
```

Expected: commit criado; somente arquivos preexistentes não relacionados, `.superpowers/brainstorm/`, o fluxograma não rastreado ou outputs do consumidor podem permanecer fora dos commits.
