# Anemoi

Glossário do domínio da bancada de evidência visual do Tangerina DS no GOL_APP_Mobile. **Anemoi** é a
marca da ferramenta; a marca e o slug técnico foram unificados — env vars `ANEMOI_*`, diretório de
saída `outputs/anemoi/`, path do registry `detox/anemoi/registry.json`, pacote `@gol-smiles/anemoi-preset`
—, revertendo a decisão original de preservar o slug legado `ds-evidence`. Sobrevivem com o nome
legado apenas os artefatos que são contrato do lado do app (`GOL_APP_Mobile`) e ainda não foram
repontados com o mobile: o script `yarn ds:evidence`, o arquivo `ds-evidence.config.js` (raiz do app),
os symlinks (`packages/ds-evidence-preset`, `detox/`), o deep link `automation/ds` e os testIDs da
Gallery (`ds-evidence-screen`, `ds-evidence-target`, etc.). Este arquivo é a fonte da linguagem; o
guia operacional é `docs/anemoi.md` e as decisões arquiteturais vivem em `docs/adr/` e
`../anemoi-preset/docs/adr/`.

## Language

**Modo Package**:
O app consumindo o Tangerina publicado no npm (6.0.2) + correções do patch-package — o estado shippado.
_Avoid_: modo normal, modo npm

**Modo Source**:
O app resolvendo o Tangerina direto do `src/` do repo DS local (6.0.5) via Metro. É onde a evidência
before/after é capturada.
_Avoid_: modo local, modo dev

**Antes/Depois**:
O par de capturas que prova um fix: **Depois** = working tree do DS com o fix; **Antes** = o mesmo
source sem as mudanças do componente. Ambos em Modo Source — nunca comparar Package vs Source (drift
de versão contaminaria a evidência).
_Avoid_: before/after misturado com com/sem patch

**Toggle do Componente**:
A alternância Antes/Depois escopada **apenas aos arquivos do componente** em teste, preservando todo o
resto do working tree (que pode conter trabalho não commitado). Crash-safety é obrigatória: a execução
detecta e bloqueia resíduo de toggle de runs anteriores.
_Avoid_: reset, checkout

**Fluxo de Evidência**:
A unidade selecionável de captura de um componente (`flowId` no registry), com categoria `appScreen`
(tela real do app) ou `testState` (estado montado na Gallery). Flows `overlay` rendem em janela
separada (Modal/Drawer) e têm regras próprias de matching e screenshot.
_Avoid_: cenário (legado `scenarioId`), caso de teste

**Gallery**:
A tela de automação (`DsEvidenceScreen`, rota `automation/ds/<Componente>`) que monta componentes
isolados com props espelhadas das telas reais. Existe apenas em build de automação (`__DEV__` +
`E2E=true` — gate **de build**, não de runtime: um build comum de dev não a contém).
_Avoid_: showcase, storybook

**Registry**:
O catálogo (`detox/anemoi/registry.json`) que declara, por componente, seus Fluxos de Evidência e
suas referências de tela real. Componente fora do registry não é capturável. Sincronização com o DS é
manual.
_Avoid_: manifest (que é o artefato de saída), config

**Bundle de Evidência**:
O diretório de saída de uma run (`outputs/anemoi/<card>/<Componente>/<timestamp>/`): prints,
hierarquias, `manifest.json`, `summary.md` e HTML opcional. É o que se anexa ao card.
_Avoid_: outputs (genérico), relatório (que é o HTML)

**Escada de Evidência**:
A prova certa para cada tipo de mudança: **Tier 1** assert RTL no repo do DS, **Tier 2** print de
regressão, **Tier 3** dump da hierarquia nativa (Android). Mudanças de a11y não mudam pixel — exigir
print "diferente" delas é pedir a prova errada.

**Guarda de Regressão**:
Print Antes/Depois pixel-idêntico em mudança 100% a11y: não prova o fix (o Tier 1 prova), prova que o
fix **não quebrou o visual**. O bundle declara explicitamente "pixels idênticos = esperado".
_Avoid_: evidência fraca, print inútil

**Print de Referência**:
Screenshot pós-fix obrigatório mesmo em cards sem delta visual (a11y pura): registra o estado real do
componente na data da entrega. Nunca fabricar evidência — só entra com status o que foi verificado em
artefato real.

**Validação do Fix**:
A verificação humana final de a11y — leitor de tela (VoiceOver/TalkBack) sobre build staging pós-merge.
A bancada produz a evidência mecânica; a validação do fix é processo de QA, fora da bancada.

## Relationships

- Um **Componente** do registry tem um ou mais **Fluxos de Evidência**; cada run captura os flows
  selecionados nas fases **Antes/Depois** (via **Toggle do Componente**, em **Modo Source**)
- Cada run produz exatamente um **Bundle de Evidência**; o HTML é parte opcional dele
- A **Escada de Evidência** decide o artefato exigido; a **Guarda de Regressão** e o **Print de
  Referência** são os degraus visuais dela para mudanças a11y
- A **Gallery** serve os flows `testState`; flows `appScreen` apontam telas reais do app
- A **Validação do Fix** consome o Bundle, mas acontece fora da bancada

## Ecossistema

O Anemoi é um dos dois contextos do ecossistema gol-ds:

- **Anemoi (este contexto)** — evidência visual before/after de componentes do Tangerina DS.
- **Trinca gol-ds** — skills `gol-ds-analyse` → `gol-ds-port` → `gol-ds-create-pr` que trabalham os
  cards CDCOM. Glossário canônico: `skills/gol-ds-analyse/CONTEXT.md` no repo BRQ-AI. A port/analyse
  invocam `yarn ds:evidence` para gerar evidência; o Anemoi não conhece a trinca.

Mapa dos contextos: `CONTEXT-MAP.md` na raiz do repo BRQ-AI.

## Flagged ambiguities

- "before/after" era usado tanto para Antes/Depois (Modo Source, fases da run) quanto para com/sem
  patch (Package vs Source) — resolvido: Antes/Depois é sempre dentro do Modo Source; com/sem patch
  existe só para paridade patch≡source no cleanup.
- "print igual = nada mudou" — resolvido: em mudança a11y, pixel idêntico é o **esperado** (Guarda de
  Regressão); a prova do fix é o Tier 1.
- "rodar com --skip-build em build comum de dev" — resolvido: a Gallery é gate **de build**
  (`E2E=true` baked via ENVFILE); binário não-automação não a contém e o deep link falha silencioso.
