import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {isDeepStrictEqual} from 'node:util';
import {readRunPlan} from './runPlan.ts';
import {atomicResultPath, readAtomicResults, consolidateAttempts} from './atomicResult.ts';
import {buildConfidenceGate} from './verdict.ts';
import {renderHtmlV2, renderSummaryV2} from './outputV2.ts';

const require = createRequire(import.meta.url);
const {buildManifestV2, writeManifest} = require('@gol-smiles/anemoi-core');
const {summarizeA11y} = require('../a11y');
const {collectProvenance} = require('../provenance');

interface FinalizeDependencies {
  summarizeA11y: typeof summarizeA11y;
  buildManifestV2: typeof buildManifestV2;
  renderSummaryV2: typeof renderSummaryV2;
  renderHtmlV2: typeof renderHtmlV2;
  writeManifest: typeof writeManifest;
  collectProvenance: typeof collectProvenance;
}

type UnknownRecord = Record<string, any>;
const EXPECTED_FRAMEWORKS = ['wc', 'react', 'angular'];
const EXPECTED_COMPARISONS = ['react', 'angular'];

export function finalizeRun(planPath: string, overrides: Partial<FinalizeDependencies> = {}) {
  const dependencies: FinalizeDependencies = {
    summarizeA11y,
    buildManifestV2,
    renderSummaryV2,
    renderHtmlV2,
    writeManifest,
    collectProvenance,
    ...overrides,
  };
  const plan = readRunPlan(planPath);
  const atomicResults = readAtomicResults(plan.runDir);
  const expected = new Set(plan.scenes
    .flatMap(scene => plan.browsers.map(browser => `${scene.cellId}--${browser}`)));
  const actual = new Set(atomicResults.map(result => result.logicalTestId));
  const missing = [...expected].filter(id => !actual.has(id));
  const unexpected = [...actual].filter(id => !expected.has(id));
  if (missing.length || unexpected.length) {
    throw new Error(
      `Matriz de Resultados Atomicos invalida. Resultado Atomico ausente: ${missing.join(', ') || '(nenhum)'}. Inesperado: ${unexpected.join(', ') || '(nenhum)'}.`,
    );
  }
  const plannedScenes = new Map(plan.scenes.map(scene => [scene.cellId, scene]));
  for (const result of atomicResults) {
    const planned = plannedScenes.get(result.scene.cellId);
    if (!planned) {
      throw new Error(
        `Cena planejada de ${result.logicalTestId} attempt-${result.attempt} inexistente: ${result.scene.cellId}.`,
      );
    }
    if (!isDeepStrictEqual(result.scene, planned)) {
      const fields = [...new Set([...Object.keys(planned), ...Object.keys(result.scene)])]
        .filter(field => !isDeepStrictEqual(
          planned[field as keyof typeof planned],
          result.scene[field as keyof typeof result.scene],
        ))
        .sort();
      throw new Error(
        `Cena planejada de ${result.logicalTestId} attempt-${result.attempt} diverge nos campos: ${fields.join(', ') || '(shape)'}.`,
      );
    }
  }
  const logical = consolidateAttempts(atomicResults);
  const browserCoverageFailed = exactSetFailures(plan.browsers, plan.requiredBrowsers);

  const allCaptures = logical.flatMap(result => result.final.captures) as UnknownRecord[];
  const captures = allCaptures.filter(capture => !('error' in capture));
  const captureErrors = allCaptures.filter(capture => 'error' in capture).length;
  const captureShapeUnavailable = logical.reduce((total, result) => total
    + exactSetFailures(
      result.final.captures.map(capture => String(capture.framework)),
      EXPECTED_FRAMEWORKS,
    ), 0);

  const groups = logical.flatMap(result => result.final.proofs.groups) as UnknownRecord[];
  const groupUnavailable = logical
    .filter(result => result.final.proofs.groups.length !== 1).length;
  const parityEntries = groups.flatMap(group => group.parity || []) as UnknownRecord[];
  const parityShapeUnavailable = groups.reduce((total, group) => total
    + exactSetFailures(
      (group.parity || []).map((item: UnknownRecord) => String(item.against)),
      EXPECTED_COMPARISONS,
    ), 0);
  const visualUnavailable = captureErrors + captureShapeUnavailable
    + (groupUnavailable * 2) + parityShapeUnavailable;

  const routeResults = logical.flatMap(result => result.final.routes);
  let routeIdentityUnavailable = 0;
  let routeCoversFailed = 0;
  for (const result of logical) {
    const expectedRoutes = plan.contract.routes.filter(route => route.sceneId === result.final.scene.id);
    const expectedIds = new Set(expectedRoutes.map(route => route.id));
    const missingOrDuplicate = expectedRoutes.filter(route => result.final.routes
      .filter(actualRoute => actualRoute.routeId === route.id).length !== 1).length;
    const unexpectedRoutes = result.final.routes.filter(route => !expectedIds.has(route.routeId)).length;
    const coversMismatch = expectedRoutes.filter(expectedRoute => {
      const actualRoute = result.final.routes.find(route => route.routeId === expectedRoute.id);
      return actualRoute && !arraysEqual(actualRoute.covers, expectedRoute.covers);
    }).length;
    routeIdentityUnavailable += missingOrDuplicate + unexpectedRoutes;
    routeCoversFailed += coversMismatch;
  }
  const conformanceUnavailable = routeResults
    .filter(route => Object.values(route.frameworks).some(value => value.execution === 'error')).length;
  const conformanceFailed = routeResults
    .filter(route => Object.values(route.frameworks).some(value => value.conformance === 'failed')).length;
  const behaviorParityUnavailable = routeResults
    .filter(route => route.parity === 'not-comparable' || route.parity === 'not-run').length;
  const behaviorParityFailed = routeResults.filter(route => route.parity === 'failed').length;

  const audits = groups.flatMap(group => Object.values(group.a11y?.audits || {})) as UnknownRecord[];
  const ariaEntries = groups.flatMap(group => group.a11y?.ariaParity || []) as UnknownRecord[];
  const auditShapeUnavailable = plan.collectA11y ? groups.reduce((total, group) => total
    + exactSetFailures(Object.keys(group.a11y?.audits || {}), EXPECTED_FRAMEWORKS), 0) : 0;
  const ariaShapeUnavailable = plan.collectA11y ? groups.reduce((total, group) => total
    + exactSetFailures(
      (group.a11y?.ariaParity || []).map((item: UnknownRecord) => String(item.against)),
      EXPECTED_COMPARISONS,
    ), 0) : 0;
  const a11yUnavailable = audits.filter(audit => audit.error).length
    + auditShapeUnavailable + (groupUnavailable * plan.frameworks.length);
  const ariaUnavailable = ariaShapeUnavailable + (groupUnavailable * 2);
  const axeFailed = audits.filter(audit => (audit.violations || []).length > 0).length;

  const interruptedAttempts = logical.filter(result => result.final.status === 'error'
    || result.final.diagnostics.pageErrors.length > 0).length;
  const failedExecutions = logical.filter(result => result.final.status === 'failed').length;
  const attemptGaps = logical.filter(result => result.attempts
    .some((attempt, index) => attempt.attempt !== index)).length;
  const executedBehaviors = [...new Set(routeResults.flatMap(route => route.covers))];
  const behaviorCoverageFailed = exactSetFailures(
    executedBehaviors,
    plan.contract.requiredBehaviors,
  );
  const staleContract = plan.contract.status === 'stale' ? 1 : 0;
  const dimensions = {
    browserCoverage: verdict(0, browserCoverageFailed),
    visualParity: verdict(visualUnavailable, parityEntries.filter(item => item.mismatch > 0).length),
    dimensions: verdict(visualUnavailable, parityEntries.filter(item => item.sizeMatch === false).length),
    axe: verdict(a11yUnavailable + (plan.collectA11y ? 0 : 1), axeFailed),
    ariaParity: verdict(a11yUnavailable + ariaUnavailable + (plan.collectA11y ? 0 : 1), ariaEntries.filter(item => item.match === false).length),
    behavioralConformance: verdict(
      staleContract + conformanceUnavailable + routeIdentityUnavailable + routeCoversFailed,
      conformanceFailed,
    ),
    behavioralParity: verdict(
      staleContract + behaviorParityUnavailable + routeIdentityUnavailable + routeCoversFailed,
      behaviorParityFailed,
    ),
    contractCoverage: verdict(
      staleContract + routeIdentityUnavailable,
      routeCoversFailed + behaviorCoverageFailed,
    ),
    stability: verdict(
      interruptedAttempts + attemptGaps,
      failedExecutions + logical.filter(result => result.stability === 'flaky').length,
    ),
  };
  const gate = buildConfidenceGate({diagnostic: plan.diagnostic, dimensions});

  const a11y = dependencies.summarizeA11y(groups);
  const provenance = dependencies.collectProvenance({repo: plan.repo, browsers: plan.browsers});
  const manifest = dependencies.buildManifestV2({
    tool: 'Anemoi Web',
    status: gate.status === 'passed' ? 'passed' : 'failed',
    card: plan.card,
    component: plan.component,
    mode: 'current',
    axes: {browsers: plan.browsers, frameworks: plan.frameworks},
    cellCount: captures.length,
    groups,
    a11y,
    provenance,
    behavior: {
      contract: plan.contract,
      results: logical.map(result => ({
        logicalTestId: result.logicalTestId,
        stability: result.stability,
        routes: result.final.routes,
      })),
    },
    gate,
    attempts: logical.map(result => ({
      logicalTestId: result.logicalTestId,
      stability: result.stability,
      attempts: result.attempts.map(item => ({
        attempt: item.attempt,
        status: item.status,
        resultPath: path.relative(
          plan.runDir,
          atomicResultPath(plan.runDir, item.logicalTestId, item.attempt),
        ),
        attachments: item.diagnostics.attachments,
      })),
    })),
    runDir: plan.runDir,
  });

  const manifestPath = path.join(plan.runDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json ja existe; run finalizado e imutavel: ${manifestPath}.`);
  }
  const summary = dependencies.renderSummaryV2(manifest);
  const html = dependencies.renderHtmlV2(manifest);
  writeTextAtomic(path.join(plan.runDir, 'summary.md'), summary);
  writeTextAtomic(path.join(plan.runDir, 'index.html'), html);
  dependencies.writeManifest(plan.runDir, manifest);
  return manifest;
}

function writeTextAtomic(file: string, content: string) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const handle = fs.openSync(temporary, 'wx');
    try {
      fs.writeFileSync(handle, content, 'utf8');
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, {force: true});
  }
}

function arraysEqual(actual: string[], expected: string[]) {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function exactSetFailures(actual: string[], expected: string[]) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const duplicateActual = actual.length - actualSet.size;
  const duplicateExpected = expected.length - expectedSet.size;
  const missing = [...expectedSet].filter(value => !actualSet.has(value)).length;
  const unexpected = [...actualSet].filter(value => !expectedSet.has(value)).length;
  return duplicateActual + duplicateExpected + missing + unexpected;
}

function verdict(unavailable: number, failed: number) {
  return {
    status: unavailable ? 'unavailable' : failed ? 'failed' : 'passed',
    required: true,
    unavailable,
    failed,
  } as const;
}
