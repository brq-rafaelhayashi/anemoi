# Anemoi

Bancada de evidência visual do Tangerina DS: captura, diffa e empacota screenshots de componentes
para provar visualmente um fix ou uma feature, antes de abrir PR. Cobre três frentes — web
(Storybook/Lit), paridade cross-framework (Web Component × React × Angular) e mobile (React
Native/Detox) — sobre um núcleo comum de captura, diff e output.

## Pacotes

| Pacote | O que é |
| --- | --- |
| `anemoi-core` | Núcleo agnóstico de framework: matrix de captura, captura via Playwright, diff via pixelmatch, git-stash (before/after) e output (manifest + HTML) + doctor. |
| `anemoi-web` | Adaptador fino sobre o core para Storybook/Lit — evidência de web components. |
| `anemoi-cross` | Adaptador Stencil cross-framework: renderiza um componente como Web Component puro, React e Angular e faz diff de paridade de pixels (react×wc, angular×wc). Roda contra um repo consumidor via `--repo`. |
| `anemoi-preset` | Preset React Native + Detox (mobile), autocontido; consumido por um app via symlink. |
| `gol-adapter-detox` | Adaptador Detox específico do GOL_APP_Mobile — **não é membro do npm workspace**; consumido via symlink pelo app. |

## Requisitos

- Node **24.13.1** (`nvm use` — não há `.nvmrc` neste repo ainda; use essa versão, alinhada ao
  restante do ecossistema Tangerina).
- npm **>= 7** (suporte a workspaces).
- Chromium do Playwright instalado (dependência do `anemoi-core`, usada para captura). Instale com:

  ```bash
  npx playwright install chromium
  ```

  Para checar se já está instalado, rode o doctor (ver abaixo) — ele reporta o Chromium junto com
  os outros pré-requisitos.

## Setup

Uma vez, na raiz deste repo:

```bash
npm install
```

Isso resolve as dependências de todos os workspaces (`anemoi-core`, `anemoi-web`, `anemoi-cross`,
`anemoi-preset`).

## Rodar (cross-framework, web)

O `anemoi-cross` roda **a partir daqui** (raiz do anemoi) e mira um repo consumidor via `--repo`
— tipicamente o `tangerina-web-core`. Pré-requisito: o repo consumidor precisa ter buildado a si
mesmo primeiro (`pnpm build`, na raiz dele), para que os wrappers React/Angular e o Storybook
estejam disponíveis para os harnesses.

```bash
cd ~/Developer/projects/anemoi
npm install                      # uma vez

# doctor — confere repo, Storybook, wrappers buildados e Chromium
npm run cross -- --doctor --repo ~/Documents/projects/tangerina-ds/tangerina-web-core

# captura — paridade wc × react × angular
npm run cross -- --repo ~/Documents/projects/tangerina-ds/tangerina-web-core \
  --component tgr-button --frameworks wc,react,angular \
  --themes light,dark --viewports sm,lg --brands gol
```

Os outputs caem em `<repo>/outputs/anemoi-cross/<card>/<component>/<timestamp>/` (manifest.json,
summary.md, prints e um `index.html` de galeria). `<card>` é opcional (`--card`); sem ele, usa
`sem-card`.

## Rodar (web, Storybook/Lit)

```bash
npm run web -- <args>
```

Ver `anemoi-web/` para os flags específicos desse adaptador.

## Testes

```bash
npm test --workspaces
```

## TODO — repontar mobile

O lado `GOL_APP_Mobile` (app) ainda não foi migrado para consumir este repo. Hoje o app continua
apontando para a fonte antiga (BRQ-AI). Falta:

- Repontar os symlinks do app (`detox/`, `packages/ds-evidence-preset`) para este repo.
- Renomear o symlink do app de `packages/ds-evidence-preset` para `packages/anemoi-preset`.
- Atualizar `metro.config.js` do app e `scripts/metro/tangerinaSourceConfig.js`.
- Atualizar o script `ds:evidence` do app.
- Atualizar o deep link `automation/ds`.
- Atualizar a ADR 0003 (`anemoi-preset/docs/adr/0003-fonte-canonica-brq-ai-symlink.md`) para
  refletir a nova fonte canônica.

Esses artefatos (`ds:evidence`, `ds-evidence.config.js`, os symlinks, o deep link `automation/ds`,
os testIDs `ds-evidence-*` da Gallery) são contrato do lado do app e foram **intencionalmente**
deixados com o nome legado `ds-evidence` até esse repontamento acontecer — ver
`gol-adapter-detox/CONTEXT.md`.
