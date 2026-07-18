# Design — Ícone da story ComIcone com padrão de assets e paridade verde no anemoi

**Data:** 2026-07-17
**Repos:** `anemoi` (este) + `tangerina-web-core-button` (checkout `tangerina-button`, branch `feat/button-primary-secondary-mini`)
**Origem:** run `outputs/anemoi-web/sem-card/tgr-button/2026-07-16T21-24-27-538Z-b4e06ea5` — paridade e a11y divergentes, todas na story `ComIcone`.

## Contexto e diagnóstico

A story `ComIcone` do `tgr-button` usa `render` customizado em Lit com `<svg slot="icon">` inline. Três defeitos independentes fazem a renderização pretendida (ícone + label "Baixar") não aparecer em nenhum framework:

1. **Anemoi** — o caminho CLI lê apenas `storyExport.args` (`packages/web/src/storyArgs.js`) e descarta o `render`; os harnesses React/Angular suportam slots via querystring, mas `cell.slots` nunca é populado. Resultado: React/Angular mostram só o label, sem ícone.
2. **Tangerina (componente)** — `tgr-button.tsx` renderiza o label como fallback de slot (`<slot>{this.label}</slot>`); os text nodes de whitespace do template Lit são atribuídos ao slot default e suprimem o fallback. Resultado: wc mostra só o ícone, sem label → violação `button-name` (critical) do axe.
3. **Tangerina (story)** — o `<svg>` é desenhado à mão em vez de derivar dos assets do DS.

## Critério de sucesso

`npm run web -- --repo tangerina-button --component tgr-button` sai com paridade pixel e ARIA verdes na `ComIcone`, com os três frameworks renderizando ícone + label "Baixar", ícone decorativo (`aria-hidden`), sem `button-name` critical. (As violações `color-contrast` pré-existentes ficam fora do escopo.)

## Decisões travadas (Rafael, 2026-07-17)

| Tema | Decisão |
| :--- | :--- |
| Escopo | Fix completo nos dois repos — paridade verde |
| Story wc | SVG raw dos assets (`add.svg?raw` via Vite) normalizado; NÃO usa `assets-vanilla` nem o futuro base `tgr-icon` (design de 2026-07-16, ainda não implementado; colisão de tag registrada como risco lá) |
| Harnesses | Componentes dos pacotes `assets-react`/`assets-angular`, resolvidos por nome de ícone (import estático dos barrels, sem codegen) |
| Checkout tangerina | `tangerina-button` (`feat/button-primary-secondary-mini`) |
| Ícone da story | `add` (existe nos três pacotes; o `download` atual não tem asset) |

## Contrato da convenção (story → anemoi)

```ts
parameters: {
  anemoi: {
    slots: {
      icon: { icon: 'add' },   // nome do arquivo em packages/assets/src/assets/icons/
      // ou string de HTML bruto (fallback; comportamento atual dos harnesses)
    },
  },
},
```

- O nome é a chave canônica compartilhada: os três pacotes `assets-*` derivam seus componentes do mesmo arquivo com a mesma regra `toPascalCase` (`add` → `TgrIconAdd` / `<tgr-icon-add>`).
- `resolveStoryArgs` passa a retornar `{args, slots}` por story: merge raso de `meta.parameters?.anemoi?.slots` com `storyExport.parameters?.anemoi?.slots` (story vence), validando cada valor como string ou `{icon: string}`.
- `run.js` injeta `slots` nas células; a serialização até os harnesses já existe (`cell.slots` no querystring de `hosts/react.js` e `hosts/angular.js`).
- Lado wc: inalterado — o Storybook real renderiza a story original.

## Mudanças no anemoi

- `packages/web/src/storyArgs.js` — ler/validar `parameters.anemoi.slots`, retornar junto dos args.
- `packages/web/src/run.js` — propagar `slots` para as células.
- `packages/web/harness/react/vite.config.ts` — alias `@gol-smiles/tangerina-assets-react/icons` → `<repo>/packages/assets-react/dist/icons/index.js`.
- `packages/web/harness/react/src/main.tsx` — slot `{icon}` resolve `TgrIcon${Pascal}` no barrel e vira `createElement(IconComp, { slot: name, 'aria-hidden': 'true' })` como child direto (sem `<span>` wrapper); slot string mantém o caminho atual.
- `packages/web/src/hosts/angular.js` (`generateFiles`) — path `@gol-smiles/tangerina-assets-angular/icons` → dist do checkout.
- `packages/web/harness/angular/src/app.component.ts` — slot `{icon}` localiza o standalone component pelo seletor `tgr-icon-${name}` (mesmo truque `ɵcmp.selectors` do lookup de `DIRECTIVES`), monta com `createComponent` + `attachView`, setando atributo `slot` no host element antes de anexar; slot string mantém o `innerHTML` atual.
- `packages/web/src/tangerina.js` — `BUILD_SCRIPTS` ganha `build:assets-react` e `build:assets-angular` (scripts já existentes na raiz do tangerina); doctor passa a checar os dists desses pacotes.

## Mudanças no tangerina (checkout `tangerina-button`)

- `packages/components/src/components/tgr-button/tgr-button.tsx` — novo state `hasDefaultContent` (análogo ao `hasIcon`): considera apenas elementos sem atributo `slot` e text nodes não-whitespace. Render troca `<slot>{this.label}</slot>` por `<slot />{!hasDefaultContent && this.label}` no span do label.
- `packages/components/src/components/tgr-button/tgr-button.spec.tsx` — regressão: filho só com `slot="icon"` + whitespace → label visível; conteúdo real no slot default → label suprimido.
- `packages/components/src/components/tgr-button/tgr-button.stories.ts` — `ComIcone` importa `add.svg?raw` do `packages/assets`, helper extrai o corpo e monta `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">` (o raw tem `fill` fixo e 24px; sem normalizar, dark theme e tamanho divergem dos assets-*). Declara `parameters.anemoi.slots = { icon: { icon: 'add' } }`.
- Preferência registrada: mudanças no tangerina ficam no working tree; Rafael commita.

## Testes e validação fim-a-fim

1. Anemoi: testes novos em `packages/web/test/` para `resolveStoryArgs` (slots válidos, inválidos, merge meta×story) e propagação nas células; `npm test` na raiz.
2. Tangerina: `pnpm --filter @gol-smiles/tangerina-web-core test` (specs Stencil).
3. Evidência real: `npm run web -- --repo tangerina-button --component tgr-button` — esperado: paridade pixel e ARIA verdes na `ComIcone`, `button-name` critical zerado, 120 prints.

## Riscos

- **Subpixel raw × svgo**: o wc renderiza o SVG raw e os assets-* renderizam paths otimizados (`floatPrecision: 2`); pode sobrar mismatch residual no pixelmatch (threshold 0.1, tolerância 0). Mitigação decidida: se acusar, normalizar a story com o mesmo pipeline de otimização em build-time.
- **Alinhamento vertical**: o host Angular (`<tgr-icon-add>`, `inline-flex`) e o `<svg>` React nu podem alinhar ±1px diferente dentro do span `.icon` do botão. Aparece no pixel diff; tratar na validação se ocorrer.
- **Dist ausente dos assets-***: harness quebraria se o checkout nunca buildou os pacotes; coberto pelos novos passos de build + doctor.
