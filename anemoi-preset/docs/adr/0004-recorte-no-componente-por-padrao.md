# ADR 0004: Recorte no componente por padrão

## Status

Accepted

## Context

A captura de evidências abre a galeria (`DsEvidenceScreen`) via Detox, tira um
screenshot da tela inteira e recorta (`sharp`) a região indicada por
`targetTestID`, resolvido na hierarquia de views nativa
(`device.generateViewHierarchyXml`).

O resultado prático eram prints em tela cheia, com muito espaço vazio, inflando
o relatório HTML. A causa era de configuração: 21 dos 27 flows do `registry.json`
apontavam `targetTestID: "ds-evidence-screen"` — a própria tela. O crop
"funcionava" (`cropped: true`), mas recortava o screen inteiro.

A dívida existia porque apontar o `targetTestID` para o `testID` do componente
Tangerina (`ds-evidence-search`, etc.) nem sempre propagava para a árvore nativa
do React Native — o frame não resolvia no XML e o crop caía em fallback. A saída
na época foi recuar para `ds-evidence-screen` (sempre resolve, mas é a tela toda).

Existe um wrapper `<View testID="ds-evidence-target">` que envolve apenas o
componente (`DsEvidenceScreen.js`). Por ser uma `View` nativa real com testID
explícito, o frame **sempre resolve** no XML. Como o teste navega um flow por
captura (`?flows=<flowId>`), existe exatamente um `ds-evidence-target` na tela no
momento do print, então o match por frame é inequívoco.

## Decision

O recorte no componente passa a ser o **padrão permanente da galeria**, por
convenção (*convention over configuration*):

- O default de `targetTestID` em `detoxEvidenceTest.js` (`normalizeFlow`) é
  **`ds-evidence-target`** — não mais `ds-evidence-flow-<flowId>`.
- O padrão vive no **código**, não copiado em cada entrada do registry. O
  `registry.json` declara apenas **exceções**: flows que recortam um container
  próprio agrupado ou que são overlay.

Exceções atuais (mantêm `targetTestID` explícito):

- `Drawer` → `ds-evidence-drawer-content` (`overlay: true`, print em tela cheia).
- `CountryFlag` (flow `flags`) → `ds-evidence-country-flags`.
- `ListNavigation` → `ds-evidence-list-navigation-items`.
- `ListSelect` → `ds-evidence-list-select-deprecated-items` / `-new-items`.
- `InputCounter` → `ds-evidence-input-counter` (alvo específico que resolve no XML
  e recorta mais justo que o wrapper).

## Consequences

- Qualquer flow novo, sem `targetTestID`, recorta no componente automaticamente —
  ninguém precisa configurar crop por flow.
- O `registry.json` encolhe e passa a destacar só o que foge da regra.
- `ds-evidence-screen` deixa de ser alvo de recorte de flow; segue sendo lido para
  calcular a escala do screenshot vs. o frame nativo.
- O testID derivado de `flowId` (`ds-evidence-flow-<flowId>`) deixa de ser o default
  de recorte; continua existindo na galeria apenas para identificação por flow.
- Abandonados: `ds-evidence-screen` como default (recorta a tela toda) e o testID do
  componente Tangerina (nem sempre propaga para a árvore nativa → fallback).
