# Arquitetura do Anemoi

Este documento é o mapa canônico do Anemoi. O produto Web roda a partir deste repositório, consome
um checkout configurado do `tangerina-web-core` e mantém captura, comparação e publicação local de
evidências sob limites explícitos.

## Direção das dependências

```text
packages/web -> packages/core
packages/web -> configured tangerina-web-core checkout
tangerina-web-core -/-> anemoi (no symlink or source dependency)
anemoi-preset -/-> packages/core (separate runtime)
```

Em outras palavras:

- `packages/core` oferece primitivas de browser: matriz, servidor estático, captura Playwright,
  comparação de pixels e geração de output.
- `packages/web` orquestra o caso de uso e conhece o contrato do Tangerina, as stories CSF, os
  wrappers e os hosts de renderização.
- O checkout configurado do `tangerina-web-core` fornece fontes, artefatos e scripts de build. Ele
  não depende do Anemoi por symlink, import de fonte ou pacote.
- `anemoi-preset` continua sendo um runtime React Native/Detox separado e não depende de
  `packages/core`.

## Fluxo Web

```text
alias ou caminho
  -> validação do checkout Tangerina
  -> builds do consumidor
  -> Storybook estático e harnesses
  -> stories e args CSF
  -> matriz WC/React/Angular
  -> screenshots
  -> diffs contra WC
  -> manifest, resumo e galeria offline
```

O Web Component (WC) é a linha de base visual. As stories CSF do Tangerina são o registro único de
variações: o Anemoi combina `meta.args` e `story.args` e entrega os mesmos argumentos aos hosts React
e Angular. O WC usa a própria story do Storybook, preservando o comportamento nativo do componente.

Quando React ou Angular são solicitados sem WC, o WC é incluído automaticamente porque a comparação
precisa da linha de base. Cada grupo de paridade compara `react-versus-wc` e
`angular-versus-wc` por pixels na área comum das imagens.

## Contrato com o Tangerina

O checkout consumidor precisa se identificar como `tangerina-web-core`, executar com pnpm 9 ou
superior e oferecer os scripts e artefatos validados pelo doctor. A declaração `packageManager` é
opcional; quando presente, também deve indicar pnpm 9 ou superior. O Anemoi pode executar os scripts normais de
build, que por natureza podem atualizar artefatos gerados, mas nunca executa operações Git no
consumidor: não faz `stash`, `reset`, `checkout`, limpeza, commit ou alteração de branches.

A configuração por máquina fica em `.anemoi.local.json`, ignorado pelo Git. O arquivo
`.anemoi.local.example.json` é o contrato versionado para aliases. Um caminho direto continua aceito
como substituição explícita do alias.

## Limites dos pacotes

`packages/core` não conhece Tangerina, CSF nem wrappers. `packages/web` é responsável por traduzir
o contrato do consumidor para as primitivas do core. Os harnesses React e Angular possuem árvores de
dependências isoladas para evitar conflito de runtimes e recebem por build os caminhos absolutos do
checkout configurado.

O runtime Mobile permanece separado porque usa React Native, Detox, dispositivos e contratos de
aplicativo host, enquanto o core Web usa Playwright e servidores estáticos. Código só deve ser
compartilhado quando os contratos dos dois runtimes forem equivalentes.

## Outputs e falhas

Cada execução grava um diretório próprio em
`<tangerina-web-core>/outputs/anemoi-web/<card>/<componente>/<timestamp>/`. Um sucesso publica
`manifest.json` com `tool: "Anemoi Web"` e `status: "passed"`, screenshots, diffs, `summary.md` e
`index.html` offline.

Uma falha preserva logs e um `manifest.json` com `status: "failed"`, estágio, erro e caminho do log.
O `index.html` não é publicado em execuções incompletas, evitando que evidência parcial seja tomada
como válida. Servidores e browsers são encerrados mesmo quando há erro.
