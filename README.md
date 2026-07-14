# Anemoi

O Anemoi gera evidências visuais e valida a paridade de componentes do Tangerina DS entre Web
Components, React e Angular. O fluxo é sempre executado na raiz deste repositório e aponta para um
checkout local do `tangerina-web-core` por alias.

```bash
npm install
npm run web:configure -- --alias tangerina --repo /absolute/path/to/tangerina-web-core
npm run web -- --repo tangerina --doctor
npm run web -- --repo tangerina --component tgr-button --card CDCOM-123
```

## Requisitos

- Node.js 24.13.1.
- npm 7 ou superior, com suporte a workspaces.
- pnpm 9 ou superior disponível no `PATH`; ele executa os builds do checkout Tangerina.
- Chromium do Playwright instalado. Se o doctor apontar sua ausência, execute
  `npx playwright install chromium` na raiz do Anemoi.

O `npm install` instala os workspaces e também prepara os harnesses isolados de React e Angular.
Para reinstalar somente os harnesses, use `npm run setup:harnesses`.

## Uso Web

O comando de configuração grava o arquivo local e ignorado `.anemoi.local.json`. O exemplo
versionado [.anemoi.local.example.json](.anemoi.local.example.json) documenta o formato. O primeiro
alias configurado se torna o padrão; passe `--default` para tornar outro alias o padrão.

O Anemoi valida o checkout consumidor, executa os builds necessários, lê as stories CSF, renderiza
o mesmo estado nos três frameworks e grava o resultado no próprio checkout consumidor em:

```text
outputs/anemoi-web/<card>/<componente>/<timestamp>-<id>/
```

O bundle contém `manifest.json`, `summary.md`, screenshots, diffs e uma galeria offline
`index.html`. Consulte o [guia completo do Anemoi Web](docs/guides/web.md) para flags, ordem de
build, falhas e interpretação da paridade. A visão estrutural está em
[Arquitetura](docs/architecture.md).

## Pacotes

| Caminho | Responsabilidade |
| --- | --- |
| `packages/core` | Captura Playwright, matriz, diff, servidor estático e geração do bundle. |
| `packages/web` | Configuração, integração Tangerina, stories, hosts WC/React/Angular, doctor e paridade. |
| `anemoi-preset` | Runtime React Native/Detox preservado e separado; será movido para `packages/mobile`. |
| `gol-adapter-detox` | Integração atual do GOL_APP_Mobile; será movida para `integrations/gol-app-mobile`. |

## Testes

```bash
npm test
```

O Web concluiu sua aceitação real. A modularização Mobile permanece pendente e está especificada no
[plano de implementação Mobile](docs/superpowers/plans/2026-07-13-anemoi-mobile-modularization.md).
