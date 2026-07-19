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

function cellId(parts: string[]) {
  const slug = parts.join('--').replace(/[^a-zA-Z0-9._-]/g, '-');
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 12);
  return `${slug}--${digest}`;
}

function hasInitialRequiredBrowsers(support: SupportMatrix) {
  return support.required.length === REQUIRED_BROWSERS.size
    && support.required.every(browser => REQUIRED_BROWSERS.has(browser));
}

function assertUniqueAxis(label: string, values: string[]) {
  if (values.length === 0 || values.some(value => !value) || new Set(values).size !== values.length) {
    throw new Error(`Eixo ${label} vazio, invalido ou duplicado.`);
  }
}

export function buildRunPlan(input: BuildInput): RunPlan {
  if (!input.support || !hasInitialRequiredBrowsers(input.support)) {
    throw new Error('Matriz de Suporte deve exigir chromium, firefox e webkit.');
  }
  const browsers = input.selectedBrowsers ?? input.support.required;
  if (browsers.length === 0 || new Set(browsers).size !== browsers.length) {
    throw new Error('Selecao de browsers vazia ou duplicada.');
  }
  const supported = new Set([...input.support.required, ...input.support.optional]);
  for (const browser of browsers) {
    if (!supported.has(browser)) {
      throw new Error(`Browser fora da Matriz de Suporte: ${browser}.`);
    }
  }
  assertUniqueAxis('scenes', input.scenes.map(scene => scene.id));
  assertUniqueAxis('brands', input.brands);
  assertUniqueAxis('themes', input.themes);
  assertUniqueAxis('viewports', input.viewports);

  const scenes = input.scenes.flatMap(scene => input.brands.flatMap(brand =>
    input.themes.flatMap(theme => input.viewports.map(viewport => {
      const width = input.viewportWidths[viewport];
      if (!Number.isFinite(width) || width <= 0) {
        throw new Error(`Viewport desconhecido: ${viewport}.`);
      }
      return {
        ...scene,
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
    || input.support.required.some(browser => !browsers.includes(browser));

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
    requiredBrowsers: [...input.support.required],
    frameworks: ['wc', 'react', 'angular'],
    specPath: input.specPath,
    hostsPath: input.hostsPath,
    scenes,
    contract: input.contractState,
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
