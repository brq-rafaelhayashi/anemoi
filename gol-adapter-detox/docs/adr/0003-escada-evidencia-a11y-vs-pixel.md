# Escada de Evidência: a11y vs pixel, não "print de tudo"

## Status

accepted

## Contexto

O patch `@gol-smiles+tangerina-react-native-core+6.0.2.patch` é ~80% acessibilidade: contando as linhas adicionadas, 65 referências a `accessibility*` (28 `accessibilityLabel`, 13 `accessibilityRole`, 8 `accessibilityState`, 6 `importantForAccessibility`) contra ~12 linhas visuais (`lineHeight`, `borderColor`). Verificado num caso real (`InputCounter`): o diff adiciona só props de a11y, **zero mudança de pixel**.

A proposta inicial era um bot que navega emuladores e tira print antes/depois de todas as telas. Para a maioria dos hunks, o par de prints seria **pixel-idêntico** — não prova o fix de a11y, e pior, lê para a QA como "nada mudou, nada a testar".

## Decisão

O tool produz artefato por **tipo de hunk** (Escada de Evidência), não um print único para todos:

- **Tier 1 — Assert de A11y** (RTL + `jest-native`, no **repo do DS**): prova nível de prop (role/label/state). Cobre a maioria dos hunks de a11y, determinístico, sem emulador. Os testes do DS já são editados junto ao fix.
- **Tier 2 — Print de Regressão** (`adb`/`simctl screenshot`, Android + iOS): para hunks visuais o print É a prova; para hunks de a11y o print idêntico é a **guarda de regressão** (provou que a semântica não quebrou o layout).
- **Tier 3 — Dump Nativo** (`adb shell uiautomator dump`, **Android-only**): árvore de a11y nativa para o que o RTL não vê — foco, `importantForAccessibility`, leitura duplicada.

Para hunk de a11y, o Bundle de Evidência carrega explicitamente: "pixels idênticos = esperado; semântica mudou: <diff>; QA valide X no TalkBack/VoiceOver".

## Consequências

- iOS não tem dump de a11y nativo limpo via `simctl`; resolver isso exigiria Appium/XCUITest. Optou-se por **não** pagar esse imposto: Tier 1 cobre a11y cross-platform no nível de prop; iOS native fica para spot-check manual de VoiceOver guiado pelo bundle.
- A QA recebe instrução de validação por leitor de tela junto do par de prints — não um par idêntico solto.
