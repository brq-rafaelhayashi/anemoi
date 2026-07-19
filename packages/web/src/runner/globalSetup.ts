import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {readRunPlan} from './runPlan.ts';

const require = createRequire(path.join(__dirname, 'globalSetup.ts'));
const {serveStatic} = require('@gol-smiles/anemoi-core');

export default async function globalSetup() {
  const plan = readRunPlan();
  const builds = JSON.parse(fs.readFileSync(path.join(plan.runDir, 'builds.json'), 'utf8'));
  const servers: Array<{close(): Promise<void>}> = [];
  const hosts: Record<string, {url: string}> = {};
  for (const framework of plan.frameworks) {
    const server = await serveStatic(builds[framework]);
    servers.push(server);
    hosts[framework] = {url: server.url};
  }
  fs.writeFileSync(plan.hostsPath, `${JSON.stringify(hosts, null, 2)}\n`);
  return async () => {
    await Promise.all(servers.map(server => server.close()));
  };
}
