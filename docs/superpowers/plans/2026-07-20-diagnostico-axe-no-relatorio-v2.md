# Diagnostico Axe no Relatorio V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restaurar a causa das falhas Axe no relatorio V2 e na falha do Playwright sem mudar o gate ou o schema de evidencias.

**Architecture:** Um modulo TypeScript puro agrega `groups[].a11y` em metricas, regras e assinaturas de evidencia. O renderer V2 e o formatter da tentativa consomem esse agregado, evitando semanticas de contagem divergentes.

**Tech Stack:** Node.js 24.13.1, TypeScript ESM, `node:test`, Playwright Test 1.61.1.

## Global Constraints

- Alterar apenas o Anemoi Web, seus testes e documentacao.
- Nao mudar `schemaVersion`, o gate ou o formato do Resultado Atomico.
- Manter a galeria autocontida e escapar todo conteudo dinamico.
- Links Axe devem ser relativos, contidos em `results/` e terminar em `.a11y.json`.
- Seguir RED-GREEN-REFACTOR.

---

### Task 1: Agregar o diagnostico Axe

**Files:**
- Create: `packages/web/src/runner/axeDiagnostics.ts`
- Create: `packages/web/test/axe-diagnostics.test.js`

**Interfaces:**
- Consumes: `groups: unknown[]` no shape ja persistido em `manifest.groups`.
- Produces: `aggregateAxeDiagnostics(groups)` e `formatAttemptFailure(result)`.

- [ ] **Step 1: Escrever testes falhando para contagens e agrupamento**

Cobrir seis auditorias, duas afetadas pela mesma regra e tres nos. Esperar `totalAudits: 6`,
`failedAudits: 2`, `passedAudits: 4`, `uniqueRules: 1`, `ruleOccurrences: 2` e
`affectedNodes: 3`. Adicionar uma segunda assinatura da mesma regra e verificar que ela permanece
separada dentro da regra.

- [ ] **Step 2: Rodar o teste e confirmar RED**

Run: `node --test packages/web/test/axe-diagnostics.test.js`
Expected: FAIL com `ERR_MODULE_NOT_FOUND` para `axeDiagnostics.ts`.

- [ ] **Step 3: Implementar o agregador defensivo**

Validar records/arrays em runtime, normalizar whitespace, ordenar deterministicamente e agrupar
regras por `id`, evidencias por `target + failureSummary`. Contabilizar auditorias, ocorrencias e
nos separadamente.

- [ ] **Step 4: Implementar o formatter da tentativa**

O texto deve incluir somente causas presentes: erros de captura, paridade visual/dimensional,
Axe, ARIA e rotas comportamentais. Para Axe, incluir regra, impacto, contagens, eixos, alvo,
`failureSummary` e um artefato representativo.

- [ ] **Step 5: Rodar testes e confirmar GREEN**

Run: `node --test packages/web/test/axe-diagnostics.test.js`
Expected: PASS.

---

### Task 2: Projetar o diagnostico nas superficies publicas

**Files:**
- Modify: `packages/web/src/runner/outputV2.ts`
- Modify: `packages/web/src/runner/fixtures.ts`
- Modify: `packages/web/test/output-v2.test.js`

**Interfaces:**
- Consumes: `aggregateAxeDiagnostics(groups)` e `formatAttemptFailure(result)` da Task 1.
- Produces: HTML, Markdown e mensagem Playwright com a mesma semantica.

- [ ] **Step 1: Escrever testes falhando do Markdown e HTML**

Adicionar A11y ao manifesto de teste e exigir contagens, `color-contrast`, impacto, alvo,
`failureSummary`, distribuicao e link local para `.a11y.json`. Cobrir `needsReview`, erro de
coleta, manifesto sem A11y, XSS e paths inseguros.

- [ ] **Step 2: Rodar o teste e confirmar RED**

Run: `node --test packages/web/test/output-v2.test.js`
Expected: FAIL porque o renderer ainda nao contem `Diagnostico Axe`.

- [ ] **Step 3: Renderizar o diagnostico**

Adicionar secao compacta ao Markdown e `<details>` nativo por regra ao HTML. Escapar todos os
campos e reutilizar `safeRelativeHref` com as restricoes adicionais do artefato Axe.

- [ ] **Step 4: Integrar a mensagem do Playwright**

Substituir `JSON.stringify({logicalTestId, routes})` por `formatAttemptFailure(result)` sem alterar
o objeto persistido nem a condicao de falha.

- [ ] **Step 5: Rodar testes e typecheck**

Run: `node --test packages/web/test/axe-diagnostics.test.js packages/web/test/output-v2.test.js && npm run typecheck -w packages/web`
Expected: PASS.

---

### Task 3: Documentar e verificar o caso real

**Files:**
- Modify: `docs/guides/web.md`
- Test: `packages/web/test/finalize.test.js`

**Interfaces:**
- Consumes: o manifesto V2 finalizado.
- Produces: documentacao de contagens e evidencia de regressao sobre o bundle real.

- [ ] **Step 1: Adicionar regressao de integracao**

Finalizar um resultado com violacao Axe e verificar que `summary.md` e `index.html` contêm regra,
alvo e razao da falha.

- [ ] **Step 2: Documentar a semantica**

Explicar a diferenca entre auditoria afetada, ocorrencia de regra e no afetado, alem da localizacao
dos detalhes e artefatos.

- [ ] **Step 3: Reproduzir no manifesto real preservado**

Renderizar em memoria o `manifest.json` real e verificar 468/144/324 auditorias, uma regra,
144 ocorrencias, 162 nos, `2.7:1` e `4.5:1`.

- [ ] **Step 4: Executar verificacao completa**

Run: `npm test && npm run typecheck -w packages/web && git diff --check`
Expected: PASS sem falhas.

