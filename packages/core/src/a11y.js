// Primitivas de acessibilidade: auditoria axe-core e snapshot da arvore ARIA,
// ambas na page ja aberta pela captura. Agnosticas de consumidor: recebem
// page/selector e nunca conhecem Tangerina.

// Tags axe correspondentes a WCAG A + AA (2.0, 2.1 e 2.2). Exportadas para a
// proveniencia registrar exatamente a regua aplicada no manifesto.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

function axeCoreVersion() {
  try {
    return require('axe-core/package.json').version;
  } catch {
    return null;
  }
}

// Reduz o resultado bruto do axe ao que manifesto e galeria precisam. `nodes`
// preserva alvo, um recorte do HTML (300 chars) e o failureSummary do axe
// (400 chars, com cores/ratios computados — evidencia de triagem, ex.:
// "contrast of 2.7" sem re-rodar a auditoria); o resultado completo fica no
// artefato .a11y.json.
function normalizeRuleResults(ruleResults) {
  return (ruleResults || []).map(violation => ({
    id: violation.id,
    impact: violation.impact ?? null,
    wcag: (violation.tags || []).filter(tag => tag.startsWith('wcag')),
    description: violation.description,
    helpUrl: violation.helpUrl,
    nodes: (violation.nodes || []).map(node => ({
      target: Array.isArray(node.target) ? node.target.join(' ') : String(node.target ?? ''),
      html: String(node.html || '').slice(0, 300),
      failureSummary: String(node.failureSummary || '').slice(0, 400),
    })),
  }));
}

function normalizeViolations(axeResults) {
  return normalizeRuleResults(axeResults.violations);
}

// Injeta o axe-core na pagina e audita o subtree do seletor com as tags WCAG.
// `needsReview` carrega os resultados `incomplete` do axe (ele NAO conseguiu
// medir — fundo gradiente/imagem, stacking): descarta-los em silencio seria o
// verdadeiro canal de falso-negativos.
async function runAxeAudit(page, selector, {tags = WCAG_TAGS} = {}) {
  await page.addScriptTag({path: require.resolve('axe-core')});
  const results = await page.evaluate(
    ([sel, runTags]) => window.axe.run(sel, {
      runOnly: {type: 'tag', values: runTags},
      resultTypes: ['violations', 'incomplete'],
    }),
    [selector, tags],
  );
  return {
    ruleset: tags,
    violations: normalizeViolations(results),
    needsReview: normalizeRuleResults(results.incomplete),
  };
}

// Arvore ARIA do componente em YAML deterministico (Playwright >= 1.49).
async function captureAriaSnapshot(page, selector) {
  return page.locator(selector).ariaSnapshot();
}

module.exports = {WCAG_TAGS, axeCoreVersion, normalizeViolations, runAxeAudit, captureAriaSnapshot};
