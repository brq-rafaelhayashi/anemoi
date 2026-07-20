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
  if (badges.length === 0) return '<span class="state-badges ok">Sem pendências.</span>';
  return `<span class="state-badges">${badges.map(text => `<span class="state-badge">${escapeHtml(text)}</span>`).join('')}</span>`;
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
    return '<section class="state-section axe-evidence"><h3>Axe do estado</h3><p>Sem evidência aplicável.</p></section>';
  }
  const dominantRule = [...diagnostics.rules].sort((left, right) => right.affectedNodes - left.affectedNodes)[0];
  const dominantEvidence = dominantRule ? dominantAxeEvidence(dominantRule) : undefined;
  const summaryLine = dominantRule
    ? `Regra dominante: <strong>${escapeHtml(dominantRule.id)}</strong>${dominantRule.impact ? ` (impacto: ${escapeHtml(dominantRule.impact)})` : ''} · ${escapeHtml(plural(dominantRule.affectedNodes, 'no afetado', 'nos afetados'))}${dominantEvidence?.target ? ` · alvo: ${escapeHtml(dominantEvidence.target)}` : ''}.`
    : 'Nenhuma regra dominante confirmada.';
  return `<section class="state-section axe-evidence">
<h3>Diagnostico Axe do estado</h3>
<p>${escapeHtml(plural(diagnostics.totalAudits, 'auditoria', 'auditorias'))}: ${escapeHtml(diagnostics.failedAudits)} falharam, ${escapeHtml(diagnostics.passedAudits)} passaram, ${escapeHtml(diagnostics.unavailableAudits)} indisponiveis.</p>
<p>${summaryLine}</p>
<details class="axe-evidence-detail"><summary>Detalhes completos por regra e artefato</summary>${renderAxeHtml(diagnostics)}</details>
</section>`;
}

function renderStateVisual(state: StateReportGroup, browsers: string[]) {
  if (state.groups.length === 0) {
    return '<details class="state-section visual-evidence"><summary>Evidencia visual</summary><p>Sem evidência aplicável.</p></details>';
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
  return `<details class="state-section visual-evidence"><summary>Evidencia visual</summary>${browserSections}</details>`;
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
    return '<details class="state-section behavior-evidence"><summary>Comportamento</summary><p>Sem evidência aplicável.</p></details>';
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
  const open = (state.issues.behaviorFailed > 0 || state.issues.behaviorUnavailable > 0) ? ' open' : '';
  return `<details class="state-section behavior-evidence"${open}><summary>Comportamento</summary><div class="table-scroll"><table><thead><tr><th>Teste</th><th>Estabilidade</th><th>Roteiro</th><th>Paridade</th><th>WC</th><th>React</th><th>Angular</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

function renderStateAttempts(state: StateReportGroup) {
  const entries = state.attempts.flatMap(logical =>
    (Array.isArray(logical.attempts) ? logical.attempts : []).map((attempt: Record<string, unknown>) => ({logical, attempt})));
  if (entries.length === 0) {
    return '<details class="state-section attempt-evidence"><summary>Tentativas e diagnosticos</summary><p>Sem evidência aplicável.</p></details>';
  }
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
  return `<details class="state-section attempt-evidence"><summary>Tentativas e diagnosticos</summary><div class="table-scroll"><table><thead><tr><th>Teste</th><th>Estabilidade</th><th>Tentativa</th><th>Status</th><th>Resultado</th><th>Attachments</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

function renderStateGroup(state: StateReportGroup, manifest: ManifestV2) {
  const open = state.open ? ' open' : '';
  return `<section class="state-shell">
<details class="state-group ${escapeHtml(state.status)}" data-state="${escapeHtml(state.id)}" data-status="${escapeHtml(state.status)}"${open}>
<summary><span class="state-title">${escapeHtml(state.name)}</span><span>${escapeHtml(plural(state.groups.length, 'combinação', 'combinações'))}</span>${renderIssueBadges(state)}</summary>
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

export function renderHtmlV2(manifest: ManifestV2) {
  const axeDiagnostics = axeDiagnosticsFor(manifest);
  const dimensionRows = Object.entries(manifest.gate.dimensions).map(([name, value]) =>
    `<tr><td>${escapeHtml(name)}</td><td class="${escapeHtml(value.status)}">${escapeHtml(value.status)}</td><td>${escapeHtml(value.failed)}</td><td>${escapeHtml(value.unavailable)}</td></tr>`).join('');
  const states = projectStateReport(manifest);
  const stateGroups = states.map(state => renderStateGroup(state, manifest)).join('');
  const browserButtons = manifest.axes.browsers.map(browser =>
    `<button type="button" data-browser-filter="${escapeHtml(browser)}">${escapeHtml(titleCase(browser))}</button>`).join('');
  const reportControls = `<div class="report-controls">
<button type="button" data-action="open-failed">Abrir estados com falha</button>
<button type="button" data-action="close-all">Fechar todos</button>
<span class="browser-filters">${browserButtons}<button type="button" data-browser-filter="all">Todos os browsers</button></span>
</div>`;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(manifest.component)} — confiança</title>
<style>body{font:14px system-ui;margin:24px;background:#f6f7f9;color:#1d2433}table{border-collapse:collapse;width:100%;background:white;margin:16px 0}th,td{border:1px solid #d8dce3;padding:8px;text-align:left;vertical-align:top}img{max-width:240px}.passed{color:#167044}.failed,.unavailable{color:#b42318}details{background:white;border:1px solid #d8dce3;margin:8px 0;padding:8px}details details{background:#f6f7f9}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}.state-badges .state-badge{margin-right:6px;padding:2px 6px;border-radius:10px;background:#fee4e2;color:#b42318;font-size:12px}.state-badges.ok .state-badge,.state-badges.ok{color:#167044}.report-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:16px 0}.state-shell{margin:10px 0}.state-group{background:#fff;border:1px solid #d8dce3;border-left:4px solid #167044;border-radius:8px;padding:0}.state-group.failed{border-left-color:#b42318}.state-group.unavailable{border-left-color:#b54708}.state-group>summary{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px;cursor:pointer}.state-title{font-size:16px;font-weight:700;margin-right:auto}.state-body{padding:0 12px 12px}.table-scroll{overflow-x:auto;max-width:100%}.table-scroll table{min-width:720px}.browser-evidence[hidden]{display:none}</style></head><body>
<h1>${escapeHtml(manifest.component)}</h1><p>Gate: <strong>${escapeHtml(manifest.gate.status)}</strong> · confiável: ${manifest.gate.trusted ? 'sim' : 'não'}</p>
<h2>Dimensões do gate</h2><table><thead><tr><th>Dimensão</th><th>Status</th><th>Falhas</th><th>Indisponíveis</th></tr></thead><tbody>${dimensionRows}</tbody></table>
${renderAxeGlobalSummary(axeDiagnostics)}
<h2>Estados do componente</h2>
${reportControls}
<div id="state-report">${stateGroups}</div>
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
    document.querySelectorAll('.browser-evidence').forEach(group => {
      group.hidden = button.dataset.browserFilter !== 'all'
        && group.dataset.browser !== button.dataset.browserFilter;
    });
  }
});
</script>
</body></html>`;
}
