import type {Framework} from './types.ts';

interface StaticServer {
  url: string;
  close(): void | Promise<void>;
}

interface StartStaticHostsInput {
  frameworks: Framework[];
  builds: Record<Framework, string>;
  hostsPath: string;
  serveStatic(build: string): Promise<StaticServer>;
  writeHosts(file: string, hosts: Record<string, {url: string}>): void;
}

async function closeAll(servers: StaticServer[]) {
  const settled = await Promise.allSettled(
    servers.map(server => Promise.resolve().then(() => server.close())),
  );
  return settled.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
}

function cleanupFailure(original: unknown, failures: unknown[]) {
  const message = original instanceof Error ? original.message : String(original);
  return new AggregateError(
    failures,
    `${message}; falha ao fechar ${failures.length} servidor(es).`,
    {cause: original},
  );
}

export async function startStaticHosts({
  frameworks,
  builds,
  hostsPath,
  serveStatic,
  writeHosts,
}: StartStaticHostsInput): Promise<() => Promise<void>> {
  const servers: StaticServer[] = [];
  const hosts: Record<string, {url: string}> = {};
  try {
    for (const framework of frameworks) {
      const server = await serveStatic(builds[framework]);
      servers.push(server);
      hosts[framework] = {url: server.url};
    }
    writeHosts(hostsPath, hosts);
  } catch (error) {
    const failures = await closeAll(servers);
    if (failures.length > 0) throw cleanupFailure(error, failures);
    throw error;
  }

  return async () => {
    const failures = await closeAll(servers);
    if (failures.length > 0) {
      throw new AggregateError(failures, `Falha ao fechar ${failures.length} servidor(es).`);
    }
  };
}
