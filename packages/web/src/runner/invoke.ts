import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const RUNNER_DIR = path.dirname(fileURLToPath(import.meta.url));

interface InvokeOptions {
  planPath: string;
  logPath: string;
  spawn?: typeof childProcess.spawn;
  mkdir?: typeof fs.mkdirSync;
  writeFile?: typeof fs.writeFileSync;
}

export function invokePlaywright({
  planPath,
  logPath,
  spawn = childProcess.spawn,
  mkdir = fs.mkdirSync,
  writeFile = fs.writeFileSync,
}: InvokeOptions) {
  return new Promise<{exitCode: number; signal: NodeJS.Signals | null}>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;
    const cli = require.resolve('@playwright/test/cli');
    const child = spawn(
      process.execPath,
      [cli, 'test', '--config', path.resolve(RUNNER_DIR, '../../playwright.config.ts')],
      {
        cwd: path.resolve(RUNNER_DIR, '../..'),
        env: {...process.env, ANEMOI_RUN_PLAN: planPath},
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      },
    );
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk: Buffer) => {
        chunks.push(Buffer.from(chunk));
        process.stderr.write(chunk);
      });
    }
    child.on('error', error => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      try {
        mkdir(path.dirname(logPath), {recursive: true});
        writeFile(logPath, Buffer.concat(chunks));
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        reject(new Error(
          `Falha ao persistir log do Playwright Test em ${logPath}: ${detail}`,
          {cause},
        ));
        return;
      }
      resolve({exitCode: exitCode ?? 2, signal});
    });
  });
}
