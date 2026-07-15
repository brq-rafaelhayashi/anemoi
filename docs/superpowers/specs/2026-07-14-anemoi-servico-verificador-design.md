# Anemoi como serviço verificador do Koba — Design

- **Data:** 2026-07-14
- **Status:** aprovado em brainstorming (aguardando plano de implementação)
- **Origem:** `2026-07-14_1454_plano-anemoi-servico-verificador.md` e `2026-07-14_1441_comparacao-koba-anemoi-seams-integracao.md`, validados contra o código real do Koba (`matheusBrqRocha/koba@9d02668`)

## Objetivo

Dar ao Koba um botão "Verificar" na tela `/compare` que gera evidência objetiva de paridade (diff de pixels) do **exato estado** que o dev configurou no painel, usando o Anemoi como serviço HTTP local de captura + diff.

## Decisões tomadas

| Decisão | Escolha |
| --- | --- |
| Abordagem | **A — serviço fino sobre o Koba vivo ("Forma 1.5")**: Playwright captura os panes do `/compare` do próprio Koba; sem builds de harness |
| Baseline de paridade | **Ambos, em fases.** Fase 1: React×Angular (panes do `/compare`, zero mudança estrutural no Koba). Fase 2: rota WC no Koba → react×wc / angular×wc (padrão-ouro) |
| Gatilho | Botão manual "Verificar" no `/compare` do Koba, com polling |
| Onde roda | Local, na máquina do dev (porta 9200), ao lado do Koba (9000) |
| Modo da API | `mode: "state"` implementado; `mode: "stories"` (Forma 2 / CI) reservado no contrato, não implementado |

### Fundamentos verificados no código

- `captureCells(cells, host, baseUrl, …)` do core já é host-agnóstico (`host = {urlFor, selectorFor, verify?}`) — plugar o Koba vivo é escrever um host novo, sem tocar no core (`packages/core/src/capture.js`).
- No Koba, `/compare/<key>?state=` aplica o estado (`useCompareStage` lê `location.search` via `parseCompareState`) e os panes têm classes estáveis (`.koba-compare__pane--react` / `--angular`).
- O parse do Koba é defensivo: descarta estado com `componentKey` divergente e faz merge sobre os defaults do catálogo. O catálogo é público em `GET /catalog.json` (derivado ao vivo de `docs.json` + stories).
- As rotas `/react` e `/angular` **não** aplicam `?state=`, e não existe render WC cru nem eixos theme/brand/viewport no Koba — por isso o baseline WC fica para a fase 2.
- Por capturar panes lado a lado, a largura efetiva de cada framework é ~metade do viewport da página. O eixo viewport existe mas com fidelidade reduzida na fase 1; fidelidade total exige as rotas isoladas da fase 2.

### Por que não a Forma 2 primeiro

A Forma 2 (API-job sobre `runCurrentState`) captura **stories CSF**, não o `CompareState` ad-hoc — o botão "Verificar" no `/compare` não verificaria o que o dev está vendo. Além disso, os builds de harness levam minutos, incompatível com UX de botão. A Forma 2 permanece válida como futuro `mode: "stories"` para CI.

## Arquitetura

Novo workspace `packages/service` (`@gol-smiles/anemoi-service`) no monorepo do Anemoi. Padrões da casa: CommonJS, Node ≥24, `node:test`, sem framework HTTP (`node:http`). Depende de `@gol-smiles/anemoi-core` (captura, diff, output, matriz) e reusa helpers de `@gol-smiles/anemoi-web` (parity, manifest). O core continua sem conhecer Tangerina nem Koba.

```
Koba /compare  ──(botão "Verificar")──►  POST :9200/runs {mode:"state", compareState, axes}
                                           │ 202 {runId}
                                           ▼
                                    fila FIFO em memória (1 run por vez)
                                           │
                    valida compareState contra GET :9000/catalog.json
                                           │
                    captureCells(células, host koba-live, "http://localhost:9000")
                        → navega /compare/<key>?state=... e screenshota
                          .koba-compare__pane--react e --angular
                                           │
                    diff pixel React×Angular → bundle padrão do Anemoi
                    em outputs/anemoi-web/<card>/<componente>/<ts>-<id>/
                                           ▼
Koba (polling)  ◄──  GET :9200/runs/:id  → {status, stage, summary, manifest}
                     GET :9200/runs/:id/gallery/…  → bundle servido via serveStatic
```

Invariantes preservadas:

1. O Anemoi **nunca faz Git** no checkout consumidor.
2. O bundle é **idêntico** ao do CLI (`manifest.json`, `summary.md`, screenshots, diffs, galeria offline) — evidência de estado ad-hoc é arquivável como qualquer outra.
3. A API nasce com o campo `mode` para acomodar `"stories"` sem quebra de contrato.

## Componentes e contratos

### 1. API HTTP (`packages/service/src/server.js` + `routes.js`)

```
POST /runs
  body: {
    mode: "state",                          // único valor na v1
    compareState: {componentKey, props, slots},
    card?: string,                          // default "koba"
    axes?: {viewports?: ["sm","lg"], themes?: ["light"]}
    // v1: viewport aplicado ao tamanho da página; theme reservado para a fase 2
  }
  respostas: 202 {runId} · 422 estado inválido · 503 Koba/DS indisponível

GET /runs/:id
  → {runId, status: queued|running|passed|failed|error,
     stage?, summary?: {cells, mismatches, maxMismatchPx},
     manifestUrl?, galleryUrl?, error?}

GET /runs/:id/gallery/*   → bundle servido via serveStatic do core
```

- CORS restrito à origem do Koba (`http://localhost:9000`, configurável).
- Runs indexados num `Map` em memória; reiniciar o serviço perde o índice, mas os bundles persistem em disco (mesma filosofia do CLI).
- Durante `running`, `stage` expõe a etapa corrente (via `onProgress` do `captureCells`), permitindo "capturando 3/8…" no Koba.

### 2. Host `koba-live` (`packages/service/src/kobaHost.js`)

Implementa o contrato que o `captureCells` já espera:

- `urlFor(cell, baseUrl)` → `${baseUrl}/compare/${componentKey}?${serializeCompareState(state)}`
- `selectorFor(cell)` → `.koba-compare__pane--${cell.framework}` (`react` | `angular`)
- `verify(page, cell)` → espera o custom element `tgr-*` do pane estar definido e hidratado antes do screenshot (mesma técnica dos hosts atuais do anemoi-web)

### 3. Adaptador `compareStateToCells` (`packages/service/src/stateAdapter.js`)

O seam `CompareState ⇄ célula`:

- Busca `GET /catalog.json`; `componentKey` inexistente → 422 (espelha o parse defensivo do Koba, que descartaria o estado silenciosamente).
- Normaliza props contra os defaults do catálogo, para o manifest refletir o estado **efetivo**, não o enviado.
- Produz células `{framework, brand: "gol", storyId: "koba-state-<hash8>", viewport, theme: "light"}` — compatível com `cellRelPath` do core sem alterá-lo; o hash curto do estado dá identidade estável à evidência.

### 4. Configuração

Seção nova `service` no `.anemoi.local.json`: `{port: 9200, kobaBaseUrl: "http://localhost:9000", dsRepo: "../tangerina-web-core"}` — `dsRepo` é o path do checkout do DS onde os bundles são gravados (`outputs/anemoi-web/…`), mesmo destino do CLI. O `doctor` ganha checagens: porta livre, Koba respondendo, `catalog.json` acessível.

### 5. Lado Koba (repo separado, PR próprio)

Componente `verifyPanel` no shell (`root-config/src/compare/`): lê o `CompareState` atual (já publicado via evento `koba:compare-state`), faz `POST /runs`, polling a cada 2s, renderiza badge (✓/✗ + px de divergência + link para `galleryUrl`). Serviço fora do ar → botão desabilitado com tooltip; o Koba funciona normalmente sem o Anemoi.

## Tratamento de erros

Princípio: **o run nunca "some"; todo caminho termina num status consultável.**

| Falha | Onde | Comportamento |
| --- | --- | --- |
| Koba fora do ar / `catalog.json` inacessível | `POST /runs` | 503 imediato com mensagem acionável ("suba o Koba: pnpm dev"); nada enfileirado |
| `componentKey` desconhecido / props inválidas | `POST /runs` | 422 com o motivo; nada enfileirado |
| Pane não renderiza / `tgr-*` não hidrata | run | `verify` falha por timeout (30s, o mesmo do `captureCells`); run vira `error` com a etapa e screenshot da página inteira como diagnóstico no bundle |
| Diff acima do limiar | run | não é erro: run termina `failed` com `summary` e galeria — é o veredito funcionando |
| Crash do worker (Playwright, disco) | run | `try/catch` do job marca `error` com stack resumida; a fila segue para o próximo |
| Serviço reiniciado com run em voo | `GET /runs/:id` | 404 honesto; o Koba mostra "run perdido, dispare de novo" |

## Testes

`node:test`, seguindo o padrão dos pacotes atuais:

1. **Unitários puros** (maioria): `stateAdapter` (estado→células, validação contra fixture do catálogo, hash estável), `kobaHost` (URLs e seletores exatos), máquina de estados do run (queued→running→passed/failed/error), validação do body.
2. **Integração sem Koba real**: fixture HTML estático imitando a estrutura do `/compare` (dois panes com as classes reais), servido pelo `serveStatic`; o serviço roda ponta a ponta contra ele — POST → polling → bundle no disco. Cobre captura, diff e manifest sem depender do repo Koba.
3. **Teste de contrato**: fixture do `catalog.json` real do Koba versionado nos testes; mudanças no formato do catálogo ou do `?state=` quebram aqui primeiro (espelho do `tests/contracts/manifest-catalog.test.ts` do Koba).
4. **Smoke manual documentado**: roteiro no README do pacote para o teste com Koba vivo (subir os dois, clicar Verificar) — não automatizado na v1.

## Riscos assumidos e fase 2

- **Contrato implícito entre repos:** o seletor `.koba-compare__pane--*` e o formato do `?state=` são convenções do Koba não formalizadas. Mitigação v1: teste de contrato. Formalização: fase 2.
- **Viewport com fidelidade reduzida** na fase 1 (pane ≈ metade da página). Resolvido na fase 2 com rotas isoladas por framework aplicando `?state=`.
- **Fase 2 (fora deste escopo):** no Koba — rota WC cru, aplicação de `?state=` em `/react`/`/angular`, params de theme/brand/viewport; no Anemoi — baseline WC (react×wc, angular×wc) e `mode: "stories"` para CI.
