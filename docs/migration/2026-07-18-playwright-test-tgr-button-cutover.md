# Cutover Web para Playwright Test — `tgr-button`

## Decisão

O executor manual da CLI Web foi removido depois de uma prova automatizada de
equivalência contra o Playwright Test. O comparador cobre estritamente a
interseção observável dos dois motores no Chromium:

- identidade canônica `brand/storyId/viewport/theme`;
- presença das capturas WC, React e Angular;
- `mismatch` e `sizeMatch` da paridade visual;
- indisponibilidade e violações Axe normalizadas;
- paridade ARIA.

Paths de artefato são deliberadamente ignorados. Contrato, rotas, observações e
eventos não são atribuídos ao legado: são invariantes exclusivas do motor novo,
validadas pelos Resultados Atômicos, pelo finalizador e pela Contraprova
Controlada.

## Fonte e ambiente

- Anemoi base: `8e9caffbbf8d136f04c15909dde4f006366f22f9`.
- Tangerina: `5a8481913b8d19fc95f22925e5375db8eedd32d3`.
- Node.js: `24.13.1`.
- Tangerina: `/Users/user/.codex/worktrees/tangerina-browser-support-matrix`.

## Equivalência no Chromium

Runs transitórios usados na prova:

- legado adaptado ao run plan:
  `/Users/user/.codex/worktrees/tangerina-browser-support-matrix/outputs/anemoi-web/ANEMOI-CUTOVER/tgr-button/2026-07-19T15-09-13-456Z-72802d47`;
- Playwright Test Chromium:
  `/Users/user/.codex/worktrees/tangerina-browser-support-matrix/outputs/anemoi-web/ANEMOI-CUTOVER/tgr-button/2026-07-19T15-12-11-715Z-3b73d420`.

Cada motor publicou 52 células canônicas e 156 capturas. Resultado do tracer:

```json
{
  "match": true,
  "comparedCells": 52,
  "differences": []
}
```

Ambos observaram paridade visual e ARIA integrais e as mesmas 48 violações Axe.
O status global dos manifests foi `failed` por essas violações existentes, não
por diferença entre os motores.

## Matriz completa do motor novo

Run transitório:

`/Users/user/.codex/worktrees/tangerina-browser-support-matrix/outputs/anemoi-web/ANEMOI-CUTOVER/tgr-button/2026-07-19T15-13-26-873Z-fe512531`

O run publicou 156 células, 468 capturas e 156 Resultados Atômicos em Chromium,
Firefox e WebKit. Não houve resultado ausente nem flaky. As dimensões
`browserCoverage`, `visualParity`, `dimensions`, `ariaParity`,
`behavioralParity` e `contractCoverage` passaram.

O gate confiável reprovou o estado atual do consumidor (`trusted: false`): 144
violações Axe, 12 falhas de conformidade do roteiro `loading` e 60 tentativas
finais reprovadas. A observação canônica foi igual nos três frameworks
(`ariaBusy: "true"`, `disabled: true`), enquanto o contrato revisado esperava
`disabled: false`; portanto a paridade comportamental permaneceu aprovada. Essa
reprovação foi preservada, não mascarada pelo cutover.

## Contraprova e corte

`node --test packages/web/test/controlled-counterproof.test.js` passou: a
baseline ficou 3/3 e a fixture React defeituosa reprovou nos três browsers por
ausência do evento `tgrClick`, com o orquestrador validando a falha de
`behavioralParity`.

Depois dessas provas, a CLI passou a delegar toda captura ao Playwright Test e
rejeita `--engine`. `--doctor`, `--review-contract`, aliases de repositório e o
serviço Koba foram preservados. `capturePipeline` continua público e marcado
como deprecated somente para compatibilidade com `packages/service`; os
outputs transitórios acima foram removidos e não fazem parte do repositório.
