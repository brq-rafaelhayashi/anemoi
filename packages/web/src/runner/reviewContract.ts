import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import readline from 'node:readline/promises';

const RUNNER_DIR = path.dirname(fileURLToPath(import.meta.url));

export async function askConfirmation(prompt: string) {
  const input = readline.createInterface({input: process.stdin, output: process.stdout});
  try {
    return input.question(prompt);
  } finally {
    input.close();
  }
}

export function formatDiff(diff: any) {
  if (diff.kind === 'added') return `+ ${diff.path}: ${JSON.stringify(diff.value ?? diff.after)}`;
  if (diff.kind === 'removed') return `- ${diff.path}: ${JSON.stringify(diff.value ?? diff.before)}`;
  return `~ ${diff.path}: ${JSON.stringify(diff.before)} -> ${JSON.stringify(diff.after)}`;
}

export async function reviewContract(
  {
    repo,
    consumer = 'tangerina',
    component,
    confirm = askConfirmation,
    write = console.log,
  }: any,
  overrides: Record<string, any> = {},
) {
  const [surfaceModule, fingerprintModule] = await Promise.all([
    import(pathToFileURL(path.join(RUNNER_DIR, 'publicSurface.ts')).href),
    import(pathToFileURL(path.join(RUNNER_DIR, 'fingerprint.ts')).href),
  ]);
  const runtime = {...surfaceModule, ...fingerprintModule, ...overrides};
  const file = path.resolve(RUNNER_DIR, '..', '..', 'contracts', consumer, component, 'fingerprint.json');
  const reviewed = runtime.readReviewedFingerprint(file);
  const current = runtime.createFingerprint(runtime.readPublicSurface(repo, component));
  const diffs = runtime.diffFingerprints(reviewed, current);
  for (const diff of diffs) write(formatDiff(diff));
  if (diffs.length === 0) return {updated: false, diffs};
  const answer = String(await confirm('Atualizar fingerprint revisado? [y/N] ')).trim().toLowerCase();
  if (!['y', 'yes'].includes(answer)) return {updated: false, diffs};
  runtime.writeReviewedFingerprint(file, current);
  return {updated: true, diffs};
}
