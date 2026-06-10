# Anemoi — Padrão de Relatório HTML de Evidência

Guia do **padrão de Bundle HTML artesanal** do **Anemoi** (a ferramenta de evidência de
Design System do GOL — antiga "DS Evidence"). Define a anatomia, os blocos reutilizáveis,
a paleta e o comportamento do relatório de evidência que a dev entrega no card CDCOM e a
QA consome. O padrão de referência canônico é o
`CDCOM-78-Header-Heading.html` (port de a11y de `TgrHeading` + `Header`).

> **Nome da ferramenta:** "Anemoi" é o nome do produto. Os identificadores técnicos
> (`yarn ds:evidence`, env `DS_EVIDENCE_*`, `ds-evidence.config.js`, `outputs/ds-evidence/`,
> pacote `@gol-smiles/ds-evidence-preset`) **mantêm o nome legado `ds-evidence`** por
> compatibilidade — não os renomeie. Anemoi é a marca; `ds-evidence` é o slug interno.

---

## Dois níveis de HTML — saiba qual usar

O Anemoi produz HTML em **dois níveis distintos**. Confundi-los é o que torna o trabalho
lento — escolha pelo que o card precisa:

| Nível | Como nasce | Quando usar | Estrutura |
| --- | --- | --- | --- |
| **Auto-gerado** | `yarn ds:evidence … --html` → `renderHtml()` no preset | Evidência mecânica rápida: um par antes/depois ou um print de referência, sem narrativa. | Template enxuto (~38 linhas de CSS), bloco `.comparison` (antes\|depois) ou `.comparison.single` (referência). |
| **Relatório artesanal** _(este doc)_ | Montado à mão (ou por agente) a partir das capturas | Card que precisa de **narrativa completa**: escada de evidência, antes/depois conceitual de a11y, roteiros de navegação QA, diffs do source, decisões técnicas. | Multi-seção, cards colapsáveis, alerts, test-blocks, grids de imagem, tabelas, diffs. |

Este documento descreve o **relatório artesanal**. O HTML auto-gerado está coberto em
[`ds-evidence.md`](ds-evidence.md) (flags `--html` / `--html-output` / `--html-only`).

> **Regra de fidelidade das imagens:** os dois níveis referenciam os PNGs por **caminho
> relativo** dentro da pasta `<timestamp>/`. O relatório artesanal frequentemente vive numa
> pasta agregadora (ex.: `CDCOM-78/Header-Heading/<ts>/`) e aponta para capturas de pastas
> irmãs via `../../<Componente>/<ts>/reference/<plataforma>/<arq>.png`. **Entregue a árvore
> inteira** (ou um `.zip`) — HTML solto deixa as imagens quebradas.

---

## Filosofia do relatório

1. **Auto-contido e offline.** Um único `.html` com **CSS e JS embutidos** — sem CDN, sem
   framework, sem build. Abre em qualquer navegador, inclusive sem rede. As únicas
   dependências externas são os PNGs por caminho relativo.
2. **A narrativa segue a Escada de Evidência.** A prova certa depende do tipo de hunk (ver
   [ADR 0003](adr/0003-escada-evidencia-a11y-vs-pixel.md)). Em card de a11y, o relatório
   deixa explícito que o assert de A11y (Tier 1) é a prova — não o pixel. O print é
   **referência visual / guarda de regressão**, não a evidência principal.
3. **Dois públicos, uma página.** A QA lê de cima (resumo + roteiros + checklist); a dev
   lê de baixo (diffs + decisões). Seções colapsáveis deixam cada público abrir só o que
   importa. Seções QA começam **abertas**; seções de dev começam **colapsadas**.
4. **Marca Anemoi visível.** Badge no header (`Anemoi · <CARD>`) e crédito no footer.

---

## Anatomia (ordem canônica das seções)

```
<header class="page-header">          Badge "Anemoi · CARD" + título + subtítulo + meta-grid
<div class="container">
  1. Resumo Executivo            📋  aberto    — o que mudou, por componente, + ressalvas
  2. Fluxo QA — O Que Validar    ✅  aberto    — roteiros, checklist, antes/depois, prints
     2.1 Validação com leitor de tela (steps)
     2.2 Checklist de aceitação
     2.3 Telas de referência (tabela)
     2.4 Antes e depois do port (tabela a11y)
     2.5 Roteiros de navegação (flow-cards colapsáveis)
     2.6 Prints de referência pós-fix (ref-grid iOS × Android)
  3. Evidências Automatizadas    🧪  aberto    — test-blocks (Tier 1 A11y), status TS
  4. Diffs de Código (source DS) 🔧  colapsado — <pre> com diff por arquivo
  5. Decisões Técnicas           📐  colapsado — tabela decisão/motivo + nota de modos DS
<footer class="footer">              CARD · componentes · Anemoi · data · patch de origem
```

Nem todo card usa todas as seções. O mínimo para um card de a11y: **1, 2 (com 2.6), 3**.
As seções 4 e 5 entram quando há diff de source relevante e decisões a registrar.

---

## Esqueleto base (copie e adapte)

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Evidência DS — CARD (Componentes)</title>
  <style>/* tokens + classes — ver "Paleta e tokens" e "Blocos" abaixo */</style>
</head>
<body>
  <header class="page-header">
    <div class="badge">Anemoi · CDCOM-XX</div>
    <h1>Componente — Título do port</h1>
    <p class="subtitle">[APP - Patch] … migração do patch-package para o source do Tangerina</p>
    <div class="meta">
      <div class="meta-item"><strong>Card Jira</strong>CDCOM-XX</div>
      <div class="meta-item"><strong>Estratégia</strong>Tier 1 — Assert de A11y (ADR 0003)</div>
    </div>
  </header>

  <div class="container">
    <!-- cards das seções 1..5 -->
  </div>

  <footer class="footer">
    <p>CDCOM-XX · Componentes · Anemoi · Gerado em DD mmm AAAA</p>
  </footer>

  <script>
    function toggleCard(header) {
      header.classList.toggle('open');
      header.nextElementSibling.classList.toggle('hidden');
    }
  </script>
</body>
</html>
```

---

## Paleta e tokens (CSS variables)

Toda cor vem de variáveis em `:root` — não use hex solto fora delas (exceto os tons de
`tag`/`flow-badge`, que são locais). Cada cor tem o par sólido + claro (fundo).

```css
:root {
  --orange: #f4720b;  --orange-light: #fff4ec;   /* marca GOL / acento primário */
  --green:  #1a7f4b;  --green-light:  #e8f7ef;   /* sucesso / pass */
  --blue:   #1c5fa8;  --blue-light:   #e8f0fb;   /* info / pendente */
  --red:    #c0392b;  --red-light:    #fdf0ef;   /* erro / não-feito */
  --yellow: #d4860a;  --yellow-light: #fef9ec;   /* aviso / skip */
  --grey-100:#f8f8f8; --grey-200:#ebebeb; --grey-400:#999;
  --grey-700:#444;    --grey-900:#1a1a1a;
  --radius: 8px;      --shadow: 0 2px 8px rgba(0,0,0,.08);
}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px; line-height: 1.55; color: var(--grey-900);
  background: #f0f2f5; padding: 24px 16px 64px;
}
code, pre { font-family: "SF Mono","Fira Code","Cascadia Code",monospace; font-size: 12px; }
.container { max-width: 960px; margin: 0 auto; }
```

**Mapa semântico de cor** (use sempre o mesmo significado):

| Cor | Significado | Aplicação |
| --- | --- | --- |
| Laranja | Acento da marca / numeração | header, `.steps` (bolinhas), checklist |
| Verde | Sucesso, teste passando | `.status.pass`, `.dot-pass`, `.alert.success`, `.tier-1` |
| Amarelo | Aviso, skip, deferido | `.status.skip`, `.alert.warn`, `.tier-2` |
| Azul | Informação, pendente | `.status.pend`, `.alert.info` |
| Vermelho | Erro, não feito | `.status.no`, `.alert.danger` |

---

## Blocos reutilizáveis

### Card colapsável (a unidade de seção)

O coração do layout. Header clicável + body que esconde/mostra. Chevron rotaciona via CSS.

```html
<div class="card">
  <div class="card-header open" onclick="toggleCard(this)">
    <div class="icon" style="background:#fff4ec">📋</div>
    <h2>1. Resumo Executivo</h2>
    <span class="chevron">▼</span>
  </div>
  <div class="card-body">
    <!-- conteúdo -->
  </div>
</div>
```

- **Aberto por padrão:** `class="card-header open"` (sem `hidden` no body).
- **Colapsado por padrão:** `class="card-header"` + `<div class="card-body hidden">`.
- O `style="background:#…"` do `.icon` usa o tom `*-light` da cor temática da seção
  (📋 laranja `#fff4ec`, ✅ verde `#e8f7ef`, 🧪 verde, 🔧 roxo `#f3e8ff`, 📐 amarelo `#fef9ec`).

```css
.card { background:#fff; border-radius:var(--radius); box-shadow:var(--shadow); margin-bottom:16px; }
.card-header { display:flex; align-items:center; gap:10px; padding:14px 20px; cursor:pointer;
  user-select:none; border-bottom:1px solid var(--grey-200); }
.card-header .icon { width:32px; height:32px; border-radius:6px; display:flex;
  align-items:center; justify-content:center; font-size:16px; }
.card-header h2 { font-size:15px; font-weight:600; flex:1; }
.card-header .chevron { transition: transform .2s; color:var(--grey-400); }
.card-header.open .chevron { transform: rotate(180deg); }
.card-body { padding:20px; }
.card-body.hidden { display:none; }
```

### Alert (4 variantes)

Caixa com borda esquerda colorida + ícone. Use para ressalvas, contexto e contratos.

```html
<div class="alert warn">
  <span class="alert-icon">⚠️</span>
  <div><strong>Hunk NÃO portado (decisão deliberada):</strong> …</div>
</div>
```

Variantes: `.alert.info` (ℹ️), `.alert.warn` (⚠️), `.alert.success` (♿/✅), `.alert.danger` (⛔).

```css
.alert { border-radius:var(--radius); padding:12px 16px; margin-bottom:16px; font-size:13px;
  display:flex; gap:10px; align-items:flex-start; border-left:3px solid; }
.alert-icon { flex-shrink:0; font-size:18px; }
.alert.info    { background:var(--blue-light);   border-color:var(--blue); }
.alert.warn    { background:var(--yellow-light); border-color:var(--yellow); }
.alert.success { background:var(--green-light);  border-color:var(--green); }
.alert.danger  { background:var(--red-light);    border-color:var(--red); }
```

### Test-block (evidência Tier 1)

Resultado de suíte de teste com cabeçalho (arquivo + status) e itens com bolinha.

```html
<div class="test-block">
  <div class="test-header">
    <span>📄 src/tests/components/Heading/heading.test.tsx</span>
    <span class="status pass">✓ 8 / 8 passando</span>
  </div>
  <ul>
    <li><span class="dot dot-pass"></span><span>renders correctly with default size</span></li>
    <li><span class="dot dot-pass"></span><span>
      <strong>should expose accessibilityRole header</strong>
      <span class="tag tag-a11y">a11y</span> <span class="tag tag-rtl">novo</span>
    </span></li>
  </ul>
</div>
```

`status` aceita `.pass` (verde), `.skip` (amarelo), `.pend` (azul), `.no` (vermelho).
`dot` aceita `.dot-pass` / `.dot-skip`. Tags inline: `.tag-a11y`, `.tag-ts`, `.tag-rtl`,
`.tag-comp`.

### Steps numerados (roteiro / instruções)

Numeração automática via CSS counter — não escreva números à mão.

```html
<ol class="steps">
  <li><div class="step-text"><strong>Ativar VoiceOver / TalkBack</strong>
    iOS: Ajustes → Acessibilidade → VoiceOver.<br>Android: … → TalkBack.</div></li>
  <li><div class="step-text"><strong>Navegar até a tela do componente</strong> …</div></li>
</ol>
```

```css
.steps { list-style:none; counter-reset:step; }
.steps li { counter-increment:step; display:flex; gap:12px; margin-bottom:12px; align-items:flex-start; }
.steps li::before { content:counter(step); flex-shrink:0; width:24px; height:24px; border-radius:50%;
  background:var(--orange); color:#fff; font-weight:700; font-size:12px;
  display:flex; align-items:center; justify-content:center; }
```

### Checklist de aceitação

```html
<ul class="checklist">
  <li>Role "header" anunciado pelo leitor de tela</li>
  <li>Foco não duplica título + subtítulo</li>
</ul>
```

```css
.checklist { list-style:none; }
.checklist li { padding:4px 0 4px 26px; position:relative; }
.checklist li::before { content:"☐"; position:absolute; left:0; color:var(--orange); font-size:15px; }
```

### Flow-card (roteiro de navegação colapsável — seção 2.5)

Card colapsável menor, por fluxo de app (Check-in, Aquisição, Conta…). JS inline, sem
função global.

```html
<div class="flow-card">
  <div class="flow-card-header" onclick="this.nextElementSibling.classList.toggle('open')">
    <span>✈️</span><span>Check-in</span>
    <span class="flow-badge badge-checkin">Check-in</span>
  </div>
  <div class="flow-card-body">
    <div class="comp-tags">
      <span class="tag tag-comp"><code>TgrHeaderFlowJumbo</code></span>
    </div>
    <strong>Tela: CheckinDoneScreen</strong>
    <ol class="flow-steps"><li>Abra o app → toque em <em>Check-in</em>…</li></ol>
    <div class="flow-expected"><strong>Resultado esperado:</strong> …</div>
  </div>
</div>
```

Badges de fluxo (tons locais): `.badge-checkin` (azul), `.badge-aquis` (verde),
`.badge-conta` (roxo), `.badge-status` (amarelo), `.badge-auth` (vermelho).
`.flow-expected` é a caixa de resultado esperado (borda azul à esquerda).

### Grid de prints de referência (seção 2.6)

Duas colunas iOS × Android por componente. Esta é a saída do **modo `--reference`** do
Anemoi (captura pós-fix única — ver [`ds-evidence.md`](ds-evidence.md)).

```html
<p class="ref-component-title">TgrHeaderFlowJumbo</p>
<div class="ref-grid">
  <div class="ref-cell">
    <img src="../../Header/2026-06-08T20-44-23-687Z/reference/ios/Header-flow-jumbo.png"
         alt="TgrHeaderFlowJumbo iOS" />
    <span>iOS (iPhone 16 Simulator)</span>
  </div>
  <div class="ref-cell">
    <img src="../../Header/2026-06-08T20-47-27-285Z/reference/android/Header-flow-jumbo.png"
         alt="TgrHeaderFlowJumbo Android" />
    <span>Android (Medium Phone API 36)</span>
  </div>
</div>
```

```css
.ref-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; }
.ref-cell { display:flex; flex-direction:column; align-items:center; gap:6px; }
.ref-cell img { max-width:100%; border:1px solid #dde1e7; border-radius:6px;
  box-shadow:0 1px 4px rgba(0,0,0,.08); }
.ref-cell span { font-size:11px; color:#555; font-weight:600; }
.ref-component-title { font-size:13px; font-weight:700; margin:16px 0 8px; color:#1a1a2e; }
```

> **Antes/depois conceitual:** em card de a11y o par de prints é **pixel-idêntico de
> propósito**. Por isso a seção 2.4 usa uma **tabela** "Antes do port × Depois do port"
> descrevendo o comportamento do leitor de tela (não imagens), e a 2.6 traz **só o
> pós-fix** como referência visual do componente. Ver
> [ADR 0003](adr/0003-escada-evidencia-a11y-vs-pixel.md).

### Tabela padrão

```css
table { width:100%; border-collapse:collapse; font-size:13px; }
th { text-align:left; background:var(--grey-100); padding:8px 10px; font-weight:600;
  border-bottom:2px solid var(--grey-200); }
td { padding:8px 10px; border-bottom:1px solid var(--grey-200); vertical-align:top; }
tr:hover td { background:var(--grey-100); }
```

### Bloco de diff (seção 4)

`<pre>` com tema escuro e spans de cor por tipo de linha. Útil para mostrar o port no
source do DS.

```html
<pre><span class="diff-file">--- a/src/components/Heading/index.tsx</span>
<span class="diff-file">+++ b/src/components/Heading/index.tsx</span>
<span class="diff-hunk">@@ -1,5 +1,5 @@</span>
 import React from "react";
<span class="diff-del">-import {AccessibilityProps} from "react-native";</span>
<span class="diff-add">+import {AccessibilityProps, Text} from "react-native";</span></pre>
```

```css
pre { background:#1e1e1e; color:#d4d4d4; border-radius:var(--radius); padding:16px;
  overflow-x:auto; line-height:1.5; }
.diff-add  { color:#b5cea8; }
.diff-del  { color:#ce9178; text-decoration:line-through; opacity:.7; }
.diff-hunk { color:#569cd6; }
.diff-file { color:#9cdcfe; font-weight:700; }
```

---

## JavaScript embutido (tudo que precisa)

Uma única função global para os cards de seção; os flow-cards usam toggle inline.

```html
<script>
  function toggleCard(header) {
    header.classList.toggle('open');
    header.nextElementSibling.classList.toggle('hidden');
  }
</script>
```

Não adicione libs nem mais JS — o relatório é estático por princípio.

---

## Como montar um relatório novo (passo a passo)

1. **Capture os prints** com o Anemoi no modo referência (pós-fix), iOS e Android:
   `yarn ds:evidence --component <Comp> --card CDCOM-XX --reference --mode package --platform both`
   (ou `--mode source` se já apontando pro DS local). Ver [`ds-evidence.md`](ds-evidence.md).
2. **Escolha a pasta agregadora** do relatório. Para um card multi-componente, use
   `outputs/ds-evidence/CDCOM-XX/<Comp1>-<Comp2>/<timestamp>/` e referencie os PNGs das
   pastas irmãs por `../../<Comp>/<ts>/reference/<plat>/<arq>.png`.
3. **Copie o esqueleto base** e preencha header/footer com o card, componentes e data.
4. **Monte as seções** na ordem canônica usando os blocos acima. Comece pelo mínimo
   (1, 2 com 2.6, 3) e adicione 4/5 conforme o card.
5. **Valide os caminhos de imagem** antes de entregar — resolva cada `src` relativo contra
   a pasta do HTML e confirme que o arquivo existe (um `<img>` quebrado passa despercebido):

   ```bash
   HTML_DIR="outputs/ds-evidence/CDCOM-XX/.../<timestamp>"
   grep -o 'src="[^"]*\.png"' "$HTML_DIR"/*.html | sed 's/src="//;s/"//' | while IFS= read -r rel; do
     abs=$(python3 -c "import os;print(os.path.normpath(os.path.join('$HTML_DIR','$rel')))")
     [ -f "$abs" ] && echo "OK  $(basename "$rel")" || echo "FALTA $rel"
   done
   ```
6. **Revise no navegador.** O Chrome **não abre `file://`** de forma confiável (mostra
   página de erro / bloqueia imagens locais). Sirva por HTTP a partir da raiz do card e
   abra pelo `localhost`:

   ```bash
   cd outputs/ds-evidence/CDCOM-XX && python3 -m http.server 9123
   # abra http://localhost:9123/<sub>/<timestamp>/CDCOM-XX-….html
   ```
7. **Entregue a árvore inteira** (HTML + pastas de imagem) ou um `.zip` da pasta do
   timestamp. Nunca o HTML solto.

---

## Checklist de qualidade do relatório

- [ ] Badge `Anemoi · CDCOM-XX` no header e crédito no footer.
- [ ] Seções QA (1–3) abertas; seções dev (4–5) colapsadas.
- [ ] Toda cor vem de variável `:root` (salvo tons locais de tag/flow-badge).
- [ ] Card de a11y: 2.4 (tabela antes/depois textual) + 2.6 (só pós-fix) + nota do ADR 0003.
- [ ] Todos os `<img src>` resolvem para arquivos existentes (script do passo 5).
- [ ] Revisado servindo por HTTP, não `file://`.
- [ ] Pasta completa empacotada para anexo no card.

---

## Referências

- [`ds-evidence.md`](ds-evidence.md) — guia operacional do harness (captura, flags, modo
  `--reference`, troubleshooting).
- [`CONTEXT.md`](../CONTEXT.md) — glossário do domínio.
- [ADR 0003 — Escada de Evidência: a11y vs pixel](adr/0003-escada-evidencia-a11y-vs-pixel.md)
- Relatório de referência: `outputs/ds-evidence/CDCOM-78/Header-Heading/<ts>/CDCOM-78-Header-Heading.html`.
