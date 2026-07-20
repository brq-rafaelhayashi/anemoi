import path from 'node:path';
import {defineConfig} from '@playwright/test';
import {readRunPlan} from './src/runner/runPlan.ts';

const plan = readRunPlan();
const WEB_ROOT = __dirname;

export default defineConfig({
  testDir: path.dirname(plan.specPath),
  testMatch: path.basename(plan.specPath),
  outputDir: path.join(plan.runDir, 'playwright'),
  timeout: 120000,
  expect: {timeout: 10000},
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['line']],
  globalSetup: path.join(WEB_ROOT, 'src/runner/globalSetup.ts'),
  use: {
    deviceScaleFactor: 2,
    trace: 'off',
    screenshot: 'off',
  },
  projects: plan.browsers.map(browserName => ({name: browserName, use: {browserName}})),
});
