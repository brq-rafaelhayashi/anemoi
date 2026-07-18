# Paridade de ícone da ComIcone (assets + slots nos harnesses) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A story `ComIcone` do `tgr-button` renderiza ícone + label "Baixar" nos três frameworks (wc, React, Angular) com paridade pixel e ARIA verdes no anemoi, usando os pacotes de assets do Tangerina.

**Architecture:** A story declara o ícone por nome em `parameters.anemoi.slots`; o anemoi lê essa convenção junto dos args e propaga `cell.slots` (canal que já existe até os harnesses, hoje sempre vazio). O harness React resolve `TgrIcon${Pascal}` no barrel de `assets-react`; o Angular localiza o standalone component pelo seletor e monta com `createComponent`. No Tangerina, o `tgr-button` deixa de perder o label por whitespace no slot default e a story passa a derivar o SVG dos assets.

**Tech Stack:** Node 24 `node:test` (anemoi), Vite + React 18 (harness react), Angular 20 application builder (harness angular), Stencil 4 + mock-doc (tangerina), Storybook 8 web-components-vite (Lit).

**Spec:** `docs/superpowers/specs/2026-07-17-tgr-button-icone-paridade-design.md`

## Global Constraints

- Node `24.13.1`. Comandos do anemoi rodam na raiz `/Users/user/Developer/projects/anemoi`; comandos do Tangerina rodam em `/Users/user/Documents/projects/tangerina-ds/tangerina-web-core-button` (checkout `tangerina-button`, branch `feat/button-primary-secondary-mini`).
- **NÃO COMMITAR no checkout do Tangerina** (Tasks 5 e 6): preferência registrada do Rafael — mudanças ficam no working tree; ele commita. No anemoi, commit ao fim de cada task.
- O anemoi nunca executa operações Git no checkout consumidor (rodar builds `pnpm` lá é permitido e esperado).
- Nunca editar arquivos gerados do Tangerina (`components.d.ts`, `readme.md` de componente, `components-react/src/components.ts`, `components-angular/src/directives/*` — regenerados por `pnpm build:components`).
- Estilo anemoi: CommonJS, 2 espaços, aspas simples, vírgula à direita em multiline; mensagens de erro em PT-BR sem acentos (siga os arquivos vizinhos).
- Estilo tangerina: JSDoc/textos PT-BR com acentos, siga `tgr-button-icon.tsx` e o spec existente.
- Ícone canônico da entrega: `add` (`packages/assets/src/assets/icons/add.svg`), que vira `TgrIconAdd` (React) e `<tgr-icon-add>` (Angular).

---

### Task 1: `resolveStoryArgs` retorna `{args, slots}` com a convenção `parameters.anemoi.slots`

**Files:**
- Modify: `packages/web/src/storyArgs.js`
- Modify: `packages/web/test/fixtures/sample.stories.ts`
- Test: `packages/web/test/storyArgs.test.js`

**Interfaces:**
- Consumes: nada novo.
- Produces: `resolveStoryArgs(repo, stories, opts) -> Promise<Record<storyId, {args: object, slots: object}>>`. Cada valor de `slots` é `string` (HTML bruto) ou `{icon: string}`. Task 2 consome esse shape.

- [ ] **Step 1: Estender a fixture com uma story com slots válidos e uma com slots inválidos**

Em `packages/web/test/fixtures/sample.stories.ts`, adicionar ao final:

```ts
export const ComIcone = {
  args: {label: 'Baixar'},
  parameters: {anemoi: {slots: {icon: {icon: 'add'}}}},
};
export const SlotInvalido = {
  args: {label: 'Baixar'},
  parameters: {anemoi: {slots: {icon: {componente: 'x'}}}},
};
```

- [ ] **Step 2: Escrever os testes que falham**

Em `packages/web/test/storyArgs.test.js`, adicionar ao final:

```js
test('retorna slots da convencao parameters.anemoi.slots', { skip: supportsTs ? false : 'requer Node >=24 (type-stripping nativo de .ts)' }, async () => {
  const stories = [
    {id: 'action-button--com-icone', name: 'Com Icone', importPath: './test/fixtures/sample.stories.ts'},
    {id: 'action-button--primary', name: 'Primary', importPath: './test/fixtures/sample.stories.ts'},
  ];
  const got = await resolveStoryArgs(PACKAGE_DIR, stories, {
    storiesRoot: path.join(PACKAGE_DIR, 'test', 'fixtures'),
  });
  assert.deepEqual(got['action-button--com-icone'].slots, {icon: {icon: 'add'}});
  assert.deepEqual(got['action-button--com-icone'].args, {label: 'Baixar', variant: 'primary', disabled: false});
  assert.deepEqual(got['action-button--primary'].slots, {});
});

test('rejeita slot que nao e string nem {icon: string}', { skip: supportsTs ? false : 'requer Node >=24 (type-stripping nativo de .ts)' }, async () => {
  const stories = [
    {id: 'action-button--slot-invalido', name: 'Slot Invalido', importPath: './test/fixtures/sample.stories.ts'},
  ];
  await assert.rejects(
    resolveStoryArgs(PACKAGE_DIR, stories, {
      storiesRoot: path.join(PACKAGE_DIR, 'test', 'fixtures'),
    }),
    /slot "icon" invalido/i,
  );
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -w packages/web -- --test-name-pattern="slots"`
Expected: FAIL — `got['action-button--com-icone'].slots` é `undefined` (retorno atual é o mapa de args).

- [ ] **Step 4: Implementar em `storyArgs.js`**

Adicionar antes de `resolveStoryArgs`:

```js
const SLOT_SHAPE_HINT = 'valores de parameters.anemoi.slots devem ser string (HTML) ou {icon: string}';

function assertValidSlots(value, {storyName, sourcePath}) {
  if (value === undefined) return {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Story "${storyName}" (${sourcePath}) possui parameters.anemoi.slots invalido: ${SLOT_SHAPE_HINT}.`);
  }
  for (const [slotName, slotValue] of Object.entries(value)) {
    if (typeof slotValue === 'string') continue;
    const isIconRef = slotValue !== null
      && typeof slotValue === 'object'
      && !Array.isArray(slotValue)
      && Object.keys(slotValue).length === 1
      && typeof slotValue.icon === 'string'
      && slotValue.icon.trim() !== '';
    if (!isIconRef) {
      throw new Error(`Story "${storyName}" (${sourcePath}) possui slot "${slotName}" invalido: ${SLOT_SHAPE_HINT}.`);
    }
  }
  return value;
}
```

No corpo do loop de `resolveStoryArgs`, substituir as três linhas finais (`const storyArgs = ...` até `out[s.id] = mergedArgs;`) por:

```js
    const storyArgs = storyExport.args || {};
    const mergedArgs = {...(meta.args || {}), ...storyArgs};
    assertSerializableArgs(mergedArgs, {storyName: s.name, sourcePath: s.importPath});
    const mergedSlots = {
      ...(meta.parameters?.anemoi?.slots || {}),
      ...(storyExport.parameters?.anemoi?.slots || {}),
    };
    assertValidSlots(mergedSlots, {storyName: s.name, sourcePath: s.importPath});
    out[s.id] = {args: mergedArgs, slots: mergedSlots};
```

Exportar também `assertValidSlots` no `module.exports`.

- [ ] **Step 5: Atualizar os testes existentes para o novo shape**

No mesmo `storyArgs.test.js`, no teste `'mescla meta.args + story.args para cada storyId'`, trocar cada `got['action-button--X']` por `got['action-button--X'].args` (4 asserts). Exemplo do primeiro:

```js
  assert.deepEqual(got['action-button--primary'].args, {label: 'Salvar', variant: 'primary', disabled: false});
```

- [ ] **Step 6: Rodar a suíte do pacote e ver passar**

Run: `npm test -w packages/web`
Expected: PASS (nenhum outro teste consome o retorno de `resolveStoryArgs`; se `run-stage.test.js` ou `pipeline.test.js` falharem, é porque stubam `resolveStoryArgs` — atualize o stub para retornar `{args, slots}` por id).

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/storyArgs.js packages/web/test/storyArgs.test.js packages/web/test/fixtures/sample.stories.ts
git commit -m "feat(web): resolveStoryArgs le slots da convencao parameters.anemoi.slots"
```

---

### Task 2: `run.js` propaga slots às células; builds e doctor cobrem os assets-*

**Files:**
- Modify: `packages/web/src/run.js:180,197-203`
- Modify: `packages/web/src/tangerina.js:7-14` (BUILD_SCRIPTS)
- Modify: `packages/web/src/doctor.js` (novos checks após o check `components`)
- Test: `packages/web/test/doctor.test.js`

**Interfaces:**
- Consumes: `resolveStoryArgs -> {args, slots}` (Task 1).
- Produces: células com `cell.slots` populado para react/angular (`{}` para wc). `BUILD_SCRIPTS` passa a conter `'build:assets-react'` e `'build:assets-angular'`. Checks de doctor com ids `react-assets` e `angular-assets`.

- [ ] **Step 1: Teste do doctor que falha**

Em `packages/web/test/doctor.test.js`, adicionar (usando os helpers já existentes no arquivo):

```js
test('doctor verifica dists dos assets-react e assets-angular', () => {
  const repo = makeConsumerRepo('pnpm@9.0.0');
  const checks = collectWithPnpmResult(repo, {status: 0, stdout: '9.0.0\n'});
  const reactAssets = checks.find(c => c.id === 'react-assets');
  const angularAssets = checks.find(c => c.id === 'angular-assets');
  assert.ok(reactAssets, 'check react-assets ausente');
  assert.ok(angularAssets, 'check angular-assets ausente');
  assert.equal(reactAssets.ok, false);
  assert.equal(angularAssets.ok, false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w packages/web -- --test-name-pattern="assets-react"`
Expected: FAIL — `check react-assets ausente`.

- [ ] **Step 3: Implementar**

Em `packages/web/src/tangerina.js`, `BUILD_SCRIPTS` vira:

```js
const BUILD_SCRIPTS = [
  'build:tokens',
  'build:assets',
  'build:fonts',
  'build:assets-react',
  'build:assets-angular',
  'build:components',
  'build:react',
  'build:angular',
];
```

Em `packages/web/src/doctor.js`, logo após o check `components` (linha ~126), adicionar:

```js
  checks.push({
    id: 'react-assets',
    label: 'Icones React buildados (packages/assets-react/dist/icons/index.js)',
    ok: exists('packages/assets-react/dist/icons/index.js'),
    detail: 'rode pnpm build:assets-react',
  });

  checks.push({
    id: 'angular-assets',
    label: 'Icones Angular buildados (packages/assets-angular/dist/icons)',
    ok: exists('packages/assets-angular/dist/icons'),
    detail: 'rode pnpm build:assets-angular',
  });
```

Em `packages/web/src/run.js`:
- linha ~180: `const storyDataById = await resolveStoryArgs(repo, stories);` (renomeia `argsById`).
- no `.map` das células (linhas ~197-203):

```js
    })).map(c => ({
      ...c,
      component,
      // WC: sem args/slots na URL (usa storyId nativo do Storybook, evita coercao de tipos)
      // React/Angular: args e slots passados como JSON na URL (resolvidos pelo CLI)
      args: c.framework === 'wc' ? {} : (storyDataById[c.storyId]?.args || {}),
      slots: c.framework === 'wc' ? {} : (storyDataById[c.storyId]?.slots || {}),
    }));
```

- [ ] **Step 4: Rodar a suíte inteira do workspace e ver passar**

Run: `npm test -w packages/web`
Expected: PASS. Se algum teste de doctor enumerar ids esperados de checks, inclua `'react-assets'` e `'angular-assets'` na lista. Se testes de run stubarem `resolveStoryArgs`, ajuste o stub para `{[id]: {args: {...}, slots: {}}}`.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/run.js packages/web/src/tangerina.js packages/web/src/doctor.js packages/web/test/doctor.test.js
git commit -m "feat(web): propaga slots das stories e builda/checa assets-react e assets-angular"
```

---

### Task 3: Harness React renderiza ícone dos assets-react

**Files:**
- Modify: `packages/web/harness/react/vite.config.ts:13-23`
- Modify: `packages/web/harness/react/src/main.tsx:22-24,63-72`
- Test: build real do harness (não há infra de teste unitário nos harnesses)

**Interfaces:**
- Consumes: `cell.slots` serializado no querystring `slots` (formato `Record<string, string | {icon: string}>`), alias Vite para os dists do checkout.
- Produces: para slot `{icon: 'add'}`, child `<TgrIconAdd slot="icon" aria-hidden="true"/>` direto (sem `<span>` wrapper); slot string mantém `<span slot dangerouslySetInnerHTML>`.

- [ ] **Step 1: Buildar os assets-react no checkout (pré-condição do alias)**

```bash
cd /Users/user/Documents/projects/tangerina-ds/tangerina-web-core-button && pnpm build:assets-react
```

Expected: `[assets-react] icons: 441 components` no log e `packages/assets-react/dist/icons/index.js` existente (`test -f packages/assets-react/dist/icons/index.js && echo OK`).

- [ ] **Step 2: Alias no `vite.config.ts`**

Adicionar dentro de `resolve.alias`, antes de `'@gol-smiles/tangerina-web-core'`:

```ts
      '@gol-smiles/tangerina-assets-react/icons': path.join(
        repo,
        'packages/assets-react/dist/icons/index.js'
      ),
```

- [ ] **Step 3: Ícones no `main.tsx`**

Após o import de `Tgr` (linha 13), adicionar:

```tsx
// Ícones dos assets — barrel completo; o mapeamento nome→export replica o
// toPascalCase do generate.mjs do assets-react (add → TgrIconAdd).
import * as TgrIcons from '@gol-smiles/tangerina-assets-react/icons';

function iconExportName(iconName: string): string {
  return (
    'TgrIcon' +
    iconName
      .replace(/^\d+[-_\s]?/, '')
      .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
      .replace(/^(.)/, (_, c: string) => c.toUpperCase())
  );
}
```

Trocar o tipo de `slots` (linha 24) por:

```tsx
const slots: Record<string, string | { icon: string }> = JSON.parse(
  decodeURIComponent(params.get('slots') || '%7B%7D')
);
```

Substituir o bloco `slotChildren` (linhas 64-70) por:

```tsx
  const slotChildren = Object.entries(slots).map(([name, value]) => {
    if (value !== null && typeof value === 'object') {
      const IconComp = (TgrIcons as Record<string, React.ComponentType<Record<string, unknown>>>)[
        iconExportName(value.icon)
      ];
      if (!IconComp) {
        return createElement(
          'span',
          {key: name || '__default__', ...(name ? {slot: name} : {})},
          `Ícone não encontrado: ${value.icon}`
        );
      }
      return createElement(IconComp, {
        key: name || '__default__',
        ...(name ? {slot: name} : {}),
        'aria-hidden': 'true',
      });
    }
    return createElement('span', {
      key: name || '__default__',
      ...(name ? {slot: name} : {}),
      dangerouslySetInnerHTML: {__html: value ?? ''},
    });
  });
```

- [ ] **Step 4: Verificar com build real + página**

```bash
cd /Users/user/Developer/projects/anemoi/packages/web/harness/react && DS_REPO=/Users/user/Documents/projects/tangerina-ds/tangerina-web-core-button npx vite build --outDir /tmp/anemoi-react-check
```

Expected: build sem erro. Depois, servir e inspecionar manualmente:

```bash
npx serve /tmp/anemoi-react-check -l 4173 &
open 'http://localhost:4173/index.html?c=tgr-button&story=action-button--com-icone&brand=gol&theme=light&viewport=sm&args=%7B%22label%22%3A%22Baixar%22%7D&slots=%7B%22icon%22%3A%7B%22icon%22%3A%22add%22%7D%7D'
```

Expected: botão laranja com ícone "+" e texto "Baixar". Encerrar o serve depois.

- [ ] **Step 5: Commit**

```bash
git add packages/web/harness/react/vite.config.ts packages/web/harness/react/src/main.tsx
git commit -m "feat(web): harness react renderiza slots de icone via assets-react"
```

---

### Task 4: Harness Angular renderiza ícone dos assets-angular

**Files:**
- Modify: `packages/web/src/hosts/angular.js:36-64` (generateFiles/paths)
- Modify: `packages/web/harness/angular/src/app.component.ts`
- Test: build real do harness

**Interfaces:**
- Consumes: `cell.slots` no querystring (mesmo formato da Task 3); tsconfig paths gerado.
- Produces: para slot `{icon: 'add'}`, elemento `<tgr-icon-add slot="icon">` montado com `createComponent`; slot string mantém o `innerHTML` atual.

- [ ] **Step 1: Buildar os assets-angular no checkout e inspecionar o dist**

```bash
cd /Users/user/Documents/projects/tangerina-ds/tangerina-web-core-button && pnpm build:assets-angular && ls packages/assets-angular/dist/icons | head
```

Expected: build ng-packagr sem erro e `dist/icons` contendo `index.d.ts` (secondary entrypoint). Se o layout diferir (ex.: só fesm2022 na raiz do dist), anote o caminho real do `.d.ts` do entrypoint `icons` e use-o no path do Step 2.

- [ ] **Step 2: Path no `generateFiles` de `hosts/angular.js`**

Dentro do objeto `paths` (após a entrada `'@gol-smiles/tangerina-angular'`), adicionar:

```js
        '@gol-smiles/tangerina-assets-angular/icons': [
          path.join(repo, 'packages/assets-angular/dist/icons'),
        ],
```

- [ ] **Step 3: Ícones no `app.component.ts`**

Adicionar `createComponent` e `Type` aos imports de `@angular/core` (linha 1-9; `Type` já está) e o barrel:

```ts
import { createComponent } from '@angular/core';
import * as TgrIcons from '@gol-smiles/tangerina-assets-angular/icons';
```

Trocar o tipo de `slots` (linha 30):

```ts
  slots: Record<string, string | { icon: string }> = {};
```

Substituir o corpo de `ngAfterViewInit` (linhas 70-81) por:

```ts
  ngAfterViewInit() {
    // Projeta os slots na light DOM do custom element ja renderizado pelo outlet.
    // string = HTML bruto (comportamento original); {icon} = standalone component
    // dos assets-angular localizado pelo seletor tgr-icon-<nome>.
    if (!this.Cmp || Object.keys(this.slots).length === 0) return;
    const host = document.querySelector(`#evidence-root ${this.component}`) as HTMLElement | null;
    if (!host) return;
    host.innerHTML = '';
    for (const [name, value] of Object.entries(this.slots)) {
      if (value !== null && typeof value === 'object') {
        const selector = `tgr-icon-${value.icon}`;
        const IconCls = (Object.values(TgrIcons) as Type<any>[]).find((cls: any) => {
          const meta = cls?.ɵcmp;
          if (!meta?.selectors) return false;
          return (meta.selectors as string[][]).some((s: string[]) => s[0] === selector);
        });
        if (!IconCls) {
          host.insertAdjacentHTML(
            'beforeend',
            `<span${name ? ` slot="${name}"` : ''}>Ícone não encontrado: ${value.icon}</span>`
          );
          continue;
        }
        const el = document.createElement(selector);
        if (name) el.setAttribute('slot', name);
        host.appendChild(el);
        const ref = createComponent(IconCls, {
          environmentInjector: this.envInjector,
          hostElement: el,
        });
        ref.changeDetectorRef.detectChanges();
      } else {
        host.insertAdjacentHTML(
          'beforeend',
          name ? `<span slot="${name}">${value ?? ''}</span>` : String(value ?? '')
        );
      }
    }
  }
```

- [ ] **Step 4: Verificar com build real + página**

O build do harness angular é orquestrado por `hosts/angular.js` (gera o tsconfig paths antes do `ng build`). Verifique pelo caminho de produção usando o Node REPL do motor:

```bash
cd /Users/user/Developer/projects/anemoi && node -e "
const {makeAngularHost} = require('./packages/web/src/hosts/angular');
const host = makeAngularHost('/Users/user/Documents/projects/tangerina-ds/tangerina-web-core-button');
host.build('/Users/user/Documents/projects/tangerina-ds/tangerina-web-core-button', '/tmp/anemoi-angular-check', {logPath: '/tmp/anemoi-angular-check.log'});
console.log('build ok');
"
```

Expected: `build ok` (o log fica em `/tmp/anemoi-angular-check.log`). Depois:

```bash
npx serve /tmp/anemoi-angular-check/browser -l 4174 &
open 'http://localhost:4174/index.html?c=tgr-button&story=action-button--com-icone&brand=gol&theme=light&viewport=sm&args=%7B%22label%22%3A%22Baixar%22%7D&slots=%7B%22icon%22%3A%7B%22icon%22%3A%22add%22%7D%7D'
```

Expected: botão laranja com ícone "+" e texto "Baixar". Encerrar o serve depois.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hosts/angular.js packages/web/harness/angular/src/app.component.ts
git commit -m "feat(web): harness angular renderiza slots de icone via assets-angular"
```

---

### Task 5: Tangerina — `tgr-button` não perde o label com whitespace no slot default

**Files (checkout `/Users/user/Documents/projects/tangerina-ds/tangerina-web-core-button`):**
- Modify: `packages/components/src/components/tgr-button/tgr-button.tsx`
- Test: `packages/components/src/components/tgr-button/tgr-button.spec.tsx`

**Interfaces:**
- Produces: label visível quando o slot default só tem whitespace; suprimido quando há conteúdo real. Task 6/7 dependem desse comportamento para a paridade.
- **SEM COMMIT** — mudanças ficam no working tree.

- [ ] **Step 1: Escrever os testes que falham**

Em `tgr-button.spec.tsx`, adicionar (seguindo o estilo dos testes existentes; asserts de booleano via `hasAttribute` por causa do mock-doc):

```tsx
  it('mantém o label quando o slot padrão recebe apenas whitespace', async () => {
    const page = await newSpecPage({
      components: [TgrButton],
      html: `<tgr-button label="Baixar">
        <svg slot="icon"></svg>
      </tgr-button>`,
    });
    const label = page.root.shadowRoot.querySelector('[part="label"]');
    expect(label.textContent).toContain('Baixar');
  });

  it('suprime o label quando há conteúdo real no slot padrão', async () => {
    const page = await newSpecPage({
      components: [TgrButton],
      html: `<tgr-button label="Baixar">Enviar</tgr-button>`,
    });
    const label = page.root.shadowRoot.querySelector('[part="label"]');
    expect(label.textContent).not.toContain('Baixar');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/user/Documents/projects/tangerina-ds/tangerina-web-core-button && pnpm --filter @gol-smiles/tangerina-web-core test -- --testPathPattern tgr-button`
Expected: FAIL — o primeiro teste falha (o fallback do slot é suprimido pelos text nodes de whitespace, `label.textContent` não contém "Baixar").

- [ ] **Step 3: Implementar em `tgr-button.tsx`**

Adicionar o state e o updater ao lado de `hasIcon`/`updateHasIcon` (linhas 19 e 66-68):

```tsx
  @State() hasDefaultContent = false;
```

```tsx
  private updateHasDefaultContent = () => {
    this.hasDefaultContent = Array.from(this.host.childNodes).some((node) =>
      node.nodeType === Node.ELEMENT_NODE
        ? !(node as Element).hasAttribute('slot')
        : node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim(),
    );
  };
```

Em `componentWillLoad()`:

```tsx
  componentWillLoad() {
    this.updateHasIcon();
    this.updateHasDefaultContent();
  }
```

No `render()`, trocar o span do label (linhas 95-97) por:

```tsx
        <span part="label" class={{ label: true, 'visually-hidden': this.isLoading }}>
          <slot onSlotchange={this.updateHasDefaultContent} />
          {!this.hasDefaultContent && this.label}
        </span>
```

Atualizar o JSDoc da prop `label` (linha 21) para:

```tsx
  /** Texto do botão. Ignorado quando há conteúdo não-whitespace no slot padrão. */
```

- [ ] **Step 4: Rodar e ver passar (suíte inteira do componente)**

Run: `cd /Users/user/Documents/projects/tangerina-ds/tangerina-web-core-button && pnpm --filter @gol-smiles/tangerina-web-core test`
Expected: PASS, incluindo os specs pré-existentes do tgr-button (nenhum deles depende do fallback `<slot>{label}</slot>`; se algum assert de markup falhar, ajuste o snapshot/assert para o novo span com texto fora do slot).

- [ ] **Step 5: Rebuildar os components para os harnesses consumirem o fix**

Run: `cd /Users/user/Documents/projects/tangerina-ds/tangerina-web-core-button && pnpm build:components && pnpm build:react && pnpm build:angular`
Expected: builds ok (o Stencil regenera `components.d.ts`/`readme.md` — deixar no working tree, não reverter).

---

### Task 6: Tangerina — story `ComIcone` deriva o ícone dos assets e declara a convenção

**Files (checkout `/Users/user/Documents/projects/tangerina-ds/tangerina-web-core-button`):**
- Modify: `packages/components/src/components/tgr-button/tgr-button.stories.ts:36-60`

**Interfaces:**
- Consumes: `add.svg` de `packages/assets/src/assets/icons/` (via `import.meta.glob` do Vite, com guarda para o import Node do anemoi); comportamento do label da Task 5.
- Produces: `parameters.anemoi.slots = { icon: { icon: 'add' } }` — contrato consumido pelas Tasks 1-4.
- **SEM COMMIT** — mudanças ficam no working tree.

- [ ] **Step 1: Reescrever a story**

No topo do arquivo, junto aos imports existentes:

```ts
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
```

Antes do `export const ComIcone`:

```ts
// Ícone derivado do asset canônico (packages/assets). import.meta.glob é do Vite
// (Storybook); o anemoi importa este módulo via Node puro, onde glob não existe —
// a guarda evita quebrar essa leitura (o render não executa fora do Storybook).
const rawIcons = (import.meta as { glob?: (p: string, o: object) => Record<string, string> }).glob?.(
  '../../../../assets/src/assets/icons/add.svg',
  { query: '?raw', import: 'default', eager: true },
);
const addRaw = rawIcons ? Object.values(rawIcons)[0] : '';

// Extrai o corpo do SVG e normaliza o fill para herdar a cor do botão
// (o export do Figma vem com fill fixo; sem normalizar, o dark theme diverge).
function svgBody(markup: string): { viewBox: string; body: string } {
  const viewBox = markup.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 24 24';
  const body = markup
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<svg[^>]*>/g, '')
    .replace(/<\/svg>/g, '')
    .replace(/fill="(?!none)[^"]*"/gi, 'fill="currentColor"')
    .trim();
  return { viewBox, body };
}

const addIcon = svgBody(addRaw);
```

Substituir o `export const ComIcone` inteiro por:

```ts
export const ComIcone: StoryObj = {
  args: { label: 'Baixar', variant: 'primary' },
  parameters: {
    anemoi: { slots: { icon: { icon: 'add' } } },
  },
  render: (args) => html`
    <tgr-button
      label=${args.label}
      variant=${args.variant}
      size=${args.size}
      type=${args.type}
      ?disabled=${args.disabled}
      ?loading=${args.loading}
      ?full-width=${args.fullWidth}
      ?brand=${args.brand}
    >
      <svg
        slot="icon"
        viewBox=${addIcon.viewBox}
        width="1em"
        height="1em"
        fill="currentColor"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        ${unsafeSVG(addIcon.body)}
      </svg>
    </tgr-button>
  `,
};
```

- [ ] **Step 2: Verificar no Storybook buildado**

Run: `cd /Users/user/Documents/projects/tangerina-ds/tangerina-web-core-button && pnpm build-storybook -o /tmp/sb-check`
Expected: build sem erro. Abrir e conferir visualmente:

```bash
npx serve /tmp/sb-check -l 6006 &
open 'http://localhost:6006/iframe.html?id=action-button--com-icone'
```

Expected: botão com ícone "+" E texto "Baixar" (o fix da Task 5 mantém o label). Encerrar o serve depois.

- [ ] **Step 3: Verificar que o Node do anemoi ainda lê o módulo**

Run (na raiz do anemoi):

```bash
cd /Users/user/Developer/projects/anemoi && node -e "
const {resolveStoryArgs} = require('./packages/web/src/storyArgs');
resolveStoryArgs('/Users/user/Documents/projects/tangerina-ds/tangerina-web-core-button', [
  {id: 'action-button--com-icone', name: 'Com Icone', importPath: './packages/components/src/components/tgr-button/tgr-button.stories.ts'},
]).then(r => console.log(JSON.stringify(r, null, 2)));
"
```

Expected: JSON com `"slots": {"icon": {"icon": "add"}}` e `"args"` contendo `"label": "Baixar"` — sem erro de import (a guarda do `import.meta.glob` funcionou).

---

### Task 7: Validação fim-a-fim — paridade verde na ComIcone

**Files:**
- Nenhuma mudança de código prevista; run real + inspeção do manifest.

**Interfaces:**
- Consumes: tudo das Tasks 1-6.

- [ ] **Step 1: Doctor no checkout**

Run: `cd /Users/user/Developer/projects/anemoi && npm run web -- --repo tangerina-button --doctor`
Expected: todos os checks OK, incluindo os novos `react-assets` e `angular-assets`.

- [ ] **Step 2: Run completa**

Run: `cd /Users/user/Developer/projects/anemoi && npm run web -- --repo tangerina-button --component tgr-button`
Expected: 120 prints; a mensagem final NÃO deve acusar "Paridade divergente" (as violações `color-contrast` pré-existentes podem manter "Acessibilidade divergente" — fora do escopo).

- [ ] **Step 3: Inspecionar o manifest da ComIcone**

Com o `runDir` impresso no passo anterior:

```bash
node -e "
const m = require(process.argv[1] + '/manifest.json');
const groups = m.groups.filter(g => g.label.includes('Com Icone'));
let bad = 0;
for (const g of groups) {
  for (const p of g.parity) if (p.mismatch !== 0 || !p.sizeMatch) { bad++; console.log('PIXEL', g.label, p.against, p.mismatch); }
  for (const ap of g.a11y.ariaParity) if (!ap.match) { bad++; console.log('ARIA', g.label, ap.against); }
  for (const [fw, audit] of Object.entries(g.a11y.audits)) {
    for (const v of audit.violations) if (v.id === 'button-name') { bad++; console.log('AXE button-name', g.label, fw); }
  }
}
console.log(bad === 0 ? 'COM ICONE VERDE' : bad + ' problema(s)');
" <runDir>
```

Expected: `COM ICONE VERDE`. Se aparecer `PIXEL ... mismatch <n>` pequeno (subpixel raw×svgo ou alinhamento do host Angular — riscos registrados no spec), abrir os diffs em `<runDir>/diff/*/gol-action-button--com-icone-*.png`, avaliar e decidir com o Rafael a mitigação prevista (normalizar a story com o mesmo pipeline de otimização) antes de qualquer ajuste de threshold.

- [ ] **Step 4: Conferir os screenshots dos três frameworks**

Abrir `<runDir>/index.html` (galeria) e conferir: ícone "+" + "Baixar" idênticos em wc/react/angular, light e dark.

- [ ] **Step 5: Suíte completa do anemoi + commit de fechamento (se houver ajustes)**

Run: `cd /Users/user/Developer/projects/anemoi && npm test`
Expected: PASS. Se a validação exigiu ajustes em arquivos do anemoi, commitar com `fix(web): ...` descrevendo o ajuste. Lembrar: **nada de commit no checkout do Tangerina** — avisar o Rafael que o working tree de `tangerina-web-core-button` está pronto para revisão/commit dele.
