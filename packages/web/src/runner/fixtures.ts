import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {test as base, expect} from '@playwright/test';
import {readRunPlan} from './runPlan.ts';
import {executeBehaviorRoutes} from './behavior.ts';
import {atomicResultPath, writeAtomicResult} from './atomicResult.ts';
import type {AtomicResult, BehaviorScripts, ContractDefinition, Framework, PlannedScene} from './types.ts';

const require = createRequire(path.join(__dirname, 'fixtures.ts'));
const {captureCellOnPage} = require('@gol-smiles/anemoi-core');
const {groupByCell, computeParity} = require('../parity');
const {computeA11y, hasA11yDivergence} = require('../a11y');
const {makeWcHarnessHost} = require('../hosts/wc-harness');
const {makeReactHost} = require('../hosts/react');
const {makeAngularHost} = require('../hosts/angular');

const factories: Record<Framework, (repo: string) => any> = {
  wc: makeWcHarnessHost,
  react: makeReactHost,
  angular: makeAngularHost,
};

interface RunSceneInput {
  contract: ContractDefinition;
  scene: PlannedScene;
  scripts: BehaviorScripts;
}

interface AnemoiFixture {
  runScene(input: RunSceneInput): Promise<void>;
}

interface ActiveAttempt {
  browser: AtomicResult['browser'];
  logicalTestId: string;
  scene: PlannedScene;
  captures: AtomicResult['captures'];
  groups: AtomicResult['proofs']['groups'];
  routes: AtomicResult['routes'];
  attachments: string[];
}

function prefixCapturePaths(capture: any, evidenceRoot: string, runDir: string) {
  const prefix = (value: string) => path.relative(runDir, path.join(evidenceRoot, value));
  return {
    ...capture,
    relPath: prefix(capture.relPath),
    ...(capture.a11y ? {a11y: {
      ...capture.a11y,
      ...(capture.a11y.relPath ? {relPath: prefix(capture.a11y.relPath)} : {}),
      ...(capture.a11y.ariaRelPath ? {ariaRelPath: prefix(capture.a11y.ariaRelPath)} : {}),
    }} : {}),
  };
}

export const test = base.extend<{anemoi: AnemoiFixture}>({
  anemoi: async ({page, context}, use, testInfo) => {
    const plan = readRunPlan();
    const hosts = JSON.parse(fs.readFileSync(plan.hostsPath, 'utf8'));
    const consoleMessages: string[] = [];
    const pageErrors: string[] = [];
    const state: {active: ActiveAttempt | null; resultWritten: boolean} = {active: null, resultWritten: false};
    let tracing = testInfo.retry > 0;
    if (tracing) await context.tracing.start({screenshots: true, snapshots: true, sources: true});
    page.on('console', message => consoleMessages.push(`${message.type()}: ${message.text()}`));
    page.on('pageerror', error => pageErrors.push(error.message));

    try {
      await use({
        async runScene({contract, scene, scripts}) {
          const browser = testInfo.project.name as AtomicResult['browser'];
          const logicalTestId = `${scene.cellId}--${browser}`;
          const resultFile = atomicResultPath(plan.runDir, logicalTestId, testInfo.retry);
          const attemptDir = path.dirname(resultFile);
          const evidenceRoot = path.join(attemptDir, 'evidence');
          const attachmentRoot = path.join(attemptDir, 'attachments');
          fs.mkdirSync(attachmentRoot, {recursive: true});
          const captures: AtomicResult['captures'] = [];
          state.active = {browser, logicalTestId, scene, captures, groups: [], routes: [], attachments: []};
          state.resultWritten = false;
          for (const framework of plan.frameworks) {
            const host = factories[framework](plan.repo);
            try {
              const capture = await captureCellOnPage(page, {
                ...scene, browser, framework, storyId: scene.id, storyName: scene.name,
              }, host, hosts[framework].url, evidenceRoot, {collectA11y: plan.collectA11y});
              captures.push(prefixCapturePaths(capture, evidenceRoot, plan.runDir));
            } catch (error) {
              captures.push({framework, browser, error: String((error as Error)?.message || error)});
            }
          }

          const mount = async (framework: Framework, current: PlannedScene) => {
            const host = factories[framework](plan.repo);
            await page.setViewportSize({width: current.width, height: 900});
            await page.goto(host.urlFor(current, hosts[framework].url), {waitUntil: 'networkidle', timeout: 30000});
            await host.verify(page, current);
            const root = page.locator(host.selectorFor(current));
            return {
              page,
              root,
              async listen(names: string[]) {
                await root.evaluate((element, eventNames) => {
                  const target = element as HTMLElement & {__anemoiEvents?: unknown[]};
                  target.__anemoiEvents = [];
                  for (const name of eventNames) target.addEventListener(name, event => {
                    const custom = event as CustomEvent;
                    const serialized = custom.detail === undefined
                      ? undefined
                      : JSON.stringify(custom.detail, (_key, value) => value instanceof Event ? undefined : value);
                    const detail = serialized === undefined ? undefined : JSON.parse(serialized);
                    target.__anemoiEvents!.push(detail === undefined ? {name} : {name, detail});
                  });
                }, names);
              },
              async readEvents() {
                return root.evaluate(element => (element as HTMLElement & {
                  __anemoiEvents?: Array<{name: string; detail?: unknown}>;
                }).__anemoiEvents || []) as Promise<Array<{name: string; detail?: unknown}>>;
              },
            };
          };

          const routes = state.active!.routes;
          if (plan.contract.status === 'current') {
            await executeBehaviorRoutes({
              routes: contract.routes.filter(item => item.sceneId === scene.id),
              scene,
              scripts,
              mount,
              results: routes,
            });
          }
          const validCaptures = captures.filter(capture => !('error' in capture));
          const artifactPrefix = path.relative(plan.runDir, evidenceRoot);
          const parityGroups = computeParity(groupByCell(validCaptures), plan.runDir, {artifactPrefix});
          const groups: any[] = computeA11y(parityGroups, plan.runDir, {artifactPrefix});
          state.active!.groups = groups;
          const visualFailed = groups.flatMap((group: any) => group.parity || [])
            .some((parity: any) => parity.mismatch > 0 || parity.sizeMatch === false);
          const failed = captures.some(capture => 'error' in capture)
            || visualFailed
            || hasA11yDivergence(groups)
            || routes.some(route => route.parity !== 'passed'
              || Object.values(route.frameworks).some((value: any) => value.conformance !== 'passed'));
          const attachments: string[] = [];
          state.active!.attachments = attachments;
          if (failed) {
            const screenshot = path.join(attachmentRoot, 'failure.png');
            await page.screenshot({path: screenshot, fullPage: true});
            attachments.push(path.relative(plan.runDir, screenshot));
          }
          if (tracing) {
            const trace = path.join(attachmentRoot, 'trace.zip');
            await context.tracing.stop({path: trace});
            tracing = false;
            attachments.push(path.relative(plan.runDir, trace));
          }
          const result: AtomicResult = {
            schemaVersion: 1,
            logicalTestId,
            attempt: testInfo.retry,
            browser,
            scene,
            status: failed ? 'failed' : 'passed',
            captures,
            proofs: {groups},
            routes,
            diagnostics: {console: consoleMessages, pageErrors, attachments},
          };
          const resultPath = writeAtomicResult(plan.runDir, result);
          state.resultWritten = true;
          await testInfo.attach('anemoi-result', {path: resultPath, contentType: 'application/json'});
          expect(result.status, JSON.stringify({logicalTestId, routes}, null, 2)).toBe('passed');
        },
      });
    } finally {
      // Timeout, excecao inesperada ou fixture interrompida tambem deve deixar uma
      // tentativa explicita. Sem isto, retry que passa esconderia a primeira falha.
      const active = state.active;
      if (active && !state.resultWritten) {
        const resultFile = atomicResultPath(plan.runDir, active.logicalTestId, testInfo.retry);
        const attachmentRoot = path.join(path.dirname(resultFile), 'attachments');
        fs.mkdirSync(attachmentRoot, {recursive: true});
        try {
          if (!page.isClosed()) {
            const screenshot = path.join(attachmentRoot, 'failure.png');
            await page.screenshot({path: screenshot, fullPage: true});
            active.attachments.push(path.relative(plan.runDir, screenshot));
          }
        } catch (error) {
          pageErrors.push(`screenshot: ${String((error as Error)?.message || error)}`);
        }
        if (tracing) {
          try {
            const trace = path.join(attachmentRoot, 'trace.zip');
            await context.tracing.stop({path: trace});
            active.attachments.push(path.relative(plan.runDir, trace));
          } catch (error) {
            pageErrors.push(`trace: ${String((error as Error)?.message || error)}`);
          }
          tracing = false;
        }
        const reason = testInfo.error?.message || 'tentativa interrompida antes da publicacao do Resultado Atomico';
        const emergency: AtomicResult = {
          schemaVersion: 1,
          logicalTestId: active.logicalTestId,
          attempt: testInfo.retry,
          browser: active.browser,
          scene: active.scene,
          status: 'error',
          captures: active.captures,
          proofs: {groups: active.groups},
          routes: active.routes,
          diagnostics: {
            console: consoleMessages,
            pageErrors: [...pageErrors, `execution: ${reason}`],
            attachments: active.attachments,
          },
        };
        const emergencyPath = writeAtomicResult(plan.runDir, emergency);
        state.resultWritten = true;
        await testInfo.attach('anemoi-result', {path: emergencyPath, contentType: 'application/json'});
      }
      if (tracing) await context.tracing.stop();
    }
  },
});

export {expect};
