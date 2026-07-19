# Anemoi

O Anemoi gera evidências visuais e valida a paridade de componentes do Tangerina DS entre Web
Components, React e Angular. O fluxo é sempre executado na raiz deste repositório e aponta para um
checkout local do `tangerina-web-core` por alias.

```bash
npm install
npx playwright install chromium firefox webkit
npm run web:configure -- --alias tangerina --repo /absolute/path/to/tangerina-web-core
npm run web -- --repo tangerina --doctor
npm run web -- --repo tangerina --component tgr-button --card CDCOM-123
npm run web -- --repo tangerina --component tgr-button --review-contract
```

## Requisitos

- Node.js 24.13.1.
- npm 7 ou superior, com suporte a workspaces.
- pnpm 9 ou superior disponível no `PATH`; ele executa os builds do checkout Tangerina.
- Chromium, Firefox e WebKit da versão fixada do Playwright instalados. Se o doctor apontar alguma
  ausência, execute `npx playwright install chromium firefox webkit` na raiz do Anemoi.

O `npm install` instala os workspaces e também prepara os harnesses isolados de WC, React e Angular.
Para reinstalar somente os harnesses, use `npm run setup:harnesses`.

## Uso Web

O comando de configuração grava o arquivo local e ignorado `.anemoi.local.json`. O exemplo
versionado [.anemoi.local.example.json](.anemoi.local.example.json) documenta o formato. O primeiro
alias configurado se torna o padrão; passe `--default` para tornar outro alias o padrão.

O Anemoi valida o checkout consumidor, a Matriz de Suporte e o contrato versionado do componente,
executa os builds necessários e roda uma spec Playwright Test nativa. Cada unidade lógica cobre uma
Cena em um browser e executa WC, React e Angular como steps. O resultado fica no próprio checkout
consumidor em:

```text
outputs/anemoi-web/<card>/<componente>/<timestamp>-<id>/
```

O bundle contém o plano imutável `run-plan.json`, Resultados Atômicos por tentativa,
`manifest.json` v2, `summary.md`, screenshots, diffs, diagnósticos e uma galeria offline
`index.html`. O gate fail-closed separa cobertura de browsers, paridade visual, dimensões, Axe,
ARIA, conformidade comportamental, paridade comportamental, cobertura do contrato e estabilidade.
Consulte o [guia completo do Anemoi Web](docs/guides/web.md) para flags, builds e interpretação do
gate. A visão estrutural está em
[Arquitetura](docs/architecture.md).

## Pacotes

| Caminho | Responsabilidade |
| --- | --- |
| `packages/core` | Primitivas de captura, diff, acessibilidade, servidor estático e manifestos. |
| `packages/web` | Preflight, Playwright Test, contratos, hosts WC/React/Angular, gate e publicação Web. |
| `packages/service` | Serviço local Koba; mantém o pipeline legado de captura somente por compatibilidade. |
| `anemoi-preset` | Runtime React Native/Detox preservado e separado; será movido para `packages/mobile`. |
| `gol-adapter-detox` | Integração atual do GOL_APP_Mobile; será movida para `integrations/gol-app-mobile`. |

## Testes

```bash
npm test
```

Evidência do cutover em 2026-07-19: o pipeline foi exercitado em Chromium, Firefox e WebKit, com
156 Resultados Atômicos `stable`, 468 capturas, zero `flaky` e galeria offline com 684 referências
validadas sem falha. O gate real do consumidor **não foi aprovado** (`status: "failed"`, `trusted: false`):
144 falhas Axe `color-contrast` no tema dark, 12 falhas `behavioralConformance` no roteiro `loading`
e 60 falhas finais em `stability`; paridades e cobertura passaram. Consulte o
[registro do cutover](docs/migration/2026-07-18-playwright-test-tgr-button-cutover.md).

A modularização Mobile permanece pendente e está especificada no [plano de implementação
Mobile](docs/superpowers/plans/2026-07-13-anemoi-mobile-modularization.md).
