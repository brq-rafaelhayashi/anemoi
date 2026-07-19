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
- `packages/web` orquestra o caso de uso, mantém Cenas e Contratos Comportamentais e conhece os
  wrappers e hosts de renderização do Tangerina.
- `packages/service` preserva o fluxo local do Koba sobre `capturePipeline`; esse pipeline é uma
  interface de compatibilidade e não participa do executor Web canônico.
- O checkout configurado do `tangerina-web-core` fornece fontes, artefatos e scripts de build. Ele
  não depende do Anemoi por symlink, import de fonte ou pacote.
- `anemoi-preset` continua sendo um runtime React Native/Detox separado e não depende de
  `packages/core`.

## Fluxo Web

```text
alias ou caminho
  -> validação do checkout Tangerina
  -> preflight (suporte + superfície + contrato + builds)
  -> run-plan.json imutável
  -> Playwright Test (Chromium + Firefox + WebKit)
  -> Resultados Atômicos por tentativa
  -> finalizador fail-closed
  -> manifest.json v2, resumo e galeria offline
```

O Web Component (WC) é a linha de base visual e semântica de React e Angular dentro da mesma engine;
pixels nunca são comparados entre browsers. As Cenas, o Contrato Comportamental, o fingerprint da
superfície pública e a spec Playwright nativa pertencem ao Anemoi. A Matriz de Suporte versionada
pertence ao Tangerina e define os browsers obrigatórios.

Cada teste lógico representa uma Cena, ambiente e viewport em uma engine. WC, React e Angular rodam
como steps isolados da mesma unidade. Cada Roteiro remonta a Cena, coleta observações canônicas e
avalia duas provas independentes: conformidade de cada framework com o contrato e igualdade exata
das observações normalizadas entre wrappers.

## Contrato com o Tangerina

O checkout consumidor precisa se identificar como `tangerina-web-core`, publicar
`packages/components/browser-support.json`, executar com pnpm 9 ou superior e oferecer os scripts e
artefatos validados pelo doctor. A declaração `packageManager` é
opcional; quando presente, também deve indicar pnpm 9 ou superior. O Anemoi pode executar os scripts normais de
build, que por natureza podem atualizar artefatos gerados, mas nunca executa operações Git no
consumidor: não faz `stash`, `reset`, `checkout`, limpeza, commit ou alteração de branches.

A configuração por máquina fica em `.anemoi.local.json`, ignorado pelo Git. O arquivo
`.anemoi.local.example.json` é o contrato versionado para aliases. Um caminho direto continua aceito
como substituição explícita do alias.

## Limites dos pacotes

`packages/core` não conhece Tangerina, Cenas nem wrappers. `packages/web` é responsável por traduzir
o contrato do consumidor para as primitivas do core. Os harnesses React e Angular possuem árvores de
dependências isoladas para evitar conflito de runtimes e recebem por build os caminhos absolutos do
checkout configurado. O harness WC também é independente do Storybook.

`capturePipeline`, exportado por `packages/web`, permanece deprecated exclusivamente para o
`packages/service`/Koba. O CLI `npm run web` não o usa: seu fluxo canônico é preflight, Playwright
Test, Resultados Atômicos e finalizador.

O runtime Mobile permanece separado porque usa React Native, Detox, dispositivos e contratos de
aplicativo host, enquanto o core Web usa Playwright e servidores estáticos. Código só deve ser
compartilhado quando os contratos dos dois runtimes forem equivalentes.

## Outputs e falhas

Cada execução grava um diretório próprio em
`<tangerina-web-core>/outputs/anemoi-web/<card>/<componente>/<timestamp>-<id>/`. O identificador
aleatório evita colisões entre execuções iniciadas no mesmo instante. O preflight publica uma única
vez `run-plan.json`; workers nunca escrevem o manifesto compartilhado. Cada tentativa grava por
rename atômico `results/<teste-logico>/attempt-<n>/result.json` junto das evidências e attachments da
própria tentativa. O finalizador exige exatamente a matriz planejada, consolida retries como
`stable` ou `flaky` e só então publica `summary.md`, `index.html` e `manifest.json` v2.

O Gate de Confiabilidade é fail-closed: dimensão obrigatória reprovada ou indisponível impede
`trusted: true`; qualquer `flaky` reprova estabilidade. Um filtro de browsers/eixos ou `--no-a11y`
marca o plano como diagnóstico, cujo gate é `not-approved` e nunca confiável. Falhas de execução
preservam o log e um manifesto de falha com o estágio quando possível. Servidores e browsers são
encerrados mesmo quando há erro.
