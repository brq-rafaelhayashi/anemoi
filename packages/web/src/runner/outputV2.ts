import {aggregateAxeDiagnostics, dominantAxeEvidence} from './axeDiagnostics.ts';
import type {AxeAxes, AxeDiagnostics, AxeRuleDiagnostic} from './axeDiagnostics.ts';
import {projectStateReport} from './stateReport.ts';
import type {StateReportGroup} from './stateReport.ts';

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
  axes: {browsers: string[]; frameworks?: string[]};
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
  if (diagnostics.totalAudits === 0 && diagnostics.structuralUnavailable === 0) return [];
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
  const collectionErrors = diagnostics.errors.filter(error => !error.kind);
  const structuralCauses = diagnostics.errors
    .filter(error => error.kind)
    .map(error => `- Auditoria indisponivel: ${[
      axesText(error.axes),
      error.error,
    ].filter(Boolean).map(escapeMarkdownInline).join('; ')}`);
  const unexplainedAudits = Math.max(0, diagnostics.unavailableAudits - diagnostics.errors.length);
  const unexplained = unexplainedAudits > 0
    ? [`- ${plural(unexplainedAudits, 'auditoria indisponivel sem causa estruturada', 'auditorias indisponiveis sem causa estruturada')}`]
    : [];
  const structuralUnavailable = diagnostics.structuralUnavailable > 0
    ? [`- ${plural(diagnostics.structuralUnavailable, 'indisponibilidade estrutural', 'indisponibilidades estruturais')} do gate sem auditorias correspondentes nos groups.`]
    : [];
  return [
    '',
    '## Diagnostico Axe',
    '',
    `- Auditorias: ${auditCounts}`,
    `- Regras: ${plural(diagnostics.uniqueRules, 'regra unica', 'regras unicas')}; ${plural(diagnostics.ruleOccurrences, 'ocorrencia', 'ocorrencias')}; ${plural(diagnostics.affectedNodes, 'no afetado', 'nos afetados')}`,
    `- needsReview: ${escapeMarkdownInline(diagnostics.needsReview)}`,
    `- erros de coleta: ${escapeMarkdownInline(collectionErrors.length)}`,
    ...structuralUnavailable,
    ...structuralCauses,
    ...unexplained,
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
  if (diagnostics.totalAudits === 0 && diagnostics.structuralUnavailable === 0) return '';
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
  const collectionErrors = diagnostics.errors.filter(item => !item.kind);
  const errors = collectionErrors.map(item =>
    `<li>${escapeHtml(axesText(item.axes))}: ${escapeHtml(item.error)}</li>`).join('');
  const structuralCauses = diagnostics.errors.filter(item => item.kind).map(item =>
    `<li><strong>Eixos:</strong> ${escapeHtml(axesText(item.axes))}; <strong>Causa:</strong> ${escapeHtml(item.error)}</li>`).join('');
  const unexplainedAudits = Math.max(0, diagnostics.unavailableAudits - diagnostics.errors.length);
  const unavailableDetails = [
    diagnostics.structuralUnavailable > 0
      ? `<p>${escapeHtml(plural(diagnostics.structuralUnavailable, 'indisponibilidade estrutural', 'indisponibilidades estruturais'))} do gate sem auditorias correspondentes nos groups.</p>`
      : '',
    structuralCauses ? `<ul>${structuralCauses}</ul>` : '',
    unexplainedAudits > 0
      ? `<p>${escapeHtml(plural(unexplainedAudits, 'auditoria indisponivel sem causa estruturada', 'auditorias indisponiveis sem causa estruturada'))}.</p>`
      : '',
  ].filter(Boolean).join('');
  const noConfirmedViolations = diagnostics.unavailableAudits > 0
    || diagnostics.structuralUnavailable > 0
    ? '<p>Nenhuma violacao Axe foi confirmada; ha evidencia indisponivel.</p>'
    : '<p>Sem violacoes Axe.</p>';
  return `<section class="axe"><h2>Diagnostico Axe</h2>
<p>${escapeHtml(plural(diagnostics.totalAudits, 'auditoria', 'auditorias'))}: ${escapeHtml(diagnostics.failedAudits)} falharam, ${escapeHtml(diagnostics.passedAudits)} passaram, ${escapeHtml(diagnostics.unavailableAudits)} indisponiveis. ${escapeHtml(plural(diagnostics.uniqueRules, 'regra unica', 'regras unicas'))}, ${escapeHtml(plural(diagnostics.ruleOccurrences, 'ocorrencia', 'ocorrencias'))}, ${escapeHtml(plural(diagnostics.affectedNodes, 'no afetado', 'nos afetados'))}.</p>
${rules || noConfirmedViolations}
${unavailableDetails ? `<h3>Indisponibilidade estrutural</h3>${unavailableDetails}` : ''}
<h3>needsReview (${escapeHtml(diagnostics.needsReview)})</h3><p>needsReview é inconclusivo e não altera o gate.</p>${reviewState}
<h3>Erros de coleta (${escapeHtml(collectionErrors.length)})</h3>${errors ? `<ul>${errors}</ul>` : '<p>Nenhum erro de coleta.</p>'}
</section>`;
}

function renderAxeGlobalSummary(diagnostics: AxeDiagnostics) {
  if (diagnostics.totalAudits === 0 && diagnostics.structuralUnavailable === 0) return '';
  const dominantRule = [...diagnostics.rules].sort((left, right) => right.affectedNodes - left.affectedNodes)[0];
  const dominantEvidence = dominantRule ? dominantAxeEvidence(dominantRule) : undefined;
  const collectionErrors = diagnostics.errors.filter(item => !item.kind);
  const violationsSummary = dominantRule
    ? `<p>Regra dominante: <strong>${escapeHtml(dominantRule.id)}</strong>${dominantRule.impact ? ` (impacto: ${escapeHtml(dominantRule.impact)})` : ''} · ${escapeHtml(plural(dominantRule.affectedNodes, 'no afetado', 'nos afetados'))}${dominantEvidence?.target ? ` · alvo: ${escapeHtml(dominantEvidence.target)}` : ''}.</p>`
    : diagnostics.unavailableAudits > 0 || diagnostics.structuralUnavailable > 0
      ? '<p>Nenhuma violacao Axe foi confirmada; ha evidencia indisponivel.</p>'
      : '<p>Sem violacoes Axe.</p>';
  const structuralUnavailableParagraph = diagnostics.structuralUnavailable > 0
    ? `<p>${escapeHtml(plural(diagnostics.structuralUnavailable, 'indisponibilidade estrutural', 'indisponibilidades estruturais'))} do gate sem auditorias correspondentes nos groups.</p>`
    : '';
  return `<section class="axe axe-summary"><h2>Diagnostico Axe</h2>
<p>${escapeHtml(plural(diagnostics.totalAudits, 'auditoria', 'auditorias'))}: ${escapeHtml(diagnostics.failedAudits)} falharam, ${escapeHtml(diagnostics.passedAudits)} passaram, ${escapeHtml(diagnostics.unavailableAudits)} indisponiveis. ${escapeHtml(plural(diagnostics.uniqueRules, 'regra unica', 'regras unicas'))}, ${escapeHtml(plural(diagnostics.ruleOccurrences, 'ocorrencia', 'ocorrencias'))}, ${escapeHtml(plural(diagnostics.affectedNodes, 'no afetado', 'nos afetados'))}.</p>
${violationsSummary}
${structuralUnavailableParagraph}
<p>needsReview: ${escapeHtml(diagnostics.needsReview)} · Erros de coleta: ${escapeHtml(collectionErrors.length)}.</p>
<p>Detalhes completos por regra, evidência e artefato estão dentro de cada estado.</p>
</section>`;
}

function renderIssueBadges(state: StateReportGroup) {
  const badges = [
    state.issues.axeFailed > 0 ? plural(state.issues.axeFailed, 'falha de Axe', 'falhas de Axe') : '',
    state.issues.axeUnavailable > 0 ? plural(state.issues.axeUnavailable, 'Axe indisponível', 'Axe indisponíveis') : '',
    state.issues.parityFailed > 0 ? plural(state.issues.parityFailed, 'falha visual', 'falhas visuais') : '',
    state.issues.parityUnavailable > 0 ? plural(state.issues.parityUnavailable, 'evidência visual indisponível', 'evidências visuais indisponíveis') : '',
    state.issues.behaviorFailed > 0 ? plural(state.issues.behaviorFailed, 'falha de comportamento', 'falhas de comportamento') : '',
    state.issues.behaviorUnavailable > 0 ? plural(state.issues.behaviorUnavailable, 'comportamento indisponível', 'comportamentos indisponíveis') : '',
    state.issues.stabilityFailed > 0 ? plural(state.issues.stabilityFailed, 'falha de estabilidade', 'falhas de estabilidade') : '',
    state.issues.stabilityUnavailable > 0 ? plural(state.issues.stabilityUnavailable, 'tentativa indisponível', 'tentativas indisponíveis') : '',
  ].filter(Boolean);
  if (badges.length === 0) return '<span class="chips"><span class="chip ok">Sem pendências.</span></span>';
  return `<span class="chips">${badges.map(text =>
    `<span class="chip ${/indispon/i.test(text) ? 'warn' : 'fail'}">${escapeHtml(text)}</span>`).join('')}</span>`;
}

function renderStateAxe(state: StateReportGroup, frameworks: string[]) {
  const hasObservedAudit = state.groups.some(group => {
    const a11y = isRecord(group.a11y) ? group.a11y : null;
    return a11y && isRecord(a11y.audits) && Object.keys(a11y.audits).length > 0;
  });
  const diagnostics = aggregateAxeDiagnostics(
    state.groups,
    hasObservedAudit ? {expectedFrameworks: frameworks} : {},
  );
  if (diagnostics.totalAudits === 0 && diagnostics.structuralUnavailable === 0) {
    return '<details class="state-section axe-evidence"><summary><span class="slabel">Axe do estado</span></summary><div class="body"><p class="muted">Sem evidência aplicável.</p></div></details>';
  }
  const dominantRule = [...diagnostics.rules].sort((left, right) => right.affectedNodes - left.affectedNodes)[0];
  const dominantEvidence = dominantRule ? dominantAxeEvidence(dominantRule) : undefined;
  const summaryLine = dominantRule
    ? `Regra dominante: <span class="dom-rule">${escapeHtml(dominantRule.id)}</span>${dominantRule.impact ? ` · impacto ${escapeHtml(dominantRule.impact)}` : ''} · ${escapeHtml(plural(dominantRule.affectedNodes, 'no afetado', 'nos afetados'))}${dominantEvidence?.target ? ` · alvo: ${escapeHtml(dominantEvidence.target)}` : ''}.`
    : 'Nenhuma regra dominante confirmada.';
  const tag = diagnostics.failedAudits > 0
    ? `<span class="tag fail">${escapeHtml(plural(diagnostics.failedAudits, 'falha', 'falhas'))}</span>`
    : diagnostics.unavailableAudits > 0 || diagnostics.structuralUnavailable > 0
      ? '<span class="tag warn">indisponível</span>'
      : '';
  return `<details class="state-section axe-evidence">
<summary><span class="slabel">Diagnostico Axe do estado</span>${tag}</summary>
<div class="body">
<p>${escapeHtml(plural(diagnostics.totalAudits, 'auditoria', 'auditorias'))}: ${escapeHtml(diagnostics.failedAudits)} falharam, ${escapeHtml(diagnostics.passedAudits)} passaram, ${escapeHtml(diagnostics.unavailableAudits)} indisponiveis.</p>
<p>${summaryLine}</p>
<details class="axe-evidence-detail"><summary>Detalhes completos por regra e artefato</summary>${renderAxeHtml(diagnostics)}</details>
</div></details>`;
}

function renderStateVisual(state: StateReportGroup, browsers: string[]) {
  if (state.groups.length === 0) {
    return '<details class="state-section visual-evidence"><summary><span class="slabel">Evidencia visual</span></summary><div class="body"><p class="muted">Sem evidência aplicável.</p></div></details>';
  }
  const orderedBrowsers = [
    ...browsers.filter(browser => state.axes.browsers.includes(browser)),
    ...state.axes.browsers.filter(browser => !browsers.includes(browser)),
  ];
  const browserSections = orderedBrowsers.map(browser => {
    const rows = state.groups.filter(group => group.browser === browser).map(group => {
      const frameworkCells = FRAMEWORKS.map(framework => {
        const source = safeRelativeHref(group[framework]);
        return source
          ? `<td><img src="${escapeHtml(source)}" alt="${escapeHtml(framework)}" /></td>`
          : '<td>indisponível</td>';
      }).join('');
      return `<tr><td>${escapeHtml(group.label)}</td>${frameworkCells}</tr>`;
    }).join('');
    return `<details class="browser-evidence" data-browser="${escapeHtml(browser)}"><summary>${escapeHtml(titleCase(String(browser)))}</summary><div class="table-scroll"><table><thead><tr><th>Cena</th><th>WC</th><th>React</th><th>Angular</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
  }).join('');
  return `<details class="state-section visual-evidence"><summary><span class="slabel">Evidencia visual</span><span class="tag">${escapeHtml(plural(orderedBrowsers.length, 'browser', 'browsers'))}</span></summary><div class="body">${browserSections}</div></details>`;
}

function routeSeverity(route: Record<string, unknown>) {
  const frameworksValue = isRecord(route.frameworks) ? route.frameworks : {};
  const failed = route.parity === 'failed'
    || Object.values(frameworksValue).some((value: any) => value?.conformance === 'failed');
  if (failed) return 2;
  const unavailable = ['not-comparable', 'not-run'].includes(route.parity as string)
    || Object.values(frameworksValue).some((value: any) => value?.execution === 'error' || !value?.conformance);
  return unavailable ? 1 : 0;
}

function renderStateBehavior(state: StateReportGroup) {
  const entries = state.behavior.flatMap(result =>
    (Array.isArray(result.routes) ? result.routes : []).map((route: Record<string, unknown>) => ({result, route})));
  if (entries.length === 0) {
    return '<details class="state-section behavior-evidence"><summary><span class="slabel">Comportamento</span></summary><div class="body"><p class="muted">Sem evidência aplicável.</p></div></details>';
  }
  const ordered = entries
    .map((entry, index) => ({...entry, index}))
    .sort((left, right) => routeSeverity(right.route) - routeSeverity(left.route) || left.index - right.index);
  const rows = ordered.map(({result, route}) => {
    const conformance = FRAMEWORKS.map(framework => {
      const value = isRecord(route.frameworks) ? (route.frameworks as Record<string, any>)[framework] : undefined;
      return `<td>${escapeHtml(value?.conformance || 'indisponível')}</td>`;
    }).join('');
    return `<tr><td>${escapeHtml(result.logicalTestId)}</td><td>${escapeHtml(result.stability)}</td><td>${escapeHtml(route.routeId)}</td><td>${escapeHtml(route.parity)}</td>${conformance}</tr>`;
  }).join('');
  const failing = state.issues.behaviorFailed + state.issues.behaviorUnavailable;
  const open = failing > 0 ? ' open' : '';
  const tag = failing > 0
    ? `<span class="tag fail">${escapeHtml(plural(failing, 'falha', 'falhas'))}</span>`
    : '<span class="tag">estável</span>';
  return `<details class="state-section behavior-evidence"${open}><summary><span class="slabel">Comportamento</span>${tag}</summary><div class="body"><div class="table-scroll"><table><thead><tr><th>Teste</th><th>Estabilidade</th><th>Roteiro</th><th>Paridade</th><th>WC</th><th>React</th><th>Angular</th></tr></thead><tbody>${rows}</tbody></table></div></div></details>`;
}

function renderStateAttempts(state: StateReportGroup) {
  const entries = state.attempts.flatMap(logical =>
    (Array.isArray(logical.attempts) ? logical.attempts : []).map((attempt: Record<string, unknown>) => ({logical, attempt})));
  if (entries.length === 0) {
    return '<details class="state-section attempt-evidence"><summary><span class="slabel">Tentativas e diagnosticos</span></summary><div class="body"><p class="muted">Sem evidência aplicável.</p></div></details>';
  }
  const flaky = state.issues.stabilityFailed + state.issues.stabilityUnavailable;
  const tag = flaky > 0
    ? `<span class="tag fail">${escapeHtml(plural(flaky, 'falha', 'falhas'))}</span>`
    : `<span class="tag">${escapeHtml(plural(entries.length, 'tentativa', 'tentativas'))}</span>`;
  const rows = entries.map(({logical, attempt}) => {
    const candidateResultHref = safeRelativeHref(attempt.resultPath);
    const expectedHref = expectedResultHref(logical.logicalTestId, attempt.attempt);
    const resultHref = candidateResultHref === expectedHref ? candidateResultHref : null;
    const attachments = (Array.isArray(attempt.attachments) ? attempt.attachments : []).map((item: unknown) => {
      const href = scopedAttachmentHref(resultHref, item);
      return href ? `<a href="${escapeHtml(href)}">${escapeHtml(String(item).split('/').at(-1))}</a>` : '';
    }).filter(Boolean).join(' ') || '—';
    const resultLink = resultHref
      ? `<a href="${escapeHtml(resultHref)}">result.json</a>`
      : 'indisponível';
    return `<tr><td>${escapeHtml(logical.logicalTestId)}</td><td>${escapeHtml(logical.stability)}</td><td>${escapeHtml(attempt.attempt)}</td><td>${escapeHtml(attempt.status)}</td><td>${resultLink}</td><td>${attachments}</td></tr>`;
  }).join('');
  return `<details class="state-section attempt-evidence"><summary><span class="slabel">Tentativas e diagnosticos</span>${tag}</summary><div class="body"><div class="table-scroll"><table><thead><tr><th>Teste</th><th>Estabilidade</th><th>Tentativa</th><th>Status</th><th>Resultado</th><th>Attachments</th></tr></thead><tbody>${rows}</tbody></table></div></div></details>`;
}

function renderStateGroup(state: StateReportGroup, manifest: ManifestV2) {
  const open = state.open ? ' open' : '';
  return `<section class="state-shell">
<details class="state-group ${escapeHtml(state.status)}" data-state="${escapeHtml(state.id)}" data-status="${escapeHtml(state.status)}"${open}>
<summary><span class="dot"></span><span class="state-id"><span class="name">${escapeHtml(state.name)}</span><span class="meta">${escapeHtml(plural(state.groups.length, 'combinação', 'combinações'))}</span></span>${renderIssueBadges(state)}<span class="caret">▸</span></summary>
<div class="state-body">
${renderStateAxe(state, manifest.axes.frameworks || FRAMEWORKS)}
${renderStateVisual(state, manifest.axes.browsers)}
${renderStateBehavior(state)}
${renderStateAttempts(state)}
</div></details></section>`;
}

function axeDiagnosticsFor(manifest: ManifestV2) {
  const groups = manifest.groups || [];
  const hasObservedAudit = groups.some(group => {
    const a11y = isRecord(group.a11y) ? group.a11y : null;
    return a11y && isRecord(a11y.audits) && Object.keys(a11y.audits).length > 0;
  });
  const diagnostics = aggregateAxeDiagnostics(
    groups,
    hasObservedAudit && Array.isArray(manifest.axes.frameworks)
      ? {expectedFrameworks: manifest.axes.frameworks}
      : {},
  );
  const gateUnavailableCandidate = manifest.gate.dimensions.axe?.unavailable;
  const gateUnavailable = typeof gateUnavailableCandidate === 'number'
    && Number.isFinite(gateUnavailableCandidate)
    && gateUnavailableCandidate > 0
    ? gateUnavailableCandidate
    : 0;
  diagnostics.structuralUnavailable = Math.max(
    0,
    gateUnavailable - diagnostics.unavailableAudits,
  );
  return diagnostics;
}

export function renderSummaryV2(manifest: ManifestV2) {
  const dimensions = Object.entries(manifest.gate.dimensions).map(([name, value]) =>
    `- ${escapeMarkdownInline(name)}: ${escapeMarkdownInline(value.status)} (falhas: ${escapeMarkdownInline(value.failed)}, indisponíveis: ${escapeMarkdownInline(value.unavailable)})`);
  const flaky = (manifest.attempts || []).filter(item => item.stability === 'flaky').length;
  const axeDiagnostics = axeDiagnosticsFor(manifest);
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

const DIMENSION_LABELS: Record<string, string> = {
  axe: 'Axe',
  behavioralConformance: 'Comportamento',
  behavioralParity: 'Paridade comp.',
  visualParity: 'Visual',
  ariaParity: 'ARIA',
  stability: 'Estabilidade',
  browserCoverage: 'Browsers',
  contractCoverage: 'Contrato',
  dimensions: 'Dimensões',
};

function renderReportHead(manifest: ManifestV2, stateCount: number) {
  const failing = Object.entries(manifest.gate.dimensions)
    .filter(([, value]) => value.status === 'failed');
  const metrics = [
    ...failing.map(([name, value]) =>
      `<div class="metric fail"><div class="n">${escapeHtml(value.failed)}</div><div class="l">${escapeHtml(DIMENSION_LABELS[name] || name)}</div></div>`),
    `<div class="metric pass"><div class="n">${escapeHtml(manifest.cellCount)}</div><div class="l">Células</div></div>`,
    `<div class="metric"><div class="n">${escapeHtml(stateCount)}</div><div class="l">Estados</div></div>`,
  ].join('');
  const passed = manifest.gate.status === 'passed';
  return `<header class="report-head">
<p class="eyebrow">${escapeHtml(manifest.tool)} · confiança</p>
<h1>${escapeHtml(manifest.component)} <span class="verdict ${passed ? 'pass' : 'fail'}">Gate ${passed ? 'aprovado' : 'reprovado'}</span></h1>
<p class="head-note">Gate confiável: ${manifest.gate.trusted ? 'sim' : 'não'}</p>
<div class="summary-strip">${metrics}</div>
</header>`;
}

const REPORT_STYLES = `
:root{--bg:#f5f6f8;--surface:#fff;--ink:#1b2432;--muted:#69727f;--hair:#e6e9ee;--fail:#c23b30;--fail-bg:#fbecea;--warn:#a2620a;--warn-bg:#faf1e1;--pass:#137a52;--pass-bg:#e7f4ee;--action:#3a5ad9;--action-bg:#eef1fd;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;margin:0;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:32px 20px 72px}
a{color:var(--action);text-decoration:none}a:hover{text-decoration:underline}
.report-head{margin-bottom:24px}
.report-head .eyebrow{font:600 12px/1 system-ui;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
.report-head h1{font:700 30px/1.1 system-ui;letter-spacing:-.02em;margin:0;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.report-head .head-note{margin:8px 0 0;font-size:13px;color:var(--muted)}
.verdict{font:700 12px/1 system-ui;letter-spacing:.06em;text-transform:uppercase;padding:7px 12px;border-radius:999px}
.verdict.fail{background:var(--fail-bg);color:var(--fail)}
.verdict.pass{background:var(--pass-bg);color:var(--pass)}
.summary-strip{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
.metric{background:var(--surface);border:1px solid var(--hair);border-radius:10px;padding:12px 16px;min-width:118px}
.metric .n{font:700 22px/1 system-ui;letter-spacing:-.02em}
.metric .l{font:500 12px/1 system-ui;color:var(--muted);margin-top:7px;text-transform:uppercase;letter-spacing:.05em}
.metric.fail .n{color:var(--fail)}.metric.pass .n{color:var(--pass)}
details.gate-detail{border:1px solid var(--hair);border-radius:10px;background:var(--surface);margin-bottom:24px}
details.gate-detail>summary{font:600 13px/1 system-ui;padding:13px 16px;cursor:pointer;color:var(--muted);list-style:none}
details.gate-detail>summary::-webkit-details-marker{display:none}
details.gate-detail>summary::before{content:"▸  ";color:var(--muted)}
details.gate-detail[open]>summary::before{content:"▾  "}
.gate-detail .inner{padding:2px 16px 16px}
.gate-detail .axe{border:0;padding:0;margin:8px 0 0}
.gate-detail .axe h2{font:600 14px/1 system-ui;margin:14px 0 6px}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--hair);vertical-align:top}
th{font:600 12px/1 system-ui;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.pill{display:inline-block;font:600 11.5px/1 system-ui;padding:4px 9px;border-radius:999px}
.pill.failed{background:var(--fail-bg);color:var(--fail)}
.pill.passed{background:var(--pass-bg);color:var(--pass)}
.pill.unavailable{background:var(--warn-bg);color:var(--warn)}
.section-label{font:600 12px/1 system-ui;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 14px}
.report-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 18px}
.report-controls button{font:600 13px/1 system-ui;padding:9px 13px;border-radius:8px;border:1px solid var(--hair);background:var(--surface);color:var(--ink);cursor:pointer}
.report-controls button[data-action]{border-color:transparent;background:var(--action-bg);color:var(--action)}
.report-controls button:hover{border-color:var(--action)}
.report-controls .browser-filters{display:inline-flex;margin-left:auto;border:1px solid var(--hair);border-radius:8px;overflow:hidden;background:var(--surface)}
.report-controls .browser-filters button{border:0;border-left:1px solid var(--hair);border-radius:0}
.report-controls .browser-filters button:first-child{border-left:0}
.report-controls .browser-filters button.on{background:var(--action);color:#fff}
.state-shell{margin:0 0 12px}
.state-group{background:var(--surface);border:1px solid var(--hair);border-radius:12px;overflow:hidden}
.state-group.failed{border-left:3px solid var(--fail)}
.state-group.unavailable{border-left:3px solid var(--warn)}
.state-group.passed{border-left:3px solid transparent}
.state-group>summary{list-style:none;cursor:pointer;padding:16px 18px;display:flex;align-items:center;gap:13px}
.state-group>summary::-webkit-details-marker{display:none}
.dot{width:9px;height:9px;border-radius:50%;flex:none}
.state-group.failed .dot{background:var(--fail)}.state-group.unavailable .dot{background:var(--warn)}.state-group.passed .dot{background:var(--pass)}
.state-id{display:flex;flex-direction:column;gap:3px;margin-right:auto;min-width:0}
.state-id .name{font:650 17px/1.2 system-ui;letter-spacing:-.01em}
.state-id .meta{font:500 12.5px/1 system-ui;color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
.chip{font:600 12px/1 system-ui;padding:5px 9px;border-radius:7px;white-space:nowrap}
.chip.fail{background:var(--fail-bg);color:var(--fail)}
.chip.warn{background:var(--warn-bg);color:var(--warn)}
.chip.ok{background:var(--pass-bg);color:var(--pass)}
.caret{color:var(--muted);font-size:12px;flex:none;transition:transform .15s}
.state-group[open]>summary .caret{transform:rotate(90deg)}
.state-body{padding:2px 18px 16px;border-top:1px solid var(--hair)}
.state-section{border:1px solid var(--hair);border-radius:9px;margin-top:12px;background:#fcfcfd}
.state-section>summary{list-style:none;cursor:pointer;padding:12px 14px;display:flex;align-items:center;gap:10px;font:600 14px/1 system-ui}
.state-section>summary::-webkit-details-marker{display:none}
.state-section>summary::before{content:"▸";color:var(--muted);font-size:12px}
.state-section[open]>summary::before{content:"▾"}
.state-section>summary .slabel{margin-right:auto}
.tag{font:600 11px/1 system-ui;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);border:1px solid var(--hair);padding:4px 8px;border-radius:6px}
.tag.fail{color:var(--fail);border-color:var(--fail-bg);background:var(--fail-bg)}
.tag.warn{color:var(--warn);border-color:var(--warn-bg);background:var(--warn-bg)}
.state-section .body{padding:2px 14px 14px}
.state-section .body>p{margin:8px 0;font-size:13.5px}
.muted{color:var(--muted)}
.dom-rule{font-family:var(--mono);font-size:12.5px;background:#f2f4f7;padding:2px 6px;border-radius:5px}
.table-scroll{overflow-x:auto;max-width:100%;margin:6px 0}
.table-scroll table{min-width:640px}
.state-section .body td,.state-section .body th{font-size:13px}
.browser-evidence{border:1px solid var(--hair);border-radius:8px;margin:8px 0;background:#fff}
.browser-evidence>summary{list-style:none;cursor:pointer;padding:10px 12px;font:600 13px/1 system-ui}
.browser-evidence>summary::before{content:"▸  ";color:var(--muted)}
.browser-evidence[open]>summary::before{content:"▾  "}
.browser-evidence img{max-width:210px;border:1px solid var(--hair);border-radius:6px}
.browser-evidence[hidden]{display:none}
.axe-rule,.axe-evidence,.axe-artifacts,.axe-evidence-detail{border:1px solid var(--hair);border-radius:8px;margin:8px 0;background:#fff;padding:0}
.axe-rule>summary,.axe-evidence>summary,.axe-artifacts>summary,.axe-evidence-detail>summary{cursor:pointer;padding:10px 12px;font-size:13px}
.axe-rule>*:not(summary),.axe-evidence>*:not(summary),.axe-artifacts>*:not(summary),.axe-evidence-detail>*:not(summary){padding-left:12px;padding-right:12px}
.axe-axis-distribution{display:flex;flex-wrap:wrap;gap:6px 18px;margin:6px 0}
.axe-axis-distribution dt{font-weight:600;color:var(--muted);font-size:12px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f4f7;padding:10px;border-radius:6px;font-size:12px}
@media (max-width:640px){.chips{justify-content:flex-start}.state-group>summary{flex-wrap:wrap}.report-controls .browser-filters{margin-left:0}}
`;

export function renderHtmlV2(manifest: ManifestV2) {
  const axeDiagnostics = axeDiagnosticsFor(manifest);
  const dimensionRows = Object.entries(manifest.gate.dimensions).map(([name, value]) =>
    `<tr><td>${escapeHtml(name)}</td><td><span class="pill ${escapeHtml(value.status)}">${escapeHtml(value.status)}</span></td><td>${escapeHtml(value.failed)}</td><td>${escapeHtml(value.unavailable)}</td></tr>`).join('');
  const states = projectStateReport(manifest);
  const stateGroups = states.map(state => renderStateGroup(state, manifest)).join('');
  const browserButtons = manifest.axes.browsers.map(browser =>
    `<button type="button" data-browser-filter="${escapeHtml(browser)}">${escapeHtml(titleCase(browser))}</button>`).join('');
  const reportControls = `<div class="report-controls">
<button type="button" data-action="open-failed">Abrir estados com falha</button>
<button type="button" data-action="close-all">Fechar todos</button>
<span class="browser-filters">${browserButtons}<button type="button" data-browser-filter="all" class="on">Todos</button></span>
</div>`;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(manifest.component)} — confiança</title>
<style>${REPORT_STYLES}</style></head><body>
<div class="wrap">
${renderReportHead(manifest, states.length)}
<details class="gate-detail"><summary>Dimensões do gate e resumo Axe global</summary><div class="inner"><div class="table-scroll"><table><thead><tr><th>Dimensão</th><th>Status</th><th>Falhas</th><th>Indisponíveis</th></tr></thead><tbody>${dimensionRows}</tbody></table></div>${renderAxeGlobalSummary(axeDiagnostics)}</div></details>
<p class="section-label">Estados do componente · falhas primeiro</p>
${reportControls}
<div id="state-report">${stateGroups}</div>
</div>
<script>
document.querySelector('.report-controls').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.action === 'open-failed') {
    document.querySelectorAll('.state-group').forEach(state => {
      state.open = state.dataset.status !== 'passed';
    });
  }
  if (button.dataset.action === 'close-all') {
    document.querySelectorAll('.state-group').forEach(state => { state.open = false; });
  }
  if (button.dataset.browserFilter) {
    button.parentElement.querySelectorAll('button').forEach(other => other.classList.remove('on'));
    button.classList.add('on');
    document.querySelectorAll('.browser-evidence').forEach(group => {
      group.hidden = button.dataset.browserFilter !== 'all'
        && group.dataset.browser !== button.dataset.browserFilter;
    });
  }
});
</script>
</body></html>`;
}
