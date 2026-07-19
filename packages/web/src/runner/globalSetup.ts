import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {readRunPlan} from './runPlan.ts';
import {startStaticHosts} from './serverLifecycle.ts';

const require = createRequire(path.join(__dirname, 'globalSetup.ts'));
const {serveStatic} = require('@gol-smiles/anemoi-core');

export default async function globalSetup() {
  const plan = readRunPlan();
  const builds = JSON.parse(fs.readFileSync(path.join(plan.runDir, 'builds.json'), 'utf8'));
  return startStaticHosts({
    frameworks: plan.frameworks,
    builds,
    hostsPath: plan.hostsPath,
    serveStatic,
    writeHosts: (file, hosts) => {
      fs.writeFileSync(file, `${JSON.stringify(hosts, null, 2)}\n`);
    },
  });
}
