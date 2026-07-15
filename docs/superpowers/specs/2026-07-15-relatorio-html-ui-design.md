# Melhorias de UI no relatório HTML de evidência (anemoi web)

**Data:** 2026-07-15
**Escopo:** template do relatório em `packages/core/src/output.js` (`renderHtml`) e dados de paridade em `packages/web/src/parity.js`.

## Contexto e problema

O relatório de paridade (layout matriz: célula × frameworks) tem três problemas de comunicação:

1. **Badge `react 780px`** — o número é a contagem crua de pixels divergentes retornada pelo `pixelmatch`. Sem a área total, não diz nada (780 pode ser 0,5% ou 40%). Além disso, os PNGs de diff já são gerados em `diff/<fw>-vs-wc/*.png` e o `diffPath` já está no manifest, mas o relatório não linka para eles.
2. **Cabeçalho `✗ 6240px de divergência`** — soma global de pixels divergentes; não aponta onde está o problema. O motor não sabe qual *prop* causou a divergência (só compara imagens); o máximo honesto é apontar quais células/stories divergem.
3. **Prints minúsculos** — `.shot` tem largura fixa de 150px. Em tela cheia os componentes ficam pequenos com muito espaço vazio em volta. A captura é do elemento (bounding box) com `deviceScaleFactor: 2`, então os PNGs têm larguras naturais muito variadas (full-width ≈ 1560px; botão sm ≈ 300px).

## Decisões de design

### 1. Badge de paridade: percentual + clique abre o diff

- `computeParity` (`packages/web/src/parity.js`) passa a guardar `width` e `height` retornados por `writeDiff` em cada entrada de `parity` (hoje só guarda `mismatch` e `diffPath`).
- O badge exibe percentual: `react ✗ 2,1%` = `mismatch / (width × height)`, com 1 casa decimal; valores abaixo de 0,1% exibem `<0,1%`.
- Badge com mismatch > 0 é clicável: abre o lightbox existente com uma aba extra **Diff** ao lado de WC/React/Angular, mostrando o PNG de diff (`diffPath`). A navegação por ← → inclui a aba Diff.
- Badge `✓` (mismatch = 0) permanece como está, não clicável.

### 2. Cabeçalho: chips por story divergente

- Substitui `✗ Npx de divergência` por um chip por story que tenha ao menos uma célula com mismatch > 0, com contagem de células afetadas: `✗ Com Icone (4 células) · ✗ Loading (2 células)`.
- Clique no chip aplica o filtro de story existente: liga apenas aquela story (desliga as demais), levando o leitor direto às linhas com problema.
- Estados `✓ paridade total (N prints)` e `N prints · sem paridade (framework único)` permanecem inalterados.

### 3. Prints em tamanho real (1:1 CSS px)

- Cada `<img class="shot">` é exibido em `naturalWidth / 2` CSS px (compensa o retina 2x da captura), via JS no evento `load` — sem gravar dimensões no manifest.
- Cada célula de framework ganha um wrapper com `overflow-x: auto`: prints largos (full-width 780) rolam dentro da própria célula sem quebrar o layout de matriz.
- Remove a largura implícita de 150px das colunas; reduz padding das células de `12px 16px` para `8px 12px`.
- O lightbox permanece como meio de ampliar/comparar.

**Racional da escolha:** fidelidade pixel-perfect foi preferida sobre "escala do viewport" (proporcional à coluna) e "preencher a coluna" (que distorce a relação de escala entre células). O custo aceito é scroll horizontal por célula em telas menores que o print.

## Alternativas descartadas

- **Divergência por prop:** exigiria comparar DOM/estilos computados entre frameworks — outra arquitetura. Fica como evolução futura.
- **Escala do viewport / preencher coluna / zoom S-M-G:** descartadas em favor do 1:1 real.
- **Severidade sem número (✓/✗ colorido):** descartada; o percentual é mais informativo.

## Testes

- `packages/web/test/parity.test.js` (ou equivalente): entradas de `parity` incluem `width`/`height`.
- `packages/core/test/output.test.js`: HTML contém percentual no badge (não mais `px`), chips por story divergente no cabeçalho, aba Diff no lightbox, ausência do `width:150px` fixo e presença do wrapper com `overflow-x`.

## Fora de escopo

- Upload/anexo automático em Jira (regra existente do motor: nunca faz upload).
- Mudanças no fluxo de captura ou no cálculo do pixelmatch (threshold permanece 0.1).
- Divergência por prop (DOM/estilos computados).
