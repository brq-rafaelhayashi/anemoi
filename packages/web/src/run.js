'use strict';

const fs = require('node:fs');
const path = require('node:path');
const legacy = require('./run-legacy');
const {runDoctor} = require('./doctor');
const {writeFailureManifest} = require('./failure');

function list(value, fallback) {
  return value
    ? String(value).split(',').map(item => item.trim()).filter(Boolean)
    : fallback;
}

async function defaultFinalize(planPath) {
  const {finalizeRun} = await import('./runner/finalize.ts');
  return finalizeRun(planPath);
}

async function defaultPreflight(options) {
  const {preflightRun} = await import('./runner/preflight.ts');
  return preflightRun(options);
}

async function defaultInvoke(options) {
  const {invokePlaywright} = await import('./runner/invoke.ts');
  return invokePlaywright(options);
}

async function defaultReview(options) {
  const {reviewContract} = await import('./runner/reviewContract.ts');
  return reviewContract(options);
}

async function runPlaywrightState(args, cwd, overrides = {}) {
  if (!args.component) throw new Error('informe --component <nome> (ex.: tgr-button).');
  if (args['before-after']) {
    throw new Error('before/after ainda nao implementado. Use o modo estado-atual.');
  }

  const a11y = legacy.resolveA11yFlags(args);
  const repo = args.repo || cwd;
  const component = args.component;
  const card = args.card || 'sem-card';
  const createRunDir = overrides.createRunDir || legacy.createRunDir;
  const preflight = overrides.preflight || defaultPreflight;
  const invoke = overrides.invoke || defaultInvoke;
  const finalize = overrides.finalize || defaultFinalize;
  const setExitCode = overrides.setExitCode || (value => { process.exitCode = value; });
  const writeFailure = overrides.writeFailure || writeFailureManifest;
  const runDir = createRunDir(repo, card, component);
  fs.mkdirSync(runDir, {recursive: true});

  let stage = 'preflight';
  try {
    const {plan, planPath} = await preflight({
      repo,
      runDir,
      consumer: 'tangerina',
      component,
      card,
      brands: list(args.brands, ['gol']),
      themes: list(args.themes, ['light', 'dark']),
      viewports: list(args.viewports, ['sm', 'lg']),
      scenesFilter: list(args.stories, undefined),
      selectedBrowsers: list(args.browsers, undefined),
      collectA11y: a11y.collectA11y,
      skipBuild: Boolean(args['skip-build']),
    });
    if (args['list-stories']) {
      const scenes = plan.scenes.filter((value, index, all) => (
        all.findIndex(item => item.id === value.id) === index
      ));
      for (const scene of scenes) console.log(`  - ${scene.name} (${scene.id})`);
      return {plan};
    }

    stage = 'playwright-test';
    const execution = await invoke({
      planPath,
      logPath: path.join(runDir, 'logs', 'playwright-test.log'),
    });
    if (![0, 1].includes(execution.exitCode)) {
      throw new Error(`Playwright Test falhou com exit ${execution.exitCode}.`);
    }

    stage = 'finalize';
    const manifest = await finalize(planPath);
    setExitCode(manifest.gate.status === 'failed' ? 1 : 0);
    return manifest;
  } catch (error) {
    try {
      writeFailure(runDir, {stage, card, component}, error);
    } catch {}
    throw error;
  }
}

async function runCurrentState(args, cwd) {
  if (args.doctor) return runDoctor(args.repo || cwd);
  if (args['review-contract']) {
    if (!args.component) throw new Error('--review-contract exige --component.');
    const repo = args.repo || cwd;
    const reviewRunDir = legacy.createRunDir(repo, 'contract-review', args.component);
    legacy.prepareCapture(repo, {
      logDir: path.join(reviewRunDir, 'logs', 'tangerina'),
    });
    return defaultReview({repo, consumer: 'tangerina', component: args.component});
  }
  if (args.engine === 'playwright-test') return runPlaywrightState(args, cwd);
  if (args.engine && args.engine !== 'legacy') {
    throw new Error(`Engine desconhecida: ${args.engine}.`);
  }
  return legacy.runCurrentState(args, cwd);
}

module.exports = {
  ...legacy,
  runCurrentState,
  runPlaywrightState,
};
