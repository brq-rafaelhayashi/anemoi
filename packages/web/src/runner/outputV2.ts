import {aggregateAxeDiagnostics, dominantAxeEvidence} from './axeDiagnostics.ts';
import type {AxeAxes, AxeDiagnostics, AxeRuleDiagnostic} from './axeDiagnostics.ts';

type Dimension = {
  status: string;
  failed: number;
  unavailable: number;
};

type ManifestV2 = {
  tool: string;
  status: string;
  card: string;
  component: string;
  cellCount: number;
  axes: {browsers: string[]};
  gate: {
    status?: string;
    trusted: boolean;
    dimensions: Record<string, Dimension>;
  };
  groups?: Array<Record<string, unknown>>;
  a11y?: {
    totalViolations: number;
    worstImpact: string | null;
    ariaMismatches: number;
    collectionErrors: number;
    needsReview: number;
    ruleset: string[];
  };
  behavior?: {
    results?: Array<{
      logicalTestId: string;
      stability: string;
      routes: Array<{
        routeId: string;
        parity: string;
        frameworks?: Record<string, {conformance?: string}>;
      }>;
    }>;
  };
  attempts?: Array<{
    logicalTestId?: string;
    stability: string;
    attempts?: Array<{
      attempt: number;
      status: string;
      resultPath: string;
      attachments?: string[];
    }>;
  }>;
};

const FRAMEWORKS = ['wc', 'react', 'angular'];

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] as string);
}

function escapeMarkdownInline(value: unknown) {
  return escapeHtml(String(value ?? '').replace(/\s+/g, ' ').trim())
    .replace(/[\\`*_\[\]()]/g, character => `\\${character}`);
}

function safeRelativeHref(value: unknown) {
  if (typeof value !== 'string'
    || !value
    || /[\\%?#\u0000-\u001f\u007f]/.test(value)
    || value.startsWith('/')
    || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return null;
  }
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return null;
  return segments.map(segment => encodeURIComponent(segment)).join('/');
}

function safeAxeArtifactHref(value: unknown) {
  const href = safeRelativeHref(value);
  return href?.startsWith('results/') && href.endsWith('.a11y.json') ? href : null;
}

function expectedResultHref(logicalTestId: unknown, attempt: unknown) {
  const id = safeRelativeHref(logicalTestId);
  if (!id || id.includes('/') || !Number.isSafeInteger(attempt) || (attempt as number) < 0) return null;
  return `results/${id}/attempt-${attempt}/result.json`;
}

function scopedAttachmentHref(resultHref: string | null, attachment: unknown) {
  const attachmentHref = safeRelativeHref(attachment);
  if (!resultHref || !attachmentHref) return null;
  const attemptDirectory = resultHref.split('/').slice(0, -1).join('/');
  return attachmentHref.startsWith(`${attemptDirectory}/`) ? attachmentHref : null;
}

function titleCase(value: string) {
  if (value.toLowerCase() === 'webkit') return 'WebKit';
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function axesText(axes: AxeAxes) {
  return [
    ['browser', axes.browser],
    ['framework', axes.framework],
    ['brand', axes.brand],
    ['story', axes.story],
    ['viewport', axes.viewport],
    ['theme', axes.theme],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

const AXE_AXIS_DIMENSIONS: Array<keyof AxeAxes> = [
  'browser',
  'framework',
  'brand',
  'story',
  'viewport',
  'theme',
];

function renderAxeSummary(diagnostics: AxeDiagnostics) {
  if (diagnostics.totalAudits === 0) return [];
  const auditCounts = [
    plural(diagnostics.totalAudits, 'auditoria', 'auditorias'),
    plural(diagnostics.failedAudits, 'falhou', 'falharam'),
    plural(diagnostics.passedAudits, 'passou', 'passaram'),
    plural(diagnostics.unavailableAudits, 'indisponivel', 'indisponiveis'),
  ].join('; ');
  const rules = diagnostics.rules.map(rule => {
    const evidence = dominantAxeEvidence(rule);
    const details = [
      plural(rule.affectedAudits, 'auditoria afetada', 'auditorias afetadas'),
      plural(rule.occurrences, 'ocorrencia', 'ocorrencias'),
      plural(rule.affectedNodes, 'no afetado', 'nos afetados'),
      evidence?.target ? `alvo: ${escapeMarkdownInline(evidence.target)}` : '',
      evidence?.failureSummary
        ? `failureSummary: ${escapeMarkdownInline(evidence.failureSummary)}`
        : '',
    ].filter(Boolean).join('; ');
    const impact = rule.impact ? ` (impacto: ${escapeMarkdownInline(rule.impact)})` : '';
    return `- ${escapeMarkdownInline(rule.id)}${impact}: ${details}`;
  });
  return [
    '',
    '## Diagnostico Axe',
    '',
    `- Auditorias: ${auditCounts}`,
    `- Regras: ${plural(diagnostics.uniqueRules, 'regra unica', 'regras unicas')}; ${plural(diagnostics.ruleOccurrences, 'ocorrencia', 'ocorrencias')}; ${plural(diagnostics.affectedNodes, 'no afetado', 'nos afetados')}`,
    `- needsReview: ${escapeMarkdownInline(diagnostics.needsReview)}`,
    `- erros de coleta: ${escapeMarkdownInline(diagnostics.errors.length)}`,
    ...rules,
  ];
}

function renderAxeEvidenceArtifacts(artifacts: string[], linkedArtifacts: Set<string>) {
  const links = artifacts.map(safeAxeArtifactHref).filter((href): href is string => Boolean(href));
  if (links.length === 0) return '';
  const references = links.map(href => {
    if (linkedArtifacts.has(href)) {
      return `<span class="axe-artifact-reference">${escapeHtml(href)} (já listado)</span>`;
    }
    linkedArtifacts.add(href);
    return `<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>`;
  });
  if (references.length === 1) return `<p>Artefato JSON: ${references[0]}</p>`;
  return `<details class="axe-artifacts"><summary>Artefatos JSON (${escapeHtml(references.length)})</summary><ul>${references.map(reference => `<li>${reference}</li>`).join('')}</ul></details>`;
}

function renderAxeAxes(axes: AxeAxes[]) {
  if (axes.length === 0) return '';
  const dimensions = AXE_AXIS_DIMENSIONS.map(dimension => {
    const counts = new Map<string, number>();
    for (const value of axes.map(item => item[dimension]).filter(Boolean)) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    const values = [...counts].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return values.length > 0 ? `<div><dt>${dimension}</dt><dd>${values
      .map(([value, count]) => `${escapeHtml(value)} (${escapeHtml(count)})`).join(', ')}</dd></div>` : '';
  }).filter(Boolean).join('');
  return dimensions
    ? `<p>Distribuicao por eixos:</p><dl class="axe-axis-distribution">${dimensions}</dl>`
    : '';
}

function renderAxeRule(
  rule: AxeRuleDiagnostic,
  kind: 'violation' | 'review',
  linkedArtifacts: Set<string>,
) {
  const impact = rule.impact || 'sem impacto';
  const evidence = rule.evidence.map(item => `<details class="axe-evidence"><summary>Alvo: ${escapeHtml(item.target || 'indisponivel')} · ${escapeHtml(plural(item.affectedNodes, 'no', 'nos'))}</summary>
<p><strong>Alvo:</strong> ${escapeHtml(item.target || 'indisponivel')}</p>
<p><strong>HTML afetado:</strong></p><pre><code>${escapeHtml(item.html || 'indisponivel')}</code></pre>
<p><strong>failureSummary:</strong> ${escapeHtml(item.failureSummary || 'indisponivel')}</p>
${renderAxeEvidenceArtifacts(item.artifacts, linkedArtifacts)}</details>`).join('');
  return `<details class="axe-rule ${kind}"><summary><strong>${escapeHtml(rule.id)}</strong> · impacto: ${escapeHtml(impact)} · ${escapeHtml(plural(rule.affectedAudits, 'auditoria afetada', 'auditorias afetadas'))} · ${escapeHtml(plural(rule.affectedNodes, 'no afetado', 'nos afetados'))}</summary>
${rule.description ? `<p>${escapeHtml(rule.description)}</p>` : ''}
${rule.wcag.length ? `<p>WCAG: ${rule.wcag.map(escapeHtml).join(', ')}</p>` : ''}
<p>${escapeHtml(plural(rule.occurrences, 'ocorrencia', 'ocorrencias'))}</p>
${renderAxeAxes(rule.axes)}${evidence}</details>`;
}

function renderAxeHtml(diagnostics: AxeDiagnostics) {
  if (diagnostics.totalAudits === 0) return '';
  const linkedArtifacts = new Set<string>();
  const rules = diagnostics.rules.map(rule => renderAxeRule(rule, 'violation', linkedArtifacts)).join('');
  const review = diagnostics.reviewRules
    .map(rule => renderAxeRule(rule, 'review', linkedArtifacts)).join('');
  const detailedReviewItems = diagnostics.reviewRules
    .reduce((total, rule) => total + rule.occurrences, 0);
  const unavailableReviewItems = Math.max(0, diagnostics.needsReview - detailedReviewItems);
  const unavailableReview = unavailableReviewItems > 0
    ? `<p>Há ${escapeHtml(plural(unavailableReviewItems, 'item', 'itens'))} em needsReview com detalhes e metadados indisponíveis.</p>`
    : '';
  const reviewState = (review || unavailableReview)
    ? `${review}${unavailableReview}`
    : '<p>Nenhum item requer revisão.</p>';
  const errors = diagnostics.errors.map(item =>
    `<li>${escapeHtml(axesText(item.axes))}: ${escapeHtml(item.error)}</li>`).join('');
  return `<section class="axe"><h2>Diagnostico Axe</h2>
<p>${escapeHtml(plural(diagnostics.totalAudits, 'auditoria', 'auditorias'))}: ${escapeHtml(diagnostics.failedAudits)} falharam, ${escapeHtml(diagnostics.passedAudits)} passaram, ${escapeHtml(diagnostics.unavailableAudits)} indisponiveis. ${escapeHtml(plural(diagnostics.uniqueRules, 'regra unica', 'regras unicas'))}, ${escapeHtml(plural(diagnostics.ruleOccurrences, 'ocorrencia', 'ocorrencias'))}, ${escapeHtml(plural(diagnostics.affectedNodes, 'no afetado', 'nos afetados'))}.</p>
${rules || '<p>Sem violacoes Axe.</p>'}
<h3>needsReview (${escapeHtml(diagnostics.needsReview)})</h3><p>needsReview é inconclusivo e não altera o gate.</p>${reviewState}
<h3>Erros de coleta (${escapeHtml(diagnostics.errors.length)})</h3>${errors ? `<ul>${errors}</ul>` : '<p>Nenhum erro de coleta.</p>'}
</section>`;
}

export function renderSummaryV2(manifest: ManifestV2) {
  const dimensions = Object.entries(manifest.gate.dimensions).map(([name, value]) =>
    `- ${escapeMarkdownInline(name)}: ${escapeMarkdownInline(value.status)} (falhas: ${escapeMarkdownInline(value.failed)}, indisponíveis: ${escapeMarkdownInline(value.unavailable)})`);
  const flaky = (manifest.attempts || []).filter(item => item.stability === 'flaky').length;
  const axeDiagnostics = aggregateAxeDiagnostics(manifest.groups || []);
  return [
    `# ${escapeMarkdownInline(manifest.tool)} - ${escapeMarkdownInline(manifest.component)}`,
    '',
    `- Card: ${escapeMarkdownInline(manifest.card)}`,
    `- Status: ${escapeMarkdownInline(manifest.status)}`,
    `- Gate confiável: ${manifest.gate.trusted ? 'sim' : 'não'}`,
    `- Browsers: ${manifest.axes.browsers.map(titleCase).map(escapeMarkdownInline).join(', ')}`,
    `- Células capturadas: ${escapeMarkdownInline(manifest.cellCount)}`,
    `- Resultados flaky: ${escapeMarkdownInline(flaky)}`,
    '',
    '## Dimensões de confiança',
    '',
    ...dimensions,
    ...renderAxeSummary(axeDiagnostics),
    '',
    '## Artefatos',
    '',
    '- Manifest: manifest.json',
    '- Galeria: index.html',
    '',
  ].join('\n');
}

export function renderHtmlV2(manifest: ManifestV2) {
  const axeDiagnostics = aggregateAxeDiagnostics(manifest.groups || []);
  const dimensionRows = Object.entries(manifest.gate.dimensions).map(([name, value]) =>
    `<tr><td>${escapeHtml(name)}</td><td class="${escapeHtml(value.status)}">${escapeHtml(value.status)}</td><td>${escapeHtml(value.failed)}</td><td>${escapeHtml(value.unavailable)}</td></tr>`).join('');
  const visualRows = (manifest.groups || []).map(group => {
    const browser = group.browser || (group._cell as Record<string, unknown> | undefined)?.browser;
    const frameworkCells = FRAMEWORKS.map(framework => {
      const source = safeRelativeHref(group[framework]);
      return source
        ? `<td><img src="${escapeHtml(source)}" alt="${escapeHtml(framework)}" /></td>`
        : '<td>indisponível</td>';
    }).join('');
    return `<tr data-browser="${escapeHtml(browser)}"><td>${escapeHtml(browser)}</td><td>${escapeHtml(group.label)}</td>${frameworkCells}</tr>`;
  }).join('');
  const behaviorRows = (manifest.behavior?.results || []).flatMap(result =>
    result.routes.map(route => {
      const conformance = FRAMEWORKS.map(framework =>
        `<td>${escapeHtml(route.frameworks?.[framework]?.conformance || 'indisponível')}</td>`).join('');
      return `<tr><td>${escapeHtml(result.logicalTestId)}</td><td>${escapeHtml(result.stability)}</td><td>${escapeHtml(route.routeId)}</td><td>${escapeHtml(route.parity)}</td>${conformance}</tr>`;
    })).join('');
  const attemptRows = (manifest.attempts || []).flatMap(logical =>
    (logical.attempts || []).map(attempt => {
      const candidateResultHref = safeRelativeHref(attempt.resultPath);
      const expectedHref = expectedResultHref(logical.logicalTestId, attempt.attempt);
      const resultHref = candidateResultHref === expectedHref ? candidateResultHref : null;
      const attachments = (attempt.attachments || []).map(item => {
        const href = scopedAttachmentHref(resultHref, item);
        return href ? `<a href="${escapeHtml(href)}">${escapeHtml(item.split('/').at(-1))}</a>` : '';
      }).filter(Boolean).join(' ') || '—';
      const resultLink = resultHref
        ? `<a href="${escapeHtml(resultHref)}">result.json</a>`
        : 'indisponível';
      return `<tr><td>${escapeHtml(logical.logicalTestId)}</td><td>${escapeHtml(logical.stability)}</td><td>${escapeHtml(attempt.attempt)}</td><td>${escapeHtml(attempt.status)}</td><td>${resultLink}</td><td>${attachments}</td></tr>`;
    })).join('');
  const browserButtons = manifest.axes.browsers.map(browser =>
    `<button type="button" data-filter="${escapeHtml(browser)}">${escapeHtml(browser)}</button>`).join('');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(manifest.component)} — confiança</title>
<style>body{font:14px system-ui;margin:24px;background:#f6f7f9;color:#1d2433}table{border-collapse:collapse;width:100%;background:white;margin:16px 0}th,td{border:1px solid #d8dce3;padding:8px;text-align:left;vertical-align:top}img{max-width:240px}.passed{color:#167044}.failed,.unavailable{color:#b42318}.chips button{margin-right:8px}details{background:white;border:1px solid #d8dce3;margin:8px 0;padding:8px}details details{background:#f6f7f9}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body>
<h1>${escapeHtml(manifest.component)}</h1><p>Gate: <strong>${escapeHtml(manifest.gate.status)}</strong> · confiável: ${manifest.gate.trusted ? 'sim' : 'não'}</p>
<h2>Dimensões do gate</h2><table><thead><tr><th>Dimensão</th><th>Status</th><th>Falhas</th><th>Indisponíveis</th></tr></thead><tbody>${dimensionRows}</tbody></table>
${renderAxeHtml(axeDiagnostics)}
<h2>Evidência visual por browser</h2><div class="chips">${browserButtons}<button type="button" data-filter="all">todos</button></div>
<table><thead><tr><th>Browser</th><th>Cena</th><th>WC</th><th>React</th><th>Angular</th></tr></thead><tbody id="visual">${visualRows}</tbody></table>
<h2>Comportamento</h2><table><thead><tr><th>Teste</th><th>Estabilidade</th><th>Roteiro</th><th>Paridade</th><th>WC</th><th>React</th><th>Angular</th></tr></thead><tbody>${behaviorRows}</tbody></table>
<h2>Tentativas e diagnósticos</h2><table><thead><tr><th>Teste</th><th>Estabilidade</th><th>Tentativa</th><th>Status</th><th>Resultado</th><th>Attachments</th></tr></thead><tbody>${attemptRows}</tbody></table>
<script>document.querySelector('.chips').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;document.querySelectorAll('#visual tr').forEach(row=>row.hidden=button.dataset.filter!=='all'&&row.dataset.browser!==button.dataset.filter);});</script>
</body></html>`;
}
