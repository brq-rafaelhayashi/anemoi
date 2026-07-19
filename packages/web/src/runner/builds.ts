import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {makeWcHarnessHost} = require('../hosts/wc-harness');
const {makeReactHost} = require('../hosts/react');
const {makeAngularHost} = require('../hosts/angular');

interface HarnessHost {
  build(repo: string, outDir: string, options: {logPath: string}): string | undefined;
}

type HarnessFactory = (repo: string) => HarnessHost;
type HarnessFactories = Record<'wc' | 'react' | 'angular', HarnessFactory>;

interface BuildDependencies {
  factories?: HarnessFactories;
}

export function prepareHarnessBuilds(
  repo: string,
  runDir: string,
  dependencies: BuildDependencies = {},
) {
  const factories: HarnessFactories = dependencies.factories || {
    wc: makeWcHarnessHost,
    react: makeReactHost,
    angular: makeAngularHost,
  };
  const buildRoot = path.join(runDir, 'build');
  const logRoot = path.join(runDir, 'logs');
  fs.mkdirSync(buildRoot, {recursive: true});
  fs.mkdirSync(logRoot, {recursive: true});

  const builds: Partial<Record<keyof HarnessFactories, string>> = {};
  for (const framework of ['wc', 'react', 'angular'] as const) {
    const outDir = path.join(buildRoot, framework);
    const builtDir = factories[framework](repo).build(repo, outDir, {
      logPath: path.join(logRoot, `${framework}-harness-build.log`),
    });
    builds[framework] = builtDir || outDir;
  }

  const result = builds as {wc: string; react: string; angular: string};
  fs.writeFileSync(path.join(runDir, 'builds.json'), `${JSON.stringify(result, null, 2)}\n`, {flag: 'wx'});
  return result;
}
