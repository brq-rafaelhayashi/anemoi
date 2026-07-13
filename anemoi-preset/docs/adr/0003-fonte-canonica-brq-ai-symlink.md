# ADR 0003: Fonte canônica no BRQ-AI, consumo via symlink

## Status

Accepted

## Context

O preset e o adaptador GOL nasceram dentro do `GOL_APP_Mobile` como diretórios intencionalmente
untracked (`packages/ds-evidence-preset/`, `detox/` — bancada local, nunca mergeada no app).
Consequência: 1.800+ linhas de orquestrador sem nenhum histórico git, sem rollback para refactors
(ex.: Metro compartilhado) e com backups ad-hoc por git-patch solto na raiz do app.

Alternativas consideradas: git aninhado na bancada (sem remote, sem review), repo dedicado com
symlinks (mais um repo para gerir), app canônico com espelho de backup (review no espelho não
governa a fonte) e cópia+sync (reintroduz o drift de duas cópias).

## Decision

A fonte canônica vive no repo **BRQ-AI** (mesmo precedente da skill `gol-ds-create-pr`):

- `anemoi/ds-evidence-preset/` — o preset app-agnostic.
- `anemoi/gol-adapter-detox/` — o adaptador GOL (jest.config, .detoxrc, registry, testes, docs/ADRs).

O app consome via symlink (`packages/ds-evidence-preset` e `detox/` → BRQ-AI) e continua untracked.
Ficam físicos no app apenas o per-app: `ds-evidence.config.js` (raiz) e `outputs/`.

Regras de resolução exigidas pelo symlink (Node resolve `require` pelo realpath, onde não há
`node_modules`):

1. Dependências do host (`metro-config`, `sharp`) via `hostRequire` (`createRequire` ancorado em
   `process.cwd()` — todos os entry points rodam da raiz do app).
2. Preset ↔ adaptador se referenciam como irmãos (`../ds-evidence-preset/`), nunca via caminho do app.
3. `ds-evidence.config.js` e o pacote `detox` (globalSetup/reporter/testEnvironment do jest.config)
   resolvidos pelo cwd do host; `rootDir` do jest = o próprio adaptador (`__dirname`).

## Consequences

- Histórico, diff e review reais para preset e adaptador; compartilhável com outros devs via BRQ-AI.
- Smoke de validação (Search, iOS, Metro compartilhado) passou via symlink — bundle correto nas
  fases Antes/Depois, sem staleness.
- Fallback documentado: se symlink quebrar em algum host futuro, usar cópia física no app com sync
  a partir do BRQ-AI (drift consciente, último recurso).
- O preset deixa de pressupor que vive sob a raiz do host: qualquer require novo de dependência do
  host deve usar `hostRequire`.
