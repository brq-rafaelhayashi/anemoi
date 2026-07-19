import type {
  BehaviorContext,
  BehaviorRouteDefinition,
  BehaviorScript,
  Framework,
  PlannedScene,
  RouteResult,
} from './types.ts';
import {assertObservation, compareObservations} from './observation.ts';

const FRAMEWORKS: Framework[] = ['wc', 'react', 'angular'];

interface MountedContext {
  page: BehaviorContext['page'];
  root: BehaviorContext['root'];
  listen(names: string[]): Promise<void>;
  readEvents(): Promise<Array<{name: string; detail?: unknown}>>;
}

interface ExecuteInput {
  route: BehaviorRouteDefinition;
  scene: PlannedScene;
  script: BehaviorScript;
  mount(framework: Framework, scene: PlannedScene): Promise<MountedContext>;
}

function errorMessage(error: unknown): string {
  return String((error as Error)?.message || error);
}

export async function executeBehaviorRoute({
  route,
  scene,
  script,
  mount,
}: ExecuteInput): Promise<RouteResult> {
  const frameworks = {} as RouteResult['frameworks'];

  for (const framework of FRAMEWORKS) {
    try {
      const mounted = await mount(framework, scene);
      const execution = await script({...mounted, scene});
      const observation = assertObservation(execution.observation);
      try {
        await execution.assert(observation);
        frameworks[framework] = {
          execution: 'passed',
          conformance: 'passed',
          observation,
        };
      } catch (error) {
        frameworks[framework] = {
          execution: 'passed',
          conformance: 'failed',
          observation,
          error: errorMessage(error),
        };
      }
    } catch (error) {
      frameworks[framework] = {
        execution: 'error',
        conformance: 'not-run',
        error: errorMessage(error),
      };
    }
  }

  if (FRAMEWORKS.some(framework => frameworks[framework].execution === 'error')) {
    return {
      routeId: route.id,
      covers: route.covers,
      frameworks,
      parity: 'not-comparable',
    };
  }

  const reference = frameworks.wc.observation!;
  const comparisons = (['react', 'angular'] as Framework[]).map(framework => ({
    framework,
    ...compareObservations(reference, frameworks[framework].observation!),
  }));
  const failed = comparisons.filter(item => !item.match);
  return failed.length === 0
    ? {
        routeId: route.id,
        covers: route.covers,
        frameworks,
        parity: 'passed',
      }
    : {
        routeId: route.id,
        covers: route.covers,
        frameworks,
        parity: 'failed',
        diff: failed,
      };
}
