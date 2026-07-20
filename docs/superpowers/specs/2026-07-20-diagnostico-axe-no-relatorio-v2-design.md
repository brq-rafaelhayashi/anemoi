# Diagnostico Axe no Relatorio V2

## Contexto

O runner baseado em Playwright Test preserva o resultado Axe completo em `manifest.json`,
`result.json` e `*.a11y.json`, mas `summary.md`, `index.html` e a mensagem de falha do Playwright
nao projetam a causa. O gate continua correto; a regressao e de diagnostico.

## Decisao

O Anemoi Web tera um agregador puro derivado de `groups[].a11y`. O manifesto e o Resultado
Atomico permanecem como fontes da verdade e nao mudam de schema.

O agregado separa:

- total de auditorias;
- auditorias com violacao, sem violacao e indisponiveis;
- ocorrencias de regras;
- regras distintas;
- nos afetados;
- itens `needsReview`.

Regras sao agrupadas primeiro por `violation.id`. Dentro de cada regra, evidencias sao agrupadas
pela assinatura normalizada `target + failureSummary`. Isso apresenta uma unica regra repetida sem
misturar causas concretas diferentes da mesma regra.

## Superficies

`summary.md` ganha um diagnostico compacto com contagens, uma linha por regra e uma evidencia
representativa. `index.html` ganha uma secao completa com distribuicao por browser, framework,
tema, story e viewport, evidencias por assinatura e links locais para `*.a11y.json`.

A mensagem do Playwright usa o mesmo agregado sobre os grupos da tentativa. Ela informa a regra,
impacto, eixos, alvo, `failureSummary` e artefato, alem das outras dimensoes que causaram a falha.

## Seguranca e compatibilidade

Todo texto dinamico e escapado. Links de auditoria precisam ser caminhos relativos seguros,
comecar em `results/` e terminar em `.a11y.json`. `helpUrl` nao vira link externo, preservando a
galeria autocontida. Manifestos sem A11y continuam renderizando normalmente.

## Aceitacao

No bundle real do `tgr-button`, a saida deve explicar: 468 auditorias, 144 auditorias com violacao,
324 auditorias sem violacao, uma regra `color-contrast`, 144 ocorrencias e 162 nos afetados. A causa
deve mostrar contraste `2.7:1`, esperado `4.5:1`, no alvo `tgr-button,.label`.
