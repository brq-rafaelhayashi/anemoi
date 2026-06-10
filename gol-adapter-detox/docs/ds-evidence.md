# Anemoi (DS Evidence) — Guia de Uso (Dev e QA)

**Anemoi** é a ferramenta de evidência de Design System do GOL: um harness de automação
**Detox** que captura prints de componentes do Design System **Tangerina** para os cards
de correção **CDCOM**. Renderiza cada componente isolado numa rota escondida do app (a
_Gallery_), tira o screenshot, recorta no componente-alvo e monta um _Bundle de Evidência_
(HTML + imagens + metadados) para a dev provar o fix e a QA validar. Suporta dois modos de
captura: **Antes/Depois** (par comparativo) e **Referência** (pós-fix único — ver
[Captura de Referência](#captura-de-referência-modo-pós-fix)).

> **Nome:** "Anemoi" é o nome do produto. Os **identificadores técnicos mantêm o slug
> legado `ds-evidence`** por compatibilidade — não renomeie: comando `yarn ds:evidence`,
> env `DS_EVIDENCE_*`, arquivo `ds-evidence.config.js`, pacote
> `@gol-smiles/ds-evidence-preset`, pasta `outputs/ds-evidence/` e a `DsEvidenceScreen`.
> Renomear esses identificadores quebra runs, config e patches existentes sem ganho.

O GOL consome o preset local extraível `@gol-smiles/ds-evidence-preset`
(`packages/ds-evidence-preset`). O app continua dono da Gallery, do registry e
dos fluxos reais; o preset fornece CLI, factory Detox, preset Metro, captura e
geração opcional de HTML.

Para o **padrão do relatório HTML artesanal** (multi-seção, colapsável, escada de
evidência), ver [`anemoi-relatorio-html.md`](anemoi-relatorio-html.md).

Complementa o pipeline `gol-ds-analyse` → `gol-ds-port` → `gol-ds-create-pr`.

> Os termos em **negrito** (Modo Package/Source, Bundle de Evidência, Guarda de
> Regressão, Validação do Fix, Escada de Evidência…) são definidos no
> [`CONTEXT.md`](../CONTEXT.md). Este guia é operacional; o glossário é a fonte da linguagem.

---

## Estado atual vs. design alvo (leia antes de interpretar os prints)

O comando de evidência usa o desenho do [ADR 0002](adr/0002-toggle-antes-depois-source-stash.md):

- **Depois** = **Modo Source** com a working tree atual do repo DS.
- **Antes** = **Modo Source** após `git stash push` dos arquivos declarados em
  `sourcePaths`/`defaultSourcePaths`.

Isso evita comparar `package` contra `source` e reduz o drift de versão. Se não houver
diff nos arquivos do componente, o preset aborta porque Antes e Depois seriam iguais.

---

## Como funciona (visão geral)

```
yarn ds:evidence --component <Comp> --card <CDCOM-x>
        │
        ├─ 1. detox build (TANGERINA_MODE=source)
        │        → compila o app de automação (iOS .app / Android .apk + androidTest)
        │
        ├─ 2. sobe UM Metro em TANGERINA_MODE=source (compartilhado pelas duas fases;
        │       output em metro-source.log no runDir — --verbose ecoa no console)
        │
        └─ 3. para cada fase [after, before]:
                 ├─ after: Source atual; before: Source com sourcePaths stashed
                 │     (o watcher do Metro re-transforma após o stash — sem restart)
                 ├─ detox test  → detox/dsEvidence.test.js
                 │     ├─ device.launchApp + openURL("gol://automation/ds/<Comp>/<cenario>")
                 │     ├─ espera o testID "ds-evidence-screen"
                 │     │     (a Gallery só renderiza o componente-alvo com __DEV__ + Config.E2E === 'true')
                 │     ├─ device.takeScreenshot + generateViewHierarchyXml
                 │     └─ sharp recorta o print no frame do testID-alvo
                 └─ (Metro segue vivo; é derrubado ao final da run)
        │
        └─ 3. escreve outputs/ds-evidence/<card>/<comp>/<timestamp>/
                 → manifest.json + summary.md
                 → index.html somente quando rodar com --html
```

### Peças do harness

| Arquivo                                         | Papel                                                                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` → `ds:evidence`                  | Atalho para o preset (`node ./packages/ds-evidence-preset/bin/ds-evidence.js`).                                                          |
| `ds-evidence.config.js`                         | Adaptador do app: scheme, paths, registry, devices, comandos e source paths.                                                             |
| `packages/ds-evidence-preset`                   | **Preset**: CLI, factory Detox, preset Metro, teste comum e HTML opcional.                                                               |
| `scripts/metro/tangerinaSourceConfig.js`        | Compatibilidade: reexporta o preset Metro.                                                                                               |
| `detox/.detoxrc.js`                             | Config Detox criada pela factory do preset.                                                                                              |
| `detox/jest.config.js`                          | Runner Jest do Detox (`maxWorkers: 1`, timeouts longos).                                                                                 |
| `detox/dsEvidence.test.js`                      | Wrapper do teste comum do preset.                                                                                                        |
| `detox/ds-evidence/registry.json`               | **Registro** de componentes → fluxos renderizáveis (`flows`) + referências informativas (`references`).                                  |
| `src/Automation/DsEvidence/DsEvidenceScreen.js` | **DS Evidence Gallery**: renderiza o componente do fluxo com props representativas. Só funciona com `__DEV__` + `Config.E2E === 'true'`. |
| `src/Navigators/deepLinking/index.ts`           | Registra a rota `automation/ds/:component?flows=<flowId>` e mantém `:scenario` legado.                                                   |
| `src/Navigators/routes/index.ts`                | Liga a rota `automation.DsEvidence` à tela.                                                                                              |
| `detox/android/src/java/.../DetoxTest.java`     | Entry point nativo do Detox no Android (instrumentação JUnit).                                                                           |

---

## Setup completo (Dev — quem **roda** o harness)

> A QA normalmente **não** precisa deste setup — ver [Para QA](#para-qa--como-consumir-a-evidência).
> A config nativa do Detox (gradle, `androidTest`, repositório Maven) já está no repo;
> um clone novo precisa do toolchain abaixo + `yarn install`.
>
> **Assume o ambiente padrão do `GOL_APP_Mobile` já funcional** (Node 20.19.2, Ruby/CocoaPods,
> Xcode, Android Studio/JDK — ver [`CLAUDE.md`](../../CLAUDE.md)). As seções abaixo cobrem
> **só o delta do Detox / DS Evidence**.

### 1. Base do projeto

```bash
# Node 20.19.2 (ver .nvmrc) e Yarn
nvm use                 # ou nvm install 20.19.2
yarn install            # patch-package roda no postinstall

# iOS: pods
yarn pod                # bundle install + pod install --clean-install
```

### 2. `sharp` (recorte do print)

O `detox/dsEvidence.test.js` usa `sharp` para recortar o screenshot no componente-alvo.
O `sharp` é uma **devDependency declarada** (`sharp@0.32.6`, alinhado à versão que o
`react-native-bootsplash` já trazia) — o `yarn install` do passo 1 já o instala, nada
a fazer aqui.

> **Por que foi declarado:** antes o `sharp` só existia como dependência transitiva; um
> bump que removesse esse caminho quebraria o teste com `Cannot find module 'sharp'` sem
> causa óbvia. Declarar explícito blinda o harness contra isso.

### 3. iOS

- **Xcode** + Command Line Tools.
- Simulador **iPhone 16** instalado (é o device padrão do `detox/.detoxrc.js`).
- **applesimutils** (o Detox usa para controlar o simulador):

```bash
brew tap wix/brew
brew install applesimutils
```

> Não é preciso `detox-cli` global — os comandos rodam pelo binário local via `yarn detox`.

### 4. Android — _apenas se for capturar Android_

> O orquestrador captura **só iOS por padrão** (`DEFAULT_PLATFORMS = ['ios']`). Você só
> precisa do setup abaixo ao usar `--platform android` (ou `ios,android`).

- **Android SDK** + `adb` e `emulator` no `PATH`.
- **JDK** compatível com o Gradle do projeto.
- Um **AVD** chamado **`Medium_Phone_API_36.1`** (nome padrão do `detox/.detoxrc.js`).

```bash
# listar AVDs disponíveis
emulator -list-avds
```

Se o AVD não existir, crie-o pelo **Android Studio → Device Manager** (ou `avdmanager`).
Para usar um AVD com outro nome sem renomear, sobrescreva com a variável
`DS_EVIDENCE_ANDROID_AVD` — ver [Sobrescrevendo device/AVD](#sobrescrevendo-deviceavd).

### 5. `.env.automation`

O ambiente de automação. A **DS Evidence Gallery só renderiza com `__DEV__` + `E2E=true`**
(fora desse gate, a tela retorna um placeholder). O `.env.automation`
**já é versionado no repo** (clone novo o recebe) e contém `E2E=true` + as `API_BASE_*` de
staging para automação. O Detox carrega esse arquivo via `ENVFILE=.env.automation` nos
comandos de build do `detox/.detoxrc.js`.

### 6. Checkout do DS para o Modo Source

O **Modo Source** (a fase `after`) resolve o Tangerina do disco, **ao lado** do app, em
`../projects_tangerina/`. Sem esse checkout, a fase `after` falha.

```
<pasta-pai>/
├── GOL_APP_Mobile/                 ← este repo
└── projects_tangerina/
    ├── golsmiles-reactnative-tangerina-ds/        (core — usa /src)
    ├── golsmiles-reactnative-tangerina-ds-assets/
    └── golsmiles-nodejs-tangerina-ds-tokens/
```

Clone os três repos do DS (core, assets, tokens) **na pasta `../projects_tangerina/`**, com
**exatamente esses nomes de diretório** — o resolver em
`scripts/metro/tangerinaSourceConfig.js` aponta o Metro para o `src/` do core e adiciona
assets/tokens aos `watchFolders`:

```bash
cd ..                                  # pasta-pai do GOL_APP_Mobile
mkdir -p projects_tangerina && cd projects_tangerina
git clone <url-do-core>   golsmiles-reactnative-tangerina-ds
git clone <url-dos-assets> golsmiles-reactnative-tangerina-ds-assets
git clone <url-dos-tokens> golsmiles-nodejs-tangerina-ds-tokens
```

> As URLs dos repositórios do DS são internas (git da GOL/Smiles) — peça ao time de Design
> System ou siga o setup usado pela skill `gol-ds-port`. Não estão versionadas aqui.

> **O "Depois" só prova o fix se o core estiver no branch certo.** A fase `after` captura
> a **working tree** de `golsmiles-reactnative-tangerina-ds/src`. Antes de rodar, faça
> `git checkout` do **branch/commit que contém a correção do card** (tipicamente o porte
> feito pela `gol-ds-port`). Se o core estiver no `HEAD` padrão (sem o fix), a coluna
> _depois_ mostra a `6.0.5` **sem** a sua correção e o par Antes/Depois fica inútil.

---

## Como rodar o fluxo (com print)

### Caminho recomendado — orquestrador

```bash
# iOS (padrão), pergunta quais fluxos renderizar quando houver mais de um
yarn ds:evidence --component InputCounter --card CDCOM-72

# descobrindo os fluxos disponíveis sem capturar
yarn ds:evidence --component CountryFlag --list-flows

# escolhendo fluxos e plataforma
yarn ds:evidence --component CountryFlag --card CDCOM-115 \
  --flows flags,prefs-list-select --platform both --html

# pulando o build (já compilado) e usando a saída da gol-ds-analyse
yarn ds:evidence --component InputCounter --analysis outputs/analysis/CDCOM-72.json --skip-build

# só validar registry/config e metadados, sem rodar emulador
yarn ds:evidence --component Tag --card CDCOM-90 --dry-run

# abrir o componente no simulador/emulador para interagir, sem print nem HTML
yarn ds:evidence --component InputCounter --card CDCOM-72 \
  --interactive --mode source --skip-build

# se o componente tiver mais de um fluxo e você não passar --flows,
# o CLI pergunta quais fluxos abrir no terminal
yarn ds:evidence --component CountryFlag --card CDCOM-115 \
  --interactive --mode source --skip-build
```

**Flags** (do preset `@gol-smiles/ds-evidence-preset`):

| Flag                              | Default         | Descrição                                                                                                                                    |
| --------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `--component <Nome>`              | — (obrigatório) | Componente do `registry.json` (ou vem do `--analysis`).                                                                                      |
| `--card <CDCOM-x>`                | `NO-CARD`       | Card; vira a pasta do output e o título do Bundle.                                                                                           |
| `--flows <a,b>`                   | pergunta no TTY | Subconjunto de `flowId` (vírgula). Se omitido e houver múltiplos fluxos, pergunta no terminal; em CI, falha listando as opções.              |
| `--list-flows`                    | desligado       | Lista `flowId`, rótulo e categoria dos fluxos, além de referências não selecionáveis, sem rodar captura.                                     |
| `--scenarios <a,b>`               | legado          | Alias temporário de `--flows`; emite aviso de depreciação.                                                                                   |
| `--platform <ios,android,both>`   | `ios`           | Plataformas a capturar.                                                                                                                      |
| `--mode <source,package>`         | —               | Obrigatório no modo `--interactive`; define como o Metro resolve o Tangerina.                                                                |
| `--interactive`                   | desligado       | Abre a rota da Gallery no device já aberto, sem screenshot e sem HTML. Vários fluxos selecionados aparecem empilhados na mesma tela rolável. |
| `--reference`                     | desligado       | Captura **só o pós-fix** (fase única, sem stash, sem exigir diff). Exige `--mode`. Ver [Captura de Referência](#captura-de-referência-modo-pós-fix). |
| `--html`                          | desligado       | Gera `index.html` junto da captura. Exige imagens reais Antes/Depois.                                                                        |
| `--html-output <single,per-flow>` | `single`        | `single` gera um HTML único; `per-flow` gera um HTML por fluxo e um `index.html` com links.                                                  |
| `--html-only <runDir>`            | —               | Remonta o HTML a partir de capturas reais e um `manifest.json` existente.                                                                    |
| `--add-flow <Nome>`               | —               | Guia a criação de um fluxo novo, grava o `registry.json` e imprime um stub para a Gallery.                                                   |
| `--start-device`                  | desligado       | Reservado para hosts que configurarem comando de boot de simulador/emulador.                                                                 |
| `--analysis <arquivo.json>`       | —               | JSON da `gol-ds-analyse`; deriva `component`/`card` e conta usos.                                                                            |
| `--port <n>`                      | `8081`          | Porta do Metro. O orquestrador **exige a porta livre** (ele reinicia o Metro com o `TANGERINA_MODE` certo por fase).                         |
| `--skip-build`                    | desligado       | Pula `detox build`. ⚠ Só após um build de **automação** (`ds:evidence` sem a flag): binário de dev comum não contém a Gallery (`E2E=true` é baked no build) e o deep link falha silencioso com timeout no `targetTestID`. |
| `--dry-run`                       | desligado       | Só gera `manifest.json`/`summary.md`, sem emulador e sem HTML.                                                                               |
| `--verbose`                       | desligado       | Ecoa o output do Metro no console. Sem a flag, o output vai para `metro-*.log` no diretório do run (o console mostra só porta/modo/caminho). |
| `--parallel-builds`               | desligado       | Com `--platform both`, roda os `detox build` de iOS e Android em paralelo (`Promise.all`). Pesado em máquina de dev — opt-in.                |
| `--doctor`                        | —               | Pre-flight: valida registry/config **e o ambiente** — `tangerina.corePath` aponta para o repo DS real (erro fatal: corePath errado vira fallback npm silencioso), `metroPaths` existem, simulador/AVD declarados existem, porta do Metro livre e binários de automação já buildados (warnings). |

> **Pare o Metro antes de rodar.** Se já houver Metro na porta, o orquestrador aborta
> com _"Metro is already running on port…"_. No fluxo de evidência (Antes/Depois) o
> Metro sobe **uma vez** e fica vivo entre as fases — o Detox relança o app e o watcher
> do Metro re-transforma os arquivos alterados pelo stash. Em caso de timeout na
> subida, o erro inclui as últimas linhas do log do Metro.

No modo `--interactive`, `--skip-build` reaproveita o app instalado, mas o preset ainda
tenta encerrar o app antes de abrir o deep link. Isso força o relaunch a carregar o JS
atual do Metro, em vez de manter a tela antiga em memória.

### Caminho manual — comandos Detox crus

Úteis para depurar uma fase isolada (atenção: você controla o `TANGERINA_MODE` e o Metro).

```bash
# build
yarn detox:build:ios        # detox build -c ds.ios.debug
yarn detox:build:android    # detox build -c ds.android.debug

# test (precisa das variáveis DS_EVIDENCE_* + Metro no modo desejado)
yarn detox:test:ios         # detox test -c ds.ios.debug
yarn detox:test:android     # detox test -c ds.android.debug
```

**Variáveis de ambiente lidas pelo teste** (`detox/dsEvidence.test.js`):

| Variável                 | Obrigatória     | Papel                                                             |
| ------------------------ | --------------- | ----------------------------------------------------------------- |
| `DS_EVIDENCE_COMPONENT`  | sim             | Componente a capturar (chave do registry).                        |
| `DS_EVIDENCE_OUTPUT_DIR` | sim             | Pasta raiz do run (o teste cria `<dir>/<phase>/<platform>/`).     |
| `DS_EVIDENCE_FLOWS`      | não             | Filtra `flowId` (vírgula). Vazio = todos os fluxos do componente. |
| `DS_EVIDENCE_SCENARIOS`  | legado          | Alias temporário de `DS_EVIDENCE_FLOWS`.                          |
| `DS_EVIDENCE_PHASE`      | não (`unknown`) | `before` / `after` — vira subpasta.                               |
| `DS_EVIDENCE_PLATFORM`   | não             | `ios` / `android` — subpasta; default = `device.getPlatform()`.   |

> **`TANGERINA_MODE` NÃO é lido pelo teste.** Ele é consumido pelo `detox/.detoxrc.js`
> (comando de build) e pelo `metro.config.js` (resolver do Modo Source), e é **definido por
> fase** pelo preset. No caminho manual, defina-o no
> processo do **Metro** e no **build** — não como variável do teste. Default = `package`.

### Sobrescrevendo device/AVD

O `detox/.detoxrc.js` lê estas variáveis (úteis se seu simulador/AVD tem outro nome):

```bash
DS_EVIDENCE_IOS_DEVICE="iPhone 15 Pro" yarn ds:evidence --component Tag --card CDCOM-90
DS_EVIDENCE_ANDROID_AVD="Pixel_7_API_34" yarn ds:evidence --component Tag --platform android
```

---

## Captura de Referência (modo pós-fix)

Para cards de **a11y pura** (sem mudança de pixel), o par Antes/Depois é idêntico de
propósito e não prova nada visualmente. Mesmo assim a QA precisa de uma **referência
visual** do componente. O modo `--reference` resolve isso: captura **só o estado atual
(pós-fix)**, numa fase única, **sem stash e sem exigir diff no source**.

```bash
# referência pós-fix, iOS + Android, sobre o pacote npm + patches (modo package)
yarn ds:evidence --component Header --card CDCOM-78 \
  --reference --mode package --platform both

# referência apontando pro DS local (após o porte), com build já compilado
yarn ds:evidence --component Heading --card CDCOM-78 \
  --reference --mode source --platform both --skip-build
```

| Aspecto | Antes/Depois (padrão) | Referência (`--reference`) |
| --- | --- | --- |
| Fases | `before` + `after` | `reference` (única) |
| `git stash` do source | sim | **não** |
| Exige diff no componente | sim (aborta sem diff) | **não** |
| `TANGERINA_MODE` | `source` (fixo) | vem de `--mode` (`package` ou `source`) |
| Pasta de saída | `before/`, `after/` | `reference/<plataforma>/` |
| HTML auto-gerado (`--html`) | `.comparison` (2 colunas) | `.comparison.single` (1 coluna) |

- **`--mode` é obrigatório** com `--reference` (`package` resolve via pacote npm + patches;
  `source` aponta pro DS local — útil para conferir o porte).
- O alvo de recorte em referência costuma ser `ds-evidence-screen` (tela inteira), o que
  **inclui o contexto** (rótulo do componente + flowId + card branco) — para QA isso é
  mais informativo que um crop apertado. Recorte pós-captura se precisar de um crop justo.
- Os PNGs de referência alimentam a seção **2.6** do relatório artesanal (grid iOS × Android
  — ver [`anemoi-relatorio-html.md`](anemoi-relatorio-html.md)).

> Mesmo em card 100% a11y, **gere ao menos um print de referência por plataforma** — é a
> única forma de a QA saber qual é o componente visualmente.

---

## Captura manual no simulador (debug rápido)

Às vezes você só quer **abrir um fluxo da Gallery no device à mão** (sem Detox) para
conferir o render — foi assim que validamos os fluxos do Header. A sequência importa, ou
você cai em telas de erro do React Native. **Faça nesta ordem:**

```bash
# 1. Suba o Metro SEM --reset-cache (reset força rebundle de 3–8 min do zero).
yarn start

# 2. SÓ DEPOIS que o Metro estiver "Dev server ready", lance o app.
#    iOS — descubra o bundle id e lance:
xcrun simctl listapps booted | grep -i gol           # ex.: com.yourcompany.GolCheckIn (HML)
xcrun simctl launch booted com.yourcompany.GolCheckIn

#    Android — habilite o port-forward ANTES (Metro 8081 + Detox server 8099):
adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8099 tcp:8099
adb shell monkey -p br.com.edeploy.gol.checkin.hml 1

# 3. Espere o bundle terminar (tela do app aparece). Se o app subiu antes do Metro,
#    a tela fica vermelha ("No script URL") — RELANCE o app, não recarregue.

# 4. Com o app já em primeiro plano, dispare o deep link da Gallery:
xcrun simctl openurl booted "gol://automation/ds/Header?flows=flow-jumbo"   # iOS
adb shell am start -a android.intent.action.VIEW -d "gol://automation/ds/Header?flows=flow-jumbo"  # Android

# 5. Print:
xcrun simctl io booted screenshot /tmp/header.png        # iOS
adb exec-out screencap -p > /tmp/header.png              # Android
```

**Por que a ordem importa:**

- **Metro primeiro, app depois.** Se o app abrir antes do Metro estar pronto, o RN não
  reconecta sozinho — mostra a tela vermelha "No script URL". A correção é **relançar** o
  app (não "Reload").
- **Lance o app antes do deep link.** Disparar o `gol://…` com o app **fechado** faz o iOS
  abrir o diálogo _"Open in GOL HML?"_, que bloqueia a navegação. Com o app já aberto, o
  deep link entra direto.
- **`--reset-cache` só quando mudou config de Metro/Babel.** No dia a dia, `yarn start`
  puro reaproveita o cache e o bundle sai em segundos.

> No fluxo automatizado (`yarn ds:evidence`) nada disso é manual — o preset cuida do
> launch, do `adb reverse` é responsabilidade do seu setup Android, e o Android usa
> `device.launchApp({url})` (intent inicial) em vez de `openURL` para evitar o problema de
> `onNewIntent` com `singleTask` no RN 0.77 + nova arquitetura.

---

## Saídas (o Bundle de Evidência)

Cada run grava em:

```
outputs/ds-evidence/<card>/<component>/<timestamp>/
├── index.html                       ← opcional com --html / --html-only, somente com imagens reais
├── <card>-<component>.html          ← opcional com --html / --html-only, somente com imagens reais
├── manifest.json                    ← metadados do run (card, fluxos, plataformas, referências)
├── summary.md                       ← resumo em Markdown
├── before/<platform>/
│   ├── <Comp>-<flowId>.png          ← print RECORTADO no componente-alvo
│   ├── <Comp>-<flowId>-screen.png   ← print da tela inteira
│   ├── <Comp>-<flowId>.xml          ← hierarquia de views nativa
│   └── <Comp>-<flowId>.json         ← metadados do fluxo (rota, testID, cropped, etc.)
└── after/<platform>/  (mesma estrutura)
```

- **Recorte:** o teste lê o frame do `ds-evidence-screen` e do `targetTestID` na
  hierarquia XML, calcula a escala vs. o screenshot real e recorta com `sharp` (8px de
  padding). Se algum frame não resolver, copia o print inteiro e marca `cropped: false`.
- **Entregue a pasta `<timestamp>/` INTEIRA.** O `index.html` referencia as imagens por
  **caminho relativo** (`before/<plat>/…`, `after/<plat>/…`); abrir/anexar só o HTML solto
  deixa as imagens quebradas (cai no placeholder "Imagem ainda não gerada"). Para anexar no
  card, **compacte a pasta do timestamp** (HTML + `before/` + `after/`) e mande o `.zip`.
- **`outputs/` não está no `.gitignore`** — os artefatos (PNG/HTML/XML) aparecem como
  não rastreados. Não commite o Bundle no app; ele vive na pasta de evidência (ou anexo do
  card), separado do **Log Textual** (Obsidian) que guarda só texto + links.

---

## Para QA — como consumir a evidência

A QA normalmente **não roda** o harness. O fluxo é consumir o Bundle e validar no device:

1. **Abrir o Bundle:** descompacte o `.zip` que a dev anexou (ou a pasta `<timestamp>/`
   inteira) e abra o `index.html` no navegador. O HTML depende das pastas `before/` e
   `after/` ao lado — não funciona solto.
2. **Comparar** cada fluxo lado a lado: coluna _antes_ vs. _depois_.
3. **Ler o estado da captura** (seção [Estado atual](#estado-atual-vs-design-alvo-leia-antes-de-interpretar-os-prints)):
   o preset usa Source+stash e aborta quando não há diff nos arquivos declarados do componente.
4. **Validação do Fix (a11y):** para card de a11y, o par de prints costuma ser **idêntico
   de propósito** — isso é a **Guarda de Regressão** (provou que a semântica não quebrou o
   layout), **não** "nada a testar". A prova do fix é validar no leitor de tela, num
   **build que contenha a correção** (ver nota abaixo):
   - **iOS:** VoiceOver — Ajustes → Acessibilidade → VoiceOver.
   - **Android:** TalkBack — Ajustes → Acessibilidade → TalkBack.
   - Verifique o que o card pede (ex.: `accessibilityLabel` sem prefixo redundante, foco,
     leitura única). A dev indica o ponto a validar no comentário do card.

> **Qual build instalar para a validação em device?** O harness só produz o **app de
> automação** (a _DS Evidence Gallery_ isolada, com `__DEV__` + `Config.E2E='true'`) — ele renderiza o
> componente fora dos fluxos reais. Para validar o componente isolado no leitor de tela, a
> Gallery já serve. Para validar num **fluxo real do app**, use um **build staging que já
> contenha o fix** (tipicamente pós-merge do porte + novo patch/versão, via pipeline) — a
> dev indica qual build/link. Fornecer esse build está **fora** do escopo deste harness.

> Resumo do contrato dev↔QA: print idêntico em card de a11y é **esperado**; a evidência
> sempre vem com a instrução de validação por leitor de tela. Ver
> [ADR 0003 — Escada de Evidência](adr/0003-escada-evidencia-a11y-vs-pixel.md).

### A Escada de Evidência

A prova certa depende do **tipo de hunk** (não é "print de tudo"):

| Tier                                                 | Ferramenta                             | Para quê                                                                                                           |
| ---------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **1 — Assert de A11y**                               | RTL + `jest-native` (no repo do DS)    | Prova nível de prop (role/label/state), determinístico, sem emulador. Cobre a maioria dos hunks de a11y.           |
| **2 — Print de Regressão**                           | Detox (`yarn ds:evidence`)             | Hunk visual: o print É a prova. Hunk de a11y: print idêntico = guarda de regressão.                                |
| **3 — Dump Nativo** _(opcional / assistido por dev)_ | `adb shell uiautomator dump` (Android) | Árvore de a11y nativa: foco, `importantForAccessibility`, leitura duplicada. iOS = spot-check manual de VoiceOver. |

> Tier 3 exige Android SDK/`adb` no `PATH` — toolchain que a QA padrão (que só **consome**
> o Bundle) pode não ter. Trate-o como passo **opcional**, normalmente conduzido pela dev.

---

## Adicionar um componente / fluxo novo

> **Princípio de fidelidade: o fluxo deve ficar o mais próximo possível do app.**
> Renderize o **componente real de produção** (`TgrInputSelect`, `TgrListSelect`…) com as
> **props espelhadas da tela real** (mesmos helpers — ex.: `formatCountriesOptions` —, mesmos
> `type`/`inputType`/`linePosition`/`selected` etc.), não um proxy genérico. Um fluxo por
> componente que consome o elemento no app (padrão validado no CDCOM-115: 3 fluxos =
> TgrListNavigation, TgrInputSelect e TgrListSelect).

Caminho guiado:

```bash
yarn ds:evidence --add-flow CountryFlag
```

O comando pergunta `category`, `flowId`, `label`, componente renderizado, `targetTestID`,
`screenPath` e `description`; grava o fluxo em `detox/ds-evidence/registry.json`; e imprime
um stub para a Gallery. Ele **não edita** `src/Automation/DsEvidence/DsEvidenceScreen.js`
automaticamente.

1. **Registry** — adicione a entrada em `detox/ds-evidence/registry.json`:

   ```json
   "MeuComponente": {
     "flows": [
       { "flowId": "preferences-currency",
         "category": "appScreen",
         "label": "Home > Minha conta > Preferencias - PreferencesScreen.tsx",
         "targetTestID": "ds-evidence-screen",
         "component": "TgrMeuComponente",
         "flow": ["Home", "Minha conta", "Tela X", "elemento Y"],
         "screenPath": "src/Modules/.../TelaX.tsx:123",
         "description": "Estado representativo do hunk" }
     ],
     "references": []
   }
   ```

   - `targetTestID` é o `testID` que o `sharp` recorta. Use um `testID` específico do
     componente para um recorte justo; `ds-evidence-screen` (tela toda) só quando o
     componente compõe subárvore acessível e o `testID` custom não é endereçável pelo
     Detox — nesse caso, **recorte o PNG pós-captura** (sharp/Pillow) antes de montar
     galeria combinada/anexar no card, para que o par Antes|Depois foque o componente.
   - `component` é o nome do componente real exibido como título da coluna (fallback:
     `Tgr<Componente>`).
   - `flowId` é o id passado em `--flows`.
   - `category` aceita `appScreen` (tela real do app) ou `testState` (estado montado para teste, como drawer/modal/lista aberta).
   - `label` é o rótulo exibido para seleção e no topo do bloco: `Home > Etapa > Página - ArquivoDaTela.tsx`.
   - `flow` é o **diagrama de fluxo até o componente** (caixas de telas ligadas por setas,
     terminando no componente destacado) — renderizado no topo do bloco do fluxo.
   - `screenPath` é o arquivo (e linha) da tela real espelhada pelo fluxo.
   - `references` lista usos reais ainda sem fluxo renderizável; aparecem como informação,
     mas não são selecionáveis.

2. **Gallery** — adicione o fluxo em `src/Automation/DsEvidence/DsEvidenceScreen.js`:
   crie a função `MeuComponenteScenario` (renderizando o `Tgr…` real com as props da tela
   espelhada e `testID`s) e registre no `scenarioMap` legado da Gallery.

3. Rode `yarn ds:evidence --component MeuComponente --card <CDCOM-x>`.

---

## Troubleshooting

| Sintoma                                                               | Causa provável / solução                                                                                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Metro is already running on port 8081`                               | Pare o Metro antes (`yarn ds:evidence` reinicia o Metro por fase). Use `--port` para outra porta.                                                  |
| `Cannot find module 'sharp'`                                          | Dependências incompletas — rode `yarn install` (`sharp` é devDependency declarada; ver [Setup §2](#2-sharp-recorte-do-print)).                     |
| Fase `after` falha ao resolver Tangerina                              | Falta o checkout `../projects_tangerina/` (ver [Setup §6](#6-checkout-do-ds-para-o-modo-source)).                                                  |
| Tela mostra "DS evidence is available only in E2E."                   | O build não está em `__DEV__` ou `Config.E2E` não é `'true'` — confira `.env.automation` (`E2E=true`) e se o build usou `ENVFILE=.env.automation`. |
| "Scenario not registered for this component."                         | Fluxo ausente no `scenarioMap` da Gallery, embora esteja no registry. Adicione a função do fluxo.                                                  |
| `Component <X> is not registered in detox/ds-evidence/registry.json.` | Componente fora do `registry.json` — mensagem do orquestrador (`yarn ds:evidence`). Adicione a entrada.                                            |
| `No DS evidence registry entry for <Comp>.`                           | Mesma causa, mas vinda do teste Detox cru (sem passar pelo orquestrador).                                                                          |
| Simulador/AVD não encontrado                                          | Nome diferente do default. Use `DS_EVIDENCE_IOS_DEVICE` / `DS_EVIDENCE_ANDROID_AVD`.                                                               |
| Print não recortado (`cropped: false`)                                | O frame do `targetTestID`/`ds-evidence-screen` não foi resolvido na hierarquia XML; o teste copia o print inteiro como fallback.                   |
| Bundle do Metro demora 3–8 min                                        | `yarn start` foi rodado com `--reset-cache` — descarta todo o cache de transformação e reprocessa o grafo inteiro. Use `yarn start` puro; só resete ao mudar config de Metro/Babel.            |
| Tela vermelha "No script URL provided"                                | App lançado **antes** de o Metro estar pronto; o RN não reconecta sozinho. **Relance** o app (não use "Reload") com o Metro já no ar.             |
| iOS abre diálogo "Open in GOL HML?" ao disparar o deep link           | O `gol://…` foi disparado com o app **fechado**. Lance o app primeiro, espere a Home, e só então dispare o `openURL`.                              |
| Android: "Detox can't connect to the test app" / deep link não navega | Falta `adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8099 tcp:8099` (Metro + Detox server). No caminho manual, prefira o intent inicial via `launchApp({url})` ao `onNewIntent` (`singleTask` + RN 0.77 nova arq não propaga). |
| Nome do export do componente Tangerina não confere                    | Grep em `dist/index.js` engana (re-exports renomeiam). Confirme o nome real lendo `dist/components/<Comp>/<Sub>/index.js` (ex.: o export é `TgrHeaderFlowJumbo`, não `HeaderFlowJumbo`).      |
| Chrome mostra página de erro ao abrir o relatório por `file://`       | O Chrome bloqueia `file://` (e as imagens locais). Sirva por HTTP: `python3 -m http.server` na raiz do card e abra via `localhost`.               |
| `<img>` quebrado / "Imagem ainda não gerada" no relatório artesanal   | Caminho relativo errado. Valide cada `src` resolvendo contra a pasta do HTML antes de entregar (ver passo 5 em [`anemoi-relatorio-html.md`](anemoi-relatorio-html.md)).                       |

---

## Referências

- [`anemoi-relatorio-html.md`](anemoi-relatorio-html.md) — padrão do relatório HTML artesanal
  (anatomia, blocos reutilizáveis, paleta, checklist de montagem).
- [`CONTEXT.md`](../CONTEXT.md) — glossário do domínio (Modo Package/Source, Antes/Depois,
  Bundle de Evidência, Escada de Evidência, etc.).
- [ADR 0001 — Use Detox for DS evidence automation](adr/0001-detox-for-ds-evidence.md)
- [ADR 0002 — Toggle Antes/Depois: Modo Source + git stash](adr/0002-toggle-antes-depois-source-stash.md)
  _(implementado e validado em smoke — inclusive com Metro compartilhado entre as fases; ver [estado atual](#estado-atual-vs-design-alvo-leia-antes-de-interpretar-os-prints))._
- [ADR 0003 — Escada de Evidência: a11y vs pixel](adr/0003-escada-evidencia-a11y-vs-pixel.md)
- Skills relacionadas: `gol-ds-analyse`, `gol-ds-port`, `gol-ds-create-pr`.
