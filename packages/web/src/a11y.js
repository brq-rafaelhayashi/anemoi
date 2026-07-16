'use strict';
// Analise de acessibilidade por celula, no molde do parity.js: agrega as
// auditorias axe por framework e compara a arvore ARIA de cada wrapper contra
// o baseline (paridade semantica). Consome grupos de groupByCell (campo
// transiente _a11y), grava artefatos de divergencia no runDir e devolve os
// grupos com o bloco `a11y` do manifesto.

const fs = require('node:fs');
const path = require('node:path');
const {WCAG_TAGS} = require('@gol-smiles/anemoi-core');
const {DEFAULT_PAIRS} = require('./parity');

// 'react/gol/button--primary/sm/light.aria.yaml' -> 'gol-button--primary-sm-light'
// Espelha o nome dos diffs de pixel (brand-storyId-viewport-theme). Os
// segmentos ja foram validados por assertSafePathSegment na captura.
function fileBaseOf(ariaRelPath) {
  const segments = ariaRelPath.split('/').slice(1);
  const last = segments.pop().replace(/\.aria\.yaml$/, '');
  return [...segments, last].join('-');
}

function auditOf(entry) {
  if (entry.error) return {error: entry.error};
  return {violations: entry.violations, artifactPath: entry.relPath};
}

function computeA11y(groups, runDir, {pairs = DEFAULT_PAIRS} = {}) {
  return groups.map(g => {
    const {_a11y, ...rest} = g;
    if (!_a11y) return rest;

    const audits = {};
    for (const [framework, entry] of Object.entries(_a11y)) {
      audits[framework] = auditOf(entry);
    }

    const ariaParity = [];
    for (const {reference, against} of pairs) {
      const ref = _a11y[reference];
      const other = _a11y[against];
      // Lado ausente ou com erro de coleta: sem comparacao possivel — o erro
      // ja esta em audits e conta como divergencia via hasA11yDivergence.
      if (!ref || !other || ref.error || other.error) continue;
      const match = ref.ariaSnapshot === other.ariaSnapshot;
      const entry = {against, match};
      if (!match) {
        const diffRel = path.join('aria-diff', `${against}-vs-${reference}`, `${fileBaseOf(other.ariaRelPath)}.txt`);
        const abs = path.join(runDir, diffRel);
        fs.mkdirSync(path.dirname(abs), {recursive: true});
        fs.writeFileSync(abs, [
          `--- ${reference} (reference): ${ref.ariaRelPath}`,
          ref.ariaSnapshot.trimEnd(),
          '',
          `+++ ${against} (against): ${other.ariaRelPath}`,
          other.ariaSnapshot.trimEnd(),
          '',
        ].join('\n'));
        entry.diffPath = diffRel;
      }
      ariaParity.push(entry);
    }

    return {...rest, a11y: {audits, ariaParity}};
  });
}

// Divergencia de acessibilidade: qualquer violacao axe (qualquer impacto),
// arvore ARIA divergente do baseline, ou coleta indisponivel — "nao consegui
// medir" nunca passa um gate como se estivesse acessivel. Grupos sem a11y
// (manifests antigos, --no-a11y) nunca divergem.
function hasA11yDivergence(groups) {
  return groups.some(g => {
    if (!g.a11y) return false;
    const audits = Object.values(g.a11y.audits || {});
    return audits.some(a => a.error || (a.violations || []).length > 0)
      || (g.a11y.ariaParity || []).some(p => p.match === false);
  });
}

const IMPACT_ORDER = ['minor', 'moderate', 'serious', 'critical'];

// Agregado do manifesto: veredito rapido sem varrer os grupos.
// undefined quando nenhum grupo tem a11y (coleta desligada ou manifesto antigo).
function summarizeA11y(groups) {
  let hasData = false;
  let totalViolations = 0;
  let worstImpact = null;
  let ariaMismatches = 0;
  for (const g of groups) {
    if (!g.a11y) continue;
    hasData = true;
    for (const audit of Object.values(g.a11y.audits || {})) {
      for (const violation of audit.violations || []) {
        totalViolations += 1;
        if (IMPACT_ORDER.indexOf(violation.impact) > IMPACT_ORDER.indexOf(worstImpact)) {
          worstImpact = violation.impact;
        }
      }
    }
    ariaMismatches += (g.a11y.ariaParity || []).filter(p => p.match === false).length;
  }
  if (!hasData) return undefined;
  return {totalViolations, worstImpact, ariaMismatches, ruleset: WCAG_TAGS};
}

module.exports = {computeA11y, hasA11yDivergence, summarizeA11y};
