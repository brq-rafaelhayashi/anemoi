import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import type {BrowserName, RunPlan, SceneDefinition, SupportMatrix} from './types.ts';

interface BuildInput {
  runId: string;
  runDir: string;
  repo: string;
  consumer: string;
  component: string;
  card: string;
  specPath: string;
  hostsPath: string;
  support: SupportMatrix;
  selectedBrowsers?: BrowserName[];
  collectA11y?: boolean;
  forceDiagnostic?: boolean;
  scenes: SceneDefinition[];
  contractState: RunPlan['contract'];
  brands: string[];
  themes: string[];
  viewports: string[];
  viewportWidths: Record<string, number>;
}

const REQUIRED_BROWSERS = new Set<BrowserName>(['chromium', 'firefox', 'webkit']);
const THEME_ORDER = new Map([['light', 0], ['dark', 1]]);

function cellId(parts: string[]) {
  const slug = parts.join('--').replace(/[^a-zA-Z0-9._-]/g, '-');
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 12);
  return `${slug}--${digest}`;
}

function hasInitialRequiredBrowsers(support: SupportMatrix) {
  return support.required.length === REQUIRED_BROWSERS.size
    && new Set(support.required).size === REQUIRED_BROWSERS.size
    && support.required.every(browser => REQUIRED_BROWSERS.has(browser));
}

function assertUniqueAxis(label: string, values: string[]) {
  if (values.length === 0 || values.some(value => !value) || new Set(values).size !== values.length) {
    throw new Error(`Eixo ${label} vazio, invalido ou duplicado.`);
  }
}

function lexical(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareThemes(left: string, right: string) {
  const leftRank = THEME_ORDER.get(left) ?? THEME_ORDER.size;
  const rightRank = THEME_ORDER.get(right) ?? THEME_ORDER.size;
  return leftRank - rightRank || lexical(left, right);
}

export function buildRunPlan(input: BuildInput): RunPlan {
  if (!input.support || !hasInitialRequiredBrowsers(input.support)) {
    throw new Error('Matriz de Suporte deve exigir chromium, firefox e webkit.');
  }
  const requiredBrowsers = [...input.support.required];
  const optionalBrowsers = [...input.support.optional];
  const policyOrder = [...requiredBrowsers, ...optionalBrowsers];
  if (input.support.schemaVersion !== 1
    || optionalBrowsers.some(browser => !REQUIRED_BROWSERS.has(browser))
    || new Set(policyOrder).size !== policyOrder.length) {
    throw new Error('Matriz de Suporte invalida: browsers desconhecidos ou duplicados.');
  }
  const selectedBrowsers = [...(input.selectedBrowsers ?? requiredBrowsers)];
  const sceneDefinitions = input.scenes.map(scene => structuredClone(scene));
  const brands = [...input.brands];
  const themes = [...input.themes];
  const viewports = [...input.viewports];
  const viewportWidths = {...input.viewportWidths};

  if (selectedBrowsers.length === 0 || new Set(selectedBrowsers).size !== selectedBrowsers.length) {
    throw new Error('Selecao de browsers vazia ou duplicada.');
  }
  const supported = new Set(policyOrder);
  for (const browser of selectedBrowsers) {
    if (!supported.has(browser)) {
      throw new Error(`Browser fora da Matriz de Suporte: ${browser}.`);
    }
  }
  assertUniqueAxis('scenes', sceneDefinitions.map(scene => scene.id));
  assertUniqueAxis('brands', brands);
  assertUniqueAxis('themes', themes);
  assertUniqueAxis('viewports', viewports);
  for (const viewport of viewports) {
    const width = viewportWidths[viewport];
    if (!Number.isFinite(width) || width <= 0) {
      throw new Error(`Viewport desconhecido: ${viewport}.`);
    }
  }

  const selectedSet = new Set(selectedBrowsers);
  const browsers = policyOrder.filter(browser => selectedSet.has(browser));
  const scenes = sceneDefinitions.sort((left, right) => lexical(left.id, right.id));
  brands.sort(lexical);
  themes.sort(compareThemes);
  viewports.sort((left, right) => viewportWidths[left] - viewportWidths[right] || lexical(left, right));

  const plannedScenes = scenes.flatMap(scene => brands.flatMap(brand =>
    themes.flatMap(theme => viewports.map(viewport => {
      const width = viewportWidths[viewport];
      return {
        ...structuredClone(scene),
        brand,
        theme,
        viewport,
        width,
        cellId: cellId([scene.id, brand, theme, viewport]),
      };
    }))));
  const collectA11y = input.collectA11y !== false;
  const diagnostic = Boolean(input.forceDiagnostic)
    || !collectA11y
    || requiredBrowsers.some(browser => !selectedSet.has(browser));

  return {
    schemaVersion: 1,
    runId: input.runId,
    runDir: input.runDir,
    repo: input.repo,
    consumer: input.consumer,
    component: input.component,
    card: input.card,
    diagnostic,
    collectA11y,
    browsers: [...browsers],
    requiredBrowsers,
    frameworks: ['wc', 'react', 'angular'],
    specPath: input.specPath,
    hostsPath: input.hostsPath,
    scenes: plannedScenes,
    contract: structuredClone(input.contractState),
  };
}

export function writeRunPlan(file: string, plan: RunPlan | object) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  if (fs.existsSync(file)) {
    throw new Error(`run-plan ja existe e e imutavel: ${file}.`);
  }
  const lock = `${file}.lock`;
  let lockHandle: number | undefined;
  let temporary = '';
  try {
    lockHandle = fs.openSync(lock, 'wx');
    if (fs.existsSync(file)) {
      throw new Error(`run-plan ja existe e e imutavel: ${file}.`);
    }
    temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    const handle = fs.openSync(temporary, 'wx');
    try {
      fs.writeFileSync(handle, `${JSON.stringify(plan, null, 2)}\n`);
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(temporary, file);
    temporary = '';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`run-plan ja existe, esta sendo publicado ou e imutavel: ${file}.`, {cause: error});
    }
    throw error;
  } finally {
    if (temporary) fs.rmSync(temporary, {force: true});
    if (lockHandle !== undefined) {
      fs.closeSync(lockHandle);
      fs.rmSync(lock, {force: true});
    }
  }
}

export function readRunPlan(file = process.env.ANEMOI_RUN_PLAN || ''): RunPlan {
  if (!file) throw new Error('ANEMOI_RUN_PLAN nao informado.');
  const plan = JSON.parse(fs.readFileSync(file, 'utf8')) as RunPlan;
  if (!plan || plan.schemaVersion !== 1) {
    throw new Error(`run-plan schemaVersion invalido: ${plan?.schemaVersion}.`);
  }
  return plan;
}
