import path from 'node:path';
import {createRequire} from 'node:module';
import {readRunPlan} from './runPlan.ts';
import {atomicResultPath, readAtomicResults, consolidateAttempts} from './atomicResult.ts';
import {buildConfidenceGate} from './verdict.ts';

const require = createRequire(import.meta.url);
const {buildManifestV2, writeManifest} = require('@gol-smiles/anemoi-core');
const {summarizeA11y} = require('../a11y');
const {collectProvenance} = require('../provenance');

interface FinalizeDependencies {
  summarizeA11y: typeof summarizeA11y;
  buildManifestV2: typeof buildManifestV2;
  writeManifest: typeof writeManifest;
  collectProvenance: typeof collectProvenance;
}

type UnknownRecord = Record<string, any>;

export function finalizeRun(planPath: string, overrides: Partial<FinalizeDependencies> = {}) {
  const dependencies: FinalizeDependencies = {
    summarizeA11y,
    buildManifestV2,
    writeManifest,
    collectProvenance,
    ...overrides,
  };
  const plan = readRunPlan(planPath);
  const logical = consolidateAttempts(readAtomicResults(plan.runDir));
  const expected = new Set(plan.scenes
    .flatMap(scene => plan.browsers.map(browser => `${scene.cellId}--${browser}`)));
  const actual = new Set(logical.map(result => result.logicalTestId));
  const missing = [...expected].filter(id => !actual.has(id));
  const unexpected = [...actual].filter(id => !expected.has(id));
  if (missing.length || unexpected.length) {
    throw new Error(
      `Matriz de Resultados Atomicos invalida. Resultado Atomico ausente: ${missing.join(', ') || '(nenhum)'}. Inesperado: ${unexpected.join(', ') || '(nenhum)'}.`,
    );
  }

  const allCaptures = logical.flatMap(result => result.final.captures) as UnknownRecord[];
  const captures = allCaptures.filter(capture => !('error' in capture));
  const captureErrors = allCaptures.filter(capture => 'error' in capture).length;
  const captureShapeUnavailable = logical.reduce((total, result) => total
    + plan.frameworks.filter(framework => result.final.captures
      .filter(capture => capture.framework === framework).length !== 1).length, 0);

  const groups = logical.flatMap(result => result.final.proofs.groups) as UnknownRecord[];
  const groupUnavailable = logical
    .filter(result => result.final.proofs.groups.length !== 1).length;
  const parityEntries = groups.flatMap(group => group.parity || []) as UnknownRecord[];
  const parityShapeUnavailable = groups.reduce((total, group) => total
    + ['react', 'angular'].filter(framework => (group.parity || [])
      .filter((item: UnknownRecord) => item.against === framework).length !== 1).length, 0);
  const visualUnavailable = captureErrors + captureShapeUnavailable
    + (groupUnavailable * 2) + parityShapeUnavailable;

  const routeResults = logical.flatMap(result => result.final.routes);
  const routeShapeUnavailable = logical.reduce((total, result) => {
    const expectedRoutes = plan.contract.routes.filter(route => route.sceneId === result.final.scene.id);
    const expectedIds = new Set(expectedRoutes.map(route => route.id));
    const missingOrDuplicate = expectedRoutes.filter(route => result.final.routes
      .filter(actualRoute => actualRoute.routeId === route.id).length !== 1).length;
    const unexpectedRoutes = result.final.routes.filter(route => !expectedIds.has(route.routeId)).length;
    return total + missingOrDuplicate + unexpectedRoutes;
  }, 0);
  const conformanceUnavailable = routeResults
    .filter(route => Object.values(route.frameworks).some(value => value.execution === 'error')).length;
  const conformanceFailed = routeResults
    .filter(route => Object.values(route.frameworks).some(value => value.conformance === 'failed')).length;
  const behaviorParityUnavailable = routeResults
    .filter(route => route.parity === 'not-comparable' || route.parity === 'not-run').length;
  const behaviorParityFailed = routeResults.filter(route => route.parity === 'failed').length;

  const audits = groups.flatMap(group => Object.values(group.a11y?.audits || {})) as UnknownRecord[];
  const ariaEntries = groups.flatMap(group => group.a11y?.ariaParity || []) as UnknownRecord[];
  const auditShapeUnavailable = groups.reduce((total, group) => total
    + plan.frameworks.filter(framework => !group.a11y
      || !Object.hasOwn(group.a11y.audits || {}, framework)).length, 0);
  const ariaShapeUnavailable = groups.reduce((total, group) => total
    + ['react', 'angular'].filter(framework => (group.a11y?.ariaParity || [])
      .filter((item: UnknownRecord) => item.against === framework).length !== 1).length, 0);
  const a11yUnavailable = audits.filter(audit => audit.error).length
    + auditShapeUnavailable + (groupUnavailable * plan.frameworks.length);
  const ariaUnavailable = ariaShapeUnavailable + (groupUnavailable * 2);
  const axeFailed = audits.filter(audit => (audit.violations || []).length > 0).length;

  const interruptedAttempts = logical.filter(result => result.final.status === 'error'
    || result.final.diagnostics.pageErrors.length > 0).length;
  const attemptGaps = logical.filter(result => result.attempts
    .some((attempt, index) => attempt.attempt !== index)).length;
  const uncoveredBehaviors = plan.contract.requiredBehaviors
    .filter(id => !plan.contract.coveredBehaviors.includes(id));
  const staleContract = plan.contract.status === 'stale' ? 1 : 0;
  const dimensions = {
    browserCoverage: verdict(0, 0),
    visualParity: verdict(visualUnavailable, parityEntries.filter(item => item.mismatch > 0).length),
    dimensions: verdict(visualUnavailable, parityEntries.filter(item => item.sizeMatch === false).length),
    axe: verdict(a11yUnavailable + (plan.collectA11y ? 0 : 1), axeFailed),
    ariaParity: verdict(a11yUnavailable + ariaUnavailable + (plan.collectA11y ? 0 : 1), ariaEntries.filter(item => item.match === false).length),
    behavioralConformance: verdict(staleContract + conformanceUnavailable + routeShapeUnavailable, conformanceFailed),
    behavioralParity: verdict(staleContract + behaviorParityUnavailable + routeShapeUnavailable, behaviorParityFailed),
    contractCoverage: verdict(staleContract + routeShapeUnavailable, uncoveredBehaviors.length),
    stability: verdict(interruptedAttempts + attemptGaps, logical.filter(result => result.stability === 'flaky').length),
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

  dependencies.writeManifest(plan.runDir, manifest);
  return manifest;
}

function verdict(unavailable: number, failed: number) {
  return {
    status: unavailable ? 'unavailable' : failed ? 'failed' : 'passed',
    required: true,
    unavailable,
    failed,
  } as const;
}
