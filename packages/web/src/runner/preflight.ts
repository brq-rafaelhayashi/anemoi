import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import type {BrowserName, ContractDefinition, SceneDefinition, SupportMatrix} from './types.ts';

const require = createRequire(import.meta.url);
const {runTangerinaBuilds} = require('../tangerina');
const {assertCaptureReady} = require('../doctor');
const {VIEWPORT_WIDTHS} = require('../brands');

const RUNNER_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(RUNNER_DIR, '..', '..');

interface PreflightOptions {
  repo: string;
  runDir: string;
  consumer?: string;
  component: string;
  card: string;
  brands?: string[];
  themes?: string[];
  viewports?: string[];
  scenesFilter?: string[];
  selectedBrowsers?: BrowserName[];
  collectA11y?: boolean;
  skipBuild?: boolean;
}

interface Definition {
  contract: ContractDefinition;
  scenes: SceneDefinition[];
}

interface PreflightDependencies {
  definition?: Definition;
  contractDir?: string;
  support?: SupportMatrix;
  reviewedFingerprint?: {component: string; digest: string};
  currentFingerprint?: {component: string; digest: string};
  prepareConsumer?: (repo: string, options: Record<string, unknown>) => void;
  prepareHarnessBuilds?: (repo: string, runDir: string) => unknown;
  [key: string]: any;
}

async function importTs(relativePath: string) {
  return import(pathToFileURL(path.join(RUNNER_DIR, relativePath)).href);
}

function assertDefinitionIdentity(definition: Definition, consumer: string, component: string) {
  if (definition.contract.consumer !== consumer || definition.contract.component !== component) {
    throw new Error(
      `Contrato incompativel: esperado ${consumer}/${component}, recebido `
      + `${definition.contract.consumer}/${definition.contract.component}.`,
    );
  }
  const incompatible = definition.scenes.find(scene => scene.component !== component);
  if (incompatible) {
    throw new Error(`Cena ${incompatible.id} pertence a componente incompativel: ${incompatible.component}.`);
  }
}

export async function preflightRun(
  {
    repo,
    runDir,
    consumer = 'tangerina',
    component,
    card,
    brands = ['gol'],
    themes = ['light', 'dark'],
    viewports = ['sm', 'lg'],
    scenesFilter,
    selectedBrowsers,
    collectA11y = true,
    skipBuild = false,
  }: PreflightOptions,
  dependencies: PreflightDependencies = {},
) {
  const [supportModule, contractsModule, surfaceModule, fingerprintModule, planModule, buildsModule] = await Promise.all([
    importTs('supportMatrix.ts'),
    importTs('contracts.ts'),
    importTs('publicSurface.ts'),
    importTs('fingerprint.ts'),
    importTs('runPlan.ts'),
    importTs('builds.ts'),
  ]);
  const runtime = {
    ...supportModule,
    ...contractsModule,
    ...surfaceModule,
    ...fingerprintModule,
    ...planModule,
    ...buildsModule,
    prepareConsumer(repoPath: string, options: Record<string, unknown>) {
      runTangerinaBuilds(repoPath, options);
      assertCaptureReady(repoPath);
    },
    ...dependencies,
  };

  const contractDir = dependencies.contractDir || path.join(WEB_ROOT, 'contracts', consumer, component);
  const definition: Definition = dependencies.definition || await Promise.all([
    import(pathToFileURL(path.join(contractDir, 'contract.ts')).href),
    import(pathToFileURL(path.join(contractDir, 'scenes.ts')).href),
  ]).then(([contractFile, scenesFile]) => ({
    contract: contractFile.contract as ContractDefinition,
    scenes: scenesFile.scenes as SceneDefinition[],
  }));
  assertDefinitionIdentity(definition, consumer, component);
  const coverage = runtime.validateContract(definition.contract, definition.scenes);
  const fingerprintFile = path.join(contractDir, 'fingerprint.json');
  const reviewed = dependencies.reviewedFingerprint || runtime.readReviewedFingerprint(fingerprintFile);
  if (reviewed.component !== component) {
    throw new Error(
      `Fingerprint revisado pertence a ${reviewed.component}; componente solicitado: ${component}.`,
    );
  }
  const support = dependencies.support || runtime.loadSupportMatrix(repo);

  const scenes = scenesFilter?.length
    ? definition.scenes.filter(scene => scenesFilter.includes(scene.id) || scenesFilter.includes(scene.name))
    : definition.scenes;
  if (scenes.length === 0) {
    throw new Error(`Nenhuma Cena corresponde ao filtro: ${(scenesFilter || []).join(', ')}.`);
  }

  fs.mkdirSync(path.join(runDir, 'logs', 'tangerina'), {recursive: true});
  runtime.prepareConsumer(repo, {
    skipBuild,
    logDir: path.join(runDir, 'logs', 'tangerina'),
  });

  const current = dependencies.currentFingerprint
    || runtime.createFingerprint(runtime.readPublicSurface(repo, component));
  if (current.component !== component) {
    throw new Error(
      `Fingerprint atual pertence a ${current.component}; componente solicitado: ${component}.`,
    );
  }
  const contractStatus = reviewed.digest === current.digest && coverage.missing.length === 0
    ? 'current'
    : 'stale';

  const forceDiagnostic = scenes.length !== definition.scenes.length
    || !['gol'].every(value => brands.includes(value))
    || !['light', 'dark'].every(value => themes.includes(value))
    || !['sm', 'lg'].every(value => viewports.includes(value));
  const plan = runtime.buildRunPlan({
    runId: path.basename(path.resolve(runDir)),
    runDir,
    repo,
    consumer,
    component,
    card,
    specPath: path.join(contractDir, 'behaviors.spec.ts'),
    hostsPath: path.join(runDir, 'hosts.json'),
    support,
    selectedBrowsers,
    collectA11y,
    forceDiagnostic,
    scenes,
    contractState: {
      status: contractStatus,
      fingerprintDigest: reviewed.digest,
      currentDigest: current.digest,
      requiredBehaviors: coverage.required,
      coveredBehaviors: coverage.covered,
      routes: definition.contract.routes,
    },
    brands,
    themes,
    viewports,
    viewportWidths: VIEWPORT_WIDTHS,
  });
  runtime.prepareHarnessBuilds(repo, runDir);
  const planPath = path.join(runDir, 'run-plan.json');
  runtime.writeRunPlan(planPath, plan);
  return {plan, planPath};
}
