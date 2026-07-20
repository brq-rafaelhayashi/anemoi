import type {Locator, Page} from '@playwright/test';

export type BrowserName = 'chromium' | 'firefox' | 'webkit';
export type Framework = 'wc' | 'react' | 'angular';
export type ExecutionVerdict = 'passed' | 'error';
export type ProofVerdict = 'passed' | 'failed' | 'not-run' | 'not-comparable';
export type Stability = 'stable' | 'flaky';

export interface SupportMatrix {
  schemaVersion: 1;
  required: BrowserName[];
  optional: BrowserName[];
}

export interface SceneContext {
  kind: 'form';
  id: string;
}

export interface SceneDefinition {
  id: string;
  name: string;
  component: string;
  args: Record<string, unknown>;
  slots: Record<string, string | {icon: string}>;
  context?: SceneContext;
  legacyStoryName?: string;
}

export interface BehaviorRouteDefinition {
  id: string;
  sceneId: string;
  covers: string[];
}

export interface ContractDefinition {
  schemaVersion: 1;
  consumer: string;
  component: string;
  requiredBehaviors: string[];
  routes: BehaviorRouteDefinition[];
}

export interface PlannedScene extends SceneDefinition {
  cellId: string;
  brand: string;
  theme: string;
  viewport: string;
  width: number;
}

export interface RunPlan {
  schemaVersion: 1;
  runId: string;
  runDir: string;
  repo: string;
  consumer: string;
  component: string;
  card: string;
  diagnostic: boolean;
  collectA11y: boolean;
  browsers: BrowserName[];
  requiredBrowsers: BrowserName[];
  frameworks: Framework[];
  specPath: string;
  hostsPath: string;
  scenes: PlannedScene[];
  contract: {
    status: 'current' | 'stale';
    fingerprintDigest: string;
    currentDigest: string;
    requiredBehaviors: string[];
    coveredBehaviors: string[];
    routes: BehaviorRouteDefinition[];
  };
}

export interface BehaviorObservation<State = Record<string, unknown>> {
  focus: unknown;
  events: Array<{name: string; detail?: unknown}>;
  visibility: Record<string, boolean>;
  state: State;
}

export interface BehaviorContext {
  page: Page;
  root: Locator;
  scene: PlannedScene;
  listen(names: string[]): Promise<void>;
  readEvents(): Promise<Array<{name: string; detail?: unknown}>>;
}

export interface BehaviorExecution<State = Record<string, unknown>> {
  observation: BehaviorObservation<State>;
  assert(observation: BehaviorObservation<State>): void | Promise<void>;
}

export type BehaviorScript<State = Record<string, unknown>> =
  (context: BehaviorContext) => Promise<BehaviorExecution<State>>;

export type BehaviorScripts = Record<string, BehaviorScript>;

export interface FrameworkBehaviorResult {
  execution: ExecutionVerdict;
  conformance: ProofVerdict;
  observation?: BehaviorObservation;
  error?: string;
}

export interface RouteResult {
  routeId: string;
  covers: string[];
  frameworks: Record<Framework, FrameworkBehaviorResult>;
  parity: ProofVerdict;
  diff?: unknown;
}

export interface AtomicResult {
  schemaVersion: 1;
  logicalTestId: string;
  attempt: number;
  browser: BrowserName;
  scene: PlannedScene;
  status: 'passed' | 'failed' | 'error';
  captures: Array<Record<string, unknown>>;
  proofs: {groups: Array<Record<string, unknown>>};
  routes: RouteResult[];
  diagnostics: {
    console: string[];
    pageErrors: string[];
    attachments: string[];
  };
}
