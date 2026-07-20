type UnknownRecord = Record<string, unknown>;
type ValidRuleResult = UnknownRecord & {nodes: UnknownRecord[]};

export interface AxeAxes {
  browser: string;
  framework: string;
  brand: string;
  story: string;
  viewport: string;
  theme: string;
}

export interface AxeEvidence {
  target: string;
  html: string;
  failureSummary: string;
  affectedNodes: number;
  axes: AxeAxes[];
  artifacts: string[];
}

export interface AxeRuleDiagnostic {
  id: string;
  impact: string | null;
  description: string;
  wcag: string[];
  affectedAudits: number;
  occurrences: number;
  affectedNodes: number;
  axes: AxeAxes[];
  artifacts: string[];
  evidence: AxeEvidence[];
}

export interface AxeCollectionError {
  error: string;
  axes: AxeAxes;
}

export interface AxeDiagnostics {
  totalAudits: number;
  failedAudits: number;
  passedAudits: number;
  unavailableAudits: number;
  uniqueRules: number;
  ruleOccurrences: number;
  affectedNodes: number;
  needsReview: number;
  rules: AxeRuleDiagnostic[];
  reviewRules: AxeRuleDiagnostic[];
  errors: AxeCollectionError[];
}

interface MutableEvidence {
  target: string;
  failureSummary: string;
  html: Set<string>;
  affectedNodes: number;
  axes: Map<string, AxeAxes>;
  artifacts: Set<string>;
}

interface MutableRule {
  id: string;
  impacts: Set<string>;
  descriptions: Set<string>;
  wcag: Set<string>;
  auditIds: Set<number>;
  occurrences: number;
  affectedNodes: number;
  axes: Map<string, AxeAxes>;
  artifacts: Set<string>;
  evidence: Map<string, MutableEvidence>;
}

const IMPACT_ORDER = new Map([
  ['minor', 0],
  ['moderate', 1],
  ['serious', 2],
  ['critical', 3],
]);

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizedText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(normalizedText).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return '';
  }
  return String(value).replace(/\s+/g, ' ').trim();
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function axesFrom(group: UnknownRecord, framework: string): AxeAxes {
  return {
    browser: normalizedText(group.browser),
    framework: normalizedText(framework),
    brand: normalizedText(group.brand),
    story: normalizedText(group.story || group.storyName || group.storyId || group.sceneId),
    viewport: normalizedText(group.viewport),
    theme: normalizedText(group.theme),
  };
}

function axesKey(axes: AxeAxes) {
  return [
    axes.browser,
    axes.framework,
    axes.brand,
    axes.story,
    axes.viewport,
    axes.theme,
  ].join('\u0000');
}

function compareAxes(left: AxeAxes, right: AxeAxes) {
  return compareText(axesKey(left), axesKey(right));
}

function addAxes(target: Map<string, AxeAxes>, axes: AxeAxes) {
  target.set(axesKey(axes), axes);
}

function addArtifact(target: Set<string>, value: unknown) {
  const artifact = normalizedText(value);
  if (artifact) target.add(artifact);
}

function impactOf(impacts: Set<string>): string | null {
  return [...impacts].sort((left, right) => {
    const bySeverity = (IMPACT_ORDER.get(right) ?? -1) - (IMPACT_ORDER.get(left) ?? -1);
    return bySeverity || compareText(left, right);
  })[0] || null;
}

function mutableRule(rules: Map<string, MutableRule>, id: string) {
  let rule = rules.get(id);
  if (!rule) {
    rule = {
      id,
      impacts: new Set(),
      descriptions: new Set(),
      wcag: new Set(),
      auditIds: new Set(),
      occurrences: 0,
      affectedNodes: 0,
      axes: new Map(),
      artifacts: new Set(),
      evidence: new Map(),
    };
    rules.set(id, rule);
  }
  return rule;
}

function isValidViolation(value: unknown): value is ValidRuleResult {
  return isRecord(value)
    && Boolean(normalizedText(value.id))
    && Array.isArray(value.nodes)
    && value.nodes.every(isRecord);
}

function mutableEvidence(rule: MutableRule, target: string, failureSummary: string) {
  const key = `${target}\u0000${failureSummary}`;
  let evidence = rule.evidence.get(key);
  if (!evidence) {
    evidence = {
      target,
      failureSummary,
      html: new Set(),
      affectedNodes: 0,
      axes: new Map(),
      artifacts: new Set(),
    };
    rule.evidence.set(key, evidence);
  }
  return evidence;
}

function addRuleResult(
  rules: Map<string, MutableRule>,
  candidate: UnknownRecord,
  auditId: number,
  axes: AxeAxes,
  artifactPath: unknown,
) {
  const id = normalizedText(candidate.id);
  const rule = mutableRule(rules, id);
  rule.auditIds.add(auditId);
  rule.occurrences += 1;
  const impact = normalizedText(candidate.impact);
  if (impact) rule.impacts.add(impact);
  const description = normalizedText(candidate.description);
  if (description) rule.descriptions.add(description);
  for (const tag of Array.isArray(candidate.wcag) ? candidate.wcag : []) {
    const normalized = normalizedText(tag);
    if (normalized) rule.wcag.add(normalized);
  }
  addAxes(rule.axes, axes);
  addArtifact(rule.artifacts, artifactPath);

  for (const nodeCandidate of Array.isArray(candidate.nodes) ? candidate.nodes : []) {
    if (!isRecord(nodeCandidate)) continue;
    const target = normalizedText(nodeCandidate.target);
    const failureSummary = normalizedText(nodeCandidate.failureSummary);
    const evidence = mutableEvidence(rule, target, failureSummary);
    const html = normalizedText(nodeCandidate.html);
    if (html) evidence.html.add(html);
    evidence.affectedNodes += 1;
    rule.affectedNodes += 1;
    addAxes(evidence.axes, axes);
    addArtifact(evidence.artifacts, artifactPath);
  }
}

function finalizedRules(rules: Map<string, MutableRule>): AxeRuleDiagnostic[] {
  return [...rules.values()]
    .sort((left, right) => compareText(left.id, right.id))
    .map(rule => ({
      id: rule.id,
      impact: impactOf(rule.impacts),
      description: [...rule.descriptions].sort(compareText)[0] || '',
      wcag: [...rule.wcag].sort(compareText),
      affectedAudits: rule.auditIds.size,
      occurrences: rule.occurrences,
      affectedNodes: rule.affectedNodes,
      axes: [...rule.axes.values()].sort(compareAxes),
      artifacts: [...rule.artifacts].sort(compareText),
      evidence: [...rule.evidence.values()]
        .sort((left, right) => compareText(left.target, right.target)
          || compareText(left.failureSummary, right.failureSummary))
        .map(evidence => ({
          target: evidence.target,
          html: [...evidence.html].sort(compareText)[0] || '',
          failureSummary: evidence.failureSummary,
          affectedNodes: evidence.affectedNodes,
          axes: [...evidence.axes.values()].sort(compareAxes),
          artifacts: [...evidence.artifacts].sort(compareText),
        })),
    }));
}

export function aggregateAxeDiagnostics(groups: unknown): AxeDiagnostics {
  const result: AxeDiagnostics = {
    totalAudits: 0,
    failedAudits: 0,
    passedAudits: 0,
    unavailableAudits: 0,
    uniqueRules: 0,
    ruleOccurrences: 0,
    affectedNodes: 0,
    needsReview: 0,
    rules: [],
    reviewRules: [],
    errors: [],
  };
  const rules = new Map<string, MutableRule>();
  const reviewRules = new Map<string, MutableRule>();

  for (const candidate of Array.isArray(groups) ? groups : []) {
    if (!isRecord(candidate) || !isRecord(candidate.a11y) || !isRecord(candidate.a11y.audits)) {
      continue;
    }
    for (const [framework, auditCandidate] of Object.entries(candidate.a11y.audits)) {
      result.totalAudits += 1;
      const auditId = result.totalAudits;
      const axes = axesFrom(candidate, framework);
      const error = isRecord(auditCandidate) ? normalizedText(auditCandidate.error) : '';
      if (!isRecord(auditCandidate)
        || error
        || !Array.isArray(auditCandidate.violations)
        || !auditCandidate.violations.every(isValidViolation)) {
        result.unavailableAudits += 1;
        if (error) result.errors.push({error, axes});
        continue;
      }

      const violations = auditCandidate.violations;
      if (violations.length === 0) result.passedAudits += 1;
      else result.failedAudits += 1;
      if (Array.isArray(auditCandidate.needsReview)) {
        result.needsReview += auditCandidate.needsReview.filter(isRecord).length;
        for (const reviewCandidate of auditCandidate.needsReview.filter(isValidViolation)) {
          addRuleResult(reviewRules, reviewCandidate, auditId, axes, auditCandidate.artifactPath);
        }
      }

      for (const violationCandidate of violations) {
        addRuleResult(rules, violationCandidate, auditId, axes, auditCandidate.artifactPath);
        result.ruleOccurrences += 1;
        result.affectedNodes += violationCandidate.nodes.length;
      }
    }
  }

  result.rules = finalizedRules(rules);
  result.reviewRules = finalizedRules(reviewRules);
  result.errors.sort((left, right) => compareAxes(left.axes, right.axes)
    || compareText(left.error, right.error));
  result.uniqueRules = result.rules.length;
  return result;
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function formatAxes(axes: AxeAxes | undefined) {
  if (!axes) return '';
  const values = [
    ['browser', axes.browser],
    ['framework', axes.framework],
    ['brand', axes.brand],
    ['story', axes.story],
    ['viewport', axes.viewport],
    ['theme', axes.theme],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return values.map(([key, value]) => `${key}=${value}`).join(', ');
}

function formatCaptureCauses(result: UnknownRecord) {
  const captures = Array.isArray(result.captures) ? result.captures.filter(isRecord) : [];
  return captures
    .filter(capture => normalizedText(capture.error))
    .sort((left, right) => compareText(normalizedText(left.framework), normalizedText(right.framework))
      || compareText(normalizedText(left.error), normalizedText(right.error)))
    .map(capture => `- ${normalizedText(capture.framework) || 'framework desconhecido'}: ${normalizedText(capture.error)}`);
}

function groupsOf(result: UnknownRecord) {
  return isRecord(result.proofs) && Array.isArray(result.proofs.groups)
    ? result.proofs.groups.filter(isRecord)
    : [];
}

function formatVisualCauses(groups: UnknownRecord[]) {
  const lines: string[] = [];
  for (const group of groups) {
    for (const parity of Array.isArray(group.parity) ? group.parity.filter(isRecord) : []) {
      const mismatch = typeof parity.mismatch === 'number' && Number.isFinite(parity.mismatch)
        ? parity.mismatch
        : null;
      if (!(mismatch !== null && mismatch > 0) && parity.sizeMatch !== false) continue;
      const details = [
        normalizedText(parity.against) ? `contra ${normalizedText(parity.against)}` : '',
        mismatch !== null ? `mismatch: ${mismatch}` : '',
      ];
      if (parity.sizeMatch === false) {
        const reference = isRecord(parity.referenceSize)
          ? `${normalizedText(parity.referenceSize.width)}x${normalizedText(parity.referenceSize.height)}`
          : '';
        const against = isRecord(parity.againstSize)
          ? `${normalizedText(parity.againstSize.width)}x${normalizedText(parity.againstSize.height)}`
          : '';
        details.push(`dimensoes: ${reference || '?'} vs ${against || '?'}`);
      }
      const artifact = normalizedText(parity.diffPath);
      if (artifact) details.push(`artefato: ${artifact}`);
      lines.push(`- ${formatAxes(axesFrom(group, ''))}: ${details.filter(Boolean).join('; ')}`);
    }
  }
  return lines.sort(compareText);
}

function formatAxeCauses(groups: UnknownRecord[]) {
  const diagnostics = aggregateAxeDiagnostics(groups);
  if (diagnostics.failedAudits === 0 && diagnostics.unavailableAudits === 0) return [];
  const lines = diagnostics.rules.map(rule => {
    const evidence = rule.evidence[0];
    const label = rule.impact ? `${rule.id} (impacto: ${rule.impact})` : rule.id;
    const details = [
      [
        plural(rule.affectedAudits, 'auditoria afetada', 'auditorias afetadas'),
        plural(rule.occurrences, 'ocorrencia', 'ocorrencias'),
        plural(rule.affectedNodes, 'no afetado', 'nos afetados'),
      ].join(', '),
      formatAxes(evidence?.axes[0] || rule.axes[0]) ? `eixos: ${formatAxes(evidence?.axes[0] || rule.axes[0])}` : '',
      evidence?.target ? `alvo: ${evidence.target}` : '',
      evidence?.failureSummary ? `failureSummary: ${evidence.failureSummary}` : '',
      (evidence?.artifacts[0] || rule.artifacts[0])
        ? `artefato: ${evidence?.artifacts[0] || rule.artifacts[0]}`
        : '',
    ].filter(Boolean);
    return `- ${label}: ${details.join('; ')}`;
  });
  if (diagnostics.unavailableAudits > 0) {
    lines.push(`- ${plural(diagnostics.unavailableAudits, 'auditoria indisponivel', 'auditorias indisponiveis')}`);
  }
  return lines;
}

function formatAriaCauses(groups: UnknownRecord[]) {
  const lines: string[] = [];
  for (const group of groups) {
    if (!isRecord(group.a11y) || !Array.isArray(group.a11y.ariaParity)) continue;
    for (const comparison of group.a11y.ariaParity.filter(isRecord)) {
      if (comparison.match !== false) continue;
      const details = [
        normalizedText(comparison.against) ? `contra ${normalizedText(comparison.against)}` : '',
        formatAxes(axesFrom(group, '')),
        normalizedText(comparison.diffPath) ? `artefato: ${normalizedText(comparison.diffPath)}` : '',
      ].filter(Boolean);
      lines.push(`- ${details.join('; ')}`);
    }
  }
  return lines.sort(compareText);
}

function formatBehaviorCauses(result: UnknownRecord) {
  const routes = Array.isArray(result.routes) ? result.routes.filter(isRecord) : [];
  const lines: string[] = [];
  for (const route of routes) {
    const frameworkFailures: string[] = [];
    if (isRecord(route.frameworks)) {
      for (const [framework, candidate] of Object.entries(route.frameworks)) {
        if (!isRecord(candidate)) continue;
        const execution = normalizedText(candidate.execution);
        const conformance = normalizedText(candidate.conformance);
        if (execution !== 'error' && conformance !== 'failed') continue;
        frameworkFailures.push([
          framework,
          execution ? `execution=${execution}` : '',
          conformance ? `conformance=${conformance}` : '',
          normalizedText(candidate.error),
        ].filter(Boolean).join(' '));
      }
    }
    const parity = normalizedText(route.parity);
    if (parity === 'passed' && frameworkFailures.length === 0) continue;
    if (!parity && frameworkFailures.length === 0) continue;
    lines.push(`- ${normalizedText(route.routeId) || 'rota desconhecida'}: ${[
      parity ? `paridade=${parity}` : '',
      ...frameworkFailures.sort(compareText),
    ].filter(Boolean).join('; ')}`);
  }
  return lines.sort(compareText);
}

export function formatAttemptFailure(value: unknown): string {
  const result = isRecord(value) ? value : {};
  const logicalTestId = normalizedText(result.logicalTestId) || 'tentativa desconhecida';
  const attempt = Number.isSafeInteger(result.attempt) ? ` (attempt-${result.attempt})` : '';
  const groups = groupsOf(result);
  const sections: Array<[string, string[]]> = [
    ['Captura', formatCaptureCauses(result)],
    ['Visual/dimensoes', formatVisualCauses(groups)],
    ['Axe', formatAxeCauses(groups)],
    ['ARIA', formatAriaCauses(groups)],
    ['Comportamento', formatBehaviorCauses(result)],
  ];
  return [
    `Falha da tentativa ${logicalTestId}${attempt}.`,
    ...sections.flatMap(([title, lines]) => lines.length > 0 ? ['', `${title}:`, ...lines] : []),
  ].join('\n');
}
