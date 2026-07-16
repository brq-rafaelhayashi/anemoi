# Design — Análise de acessibilidade (WCAG) e paridade semântica no Anemoi Web

Data: 2026-07-16
Status: aprovado em brainstorming, aguardando plano de implementação

## Contexto e motivação

O Anemoi Web captura cada componente do Tangerina em uma matriz de células
(framework × brand × story × viewport × theme) e compara pixels dos wrappers React e Angular
contra o Web Component baseline. Esta feature estende o mesmo modelo para acessibilidade e
HTML semântico, respondendo duas perguntas distintas:

1. **Auditoria absoluta** — "o componente é acessível?" Cada célula é auditada contra as
   regras WCAG via axe-core.
2. **Paridade semântica** — "os wrappers preservam a semântica do WC?" A árvore ARIA de
   React e Angular é comparada à do WC baseline, no mesmo molde da paridade de pixels.

A segunda pergunta é o diferencial do Anemoi: ferramentas de prateleira auditam uma página
isolada; nenhuma compara a semântica exposta pelo mesmo componente em frameworks diferentes.

## Decisões de requisito

- **Modelo:** ambos — auditoria WCAG absoluta + paridade semântica ARIA.
- **Ativação:** sempre ligada em todo run; `--no-a11y` desliga a coleta.
- **Gate:** sempre reporta; `--fail-on-a11y` (opt-in) afeta status e exit code, no mesmo
  padrão do `--fail-on-diff` da Fase 0.
- **Semântica:** coberta pelas regras do axe-core + comparação da árvore ARIA. Sem motor de
  regras próprio.
- **Ruleset:** tags axe `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` (WCAG A + AA).
- **Escopo:** apenas Anemoi Web (`packages/core` + `packages/web`). O runtime mobile
  (`anemoi-preset`, Detox/React Native) fica fora — não há DOM para auditar.
  `packages/service` herda a feature automaticamente via `capturePipeline`, sem mudanças
  além de campos opcionais novos no manifesto.

## Arquitetura

Abordagem escolhida: **coletores na visita de captura**. A `captureCells` já abre uma page
do Playwright por célula com o componente renderizado e estável; os coletores rodam nessa
mesma visita, após o screenshot — zero navegação extra. A direção de dependências de
`docs/architecture.md` é preservada: o core ganha primitivas agnósticas, o web orquestra.

### packages/core

- **Novo módulo `src/a11y.js`:**
  - `runAxeAudit(page, selector, {tags})` — injeta o axe-core na página, roda escopado ao
    seletor do componente com as tags WCAG configuradas e retorna violações normalizadas:
    `{violations: [{id, impact, wcag, description, helpUrl, nodes}]}`.
  - `captureAriaSnapshot(page, selector)` — retorna a árvore ARIA do componente via
    `locator.ariaSnapshot()` do Playwright (YAML determinístico; requer Playwright >= 1.49,
    o instalado é 1.61).
- **`src/capture.js`:** `captureCells` ganha a opção `collectA11y` (default `true`). Após o
  screenshot, com a mesma page, roda os dois coletores e grava os artefatos ao lado do PNG:
  `<theme>.a11y.json` (resultado axe) e `<theme>.aria.yaml` (snapshot ARIA). O resultado de
  cada captura carrega os dados coletados e os relPaths dos artefatos. Falha na coleta
  nunca derruba a captura visual: vira `a11y: {error: <mensagem>}` no resultado.
- **Dependência nova:** `axe-core` (somente no core).

### packages/web

- **Novo módulo `src/a11y.js`** (irmão de `parity.js`, mesmo molde):
  - `groupByCell` (em `parity.js`) passa a expor, por framework, além do relPath do PNG, os
    dados de a11y retornados pela captura — é por aí que `computeA11y` os recebe.
  - `computeA11y(groups, runDir, {pairs})` — agrega as violações axe por célula/framework e
    compara o snapshot ARIA de cada `against` contra o `reference` (WC). Divergência gera
    diff textual em `aria-diff/<against>-vs-<reference>/<brand>-<storyId>-<viewport>-<theme>.txt`.
  - `hasA11yDivergence(groups)` — análoga a `hasParityDivergence`. Diverge quando: qualquer
    violação axe (qualquer impacto), OU `ariaParity.match === false`, OU erro de coleta.
- **`src/pipeline.js`:** novo estágio `a11y` entre `parity` e `output`. O veredito compõe os
  dois gates de forma independente: `statusFromParity` (existente) e o novo gate a11y.
- **CLI (`args.js`, `cli.js`, docs):** flags `--no-a11y` e `--fail-on-a11y`, componíveis com
  `--fail-on-diff`. Passar `--no-a11y` junto de `--fail-on-a11y` é erro de uso (exit 1 com
  mensagem clara): não existe gate sobre uma coleta desligada.

## Fluxo de dados e formatos

```text
capture (page aberta por célula)
  ├─ screenshot PNG                    (como hoje)
  ├─ axe.run escopado ao seletor  →   <theme>.a11y.json
  └─ ariaSnapshot                 →   <theme>.aria.yaml
parity   → diffs de pixels             (como hoje)
a11y     → agrega violações por célula/framework
         → diff ARIA por par           → aria-diff/<par>/<célula>.txt
output   → manifest + summary.md + galeria (eixo a11y novo)
```

### Manifesto — bloco `a11y` por grupo

Cada grupo (célula visual) ganha, ao lado de `parity`:

```json
{
  "a11y": {
    "audits": {
      "wc":    {"violations": [{"id": "color-contrast", "impact": "serious",
                 "wcag": ["wcag2aa"], "helpUrl": "...", "nodes": 1}],
                "artifactPath": "wc/gol/.../light.a11y.json"},
      "react": {"violations": [], "artifactPath": "react/gol/.../light.a11y.json"}
    },
    "ariaParity": [
      {"against": "react", "match": false,
       "diffPath": "aria-diff/react-vs-wc/gol-....txt"}
    ]
  }
}
```

Célula cuja coleta falhou carrega `{"error": "<mensagem>"}` no lugar do audit — ausência de
dado é explícita, nunca silenciosa.

### Manifesto — agregado e proveniência

- Topo do manifesto: `a11y: {totalViolations, worstImpact, ariaMismatches, ruleset}`.
- `provenance` (Fase 0) ganha a versão do axe-core — a régua da auditoria faz parte da
  evidência.
- `buildManifest` segue única fonte da verdade do formato; os campos novos são opcionais.

### Compatibilidade

Manifests antigos, sem os campos `a11y`, continuam renderizando normalmente na galeria e no
summary — mesmo princípio do `sizeMatch` da Fase 0 (ausência de campo nunca diverge nem
quebra render).

## Tratamento de erros e gate

- A coleta a11y roda em try/catch próprio dentro da visita. Timeout do axe ou seletor
  ausente não invalidam o screenshot já gravado; a célula registra `a11y: {error}`.
- **Sem `--fail-on-a11y`:** violações, divergências ARIA e erros de coleta aparecem apenas
  no relatório; status e exit code não mudam.
- **Com `--fail-on-a11y`:** qualquer violação, divergência ARIA ou erro de coleta resulta em
  manifesto `status: "failed"` e exit code 1. Erro de coleta falha o gate porque "não
  consegui medir" não é "está acessível" — um gate que passa sem evidência mente.
- Filtro de impacto mínimo (ex.: falhar só em `serious`+) é evolução futura consciente; não
  entra agora.

## Galeria e summary

- Badge de a11y por célula: verde (0 violações, ARIA em paridade), vermelho (contagem +
  pior impacto), cinza ("a11y indisponível", erro de coleta).
- Painel expandível por célula: violações (regra, impacto, trecho de HTML afetado, link
  helpUrl do axe) e, havendo divergência ARIA, o diff textual.
- `summary.md` ganha seção de acessibilidade com os agregados.
- Tudo offline, como hoje: os dados vêm do manifesto, sem assets externos.

## Testes

Padrão do repo: `node --test`, sem dependências novas de teste.

- **core:** fixtures HTML servidas pelo próprio `server.js` — uma com violação conhecida
  (botão sem nome acessível) e uma limpa. Provam `runAxeAudit`, `captureAriaSnapshot`, a
  gravação dos artefatos por `captureCells` (e o default `collectA11y: true`), e que falha
  de coleta não derruba a captura visual.
- **web:** `computeA11y` e `hasA11yDivergence` com captures fake cobrindo violação,
  mismatch ARIA, erro de coleta e caso limpo; parsing dos flags novos em `args.js`;
  render da galeria com manifesto novo e antigo (compatibilidade).
- **E2E:** run real contra o consumidor tangerina (`--repo tangerina --component tgr-button`),
  verificando artefatos gravados, bloco `a11y` no manifesto e comportamento dos flags —
  mesmo fecho da Fase 0.

## Fora de escopo

- Runtime mobile (`anemoi-preset`).
- Motor de regras semânticas próprio.
- Filtro de impacto mínimo no gate.
- Auditoria de páginas inteiras do Storybook (o escopo é o seletor do componente).
