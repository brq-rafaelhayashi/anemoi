import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {AtomicResult, Stability} from './types.ts';

export interface LogicalResult {
  logicalTestId: string;
  stability: Stability;
  attempts: AtomicResult[];
  final: AtomicResult;
}

const BROWSERS = new Set(['chromium', 'firefox', 'webkit']);
const STATUSES = new Set(['passed', 'failed', 'error']);

function safeId(value: unknown): string {
  if (typeof value !== 'string'
    || !value
    || value === '.'
    || value === '..'
    || /[\\/\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`logicalTestId invalido: ${JSON.stringify(value)}.`);
  }
  return value;
}

function assertAttempt(value: unknown): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`attempt invalido: ${String(value)}.`);
  }
}

export function atomicResultPath(runDir: string, logicalTestId: string, attempt: number) {
  assertAttempt(attempt);
  return path.join(runDir, 'results', safeId(logicalTestId), `attempt-${attempt}`, 'result.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertArtifactPath(value: unknown) {
  if (typeof value !== 'string'
    || !value
    || value.includes('\u0000')
    || path.posix.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || value.split(/[\\/]+/).includes('..')) {
    throw new Error(`artifact path invalido: ${String(value)}.`);
  }
}

function validateArtifactPaths(value: unknown, seen = new Set<object>()) {
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('Resultado Atomico nao e serializavel: referencia circular.');
    seen.add(value);
    value.forEach(item => validateArtifactPaths(item, seen));
    seen.delete(value);
    return;
  }
  if (!isRecord(value)) return;
  if (seen.has(value)) throw new Error('Resultado Atomico nao e serializavel: referencia circular.');
  seen.add(value);
  for (const [key, item] of Object.entries(value)) {
    if (key.toLowerCase().endsWith('path')) {
      assertArtifactPath(item);
    } else if (key === 'attachments') {
      if (!Array.isArray(item)) throw new Error('diagnostics.attachments invalido.');
      item.forEach(assertArtifactPath);
    } else {
      validateArtifactPaths(item, seen);
    }
  }
  seen.delete(value);
}

function assertStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${label} invalido.`);
  }
}

export function validateAtomicResult(result: AtomicResult): AtomicResult {
  if (!isRecord(result)) throw new Error('Resultado Atomico invalido.');
  if (result.schemaVersion !== 1) {
    throw new Error(`Resultado Atomico schemaVersion invalido: ${String(result.schemaVersion)}.`);
  }
  const logicalTestId = safeId(result.logicalTestId);
  assertAttempt(result.attempt);
  if (!BROWSERS.has(result.browser as string)) {
    throw new Error(`Resultado Atomico browser invalido: ${String(result.browser)}.`);
  }
  if (!STATUSES.has(result.status as string)) {
    throw new Error(`Resultado Atomico status invalido: ${String(result.status)}.`);
  }
  if (!isRecord(result.scene) || typeof result.scene.cellId !== 'string' || !result.scene.cellId) {
    throw new Error('Resultado Atomico scene invalida.');
  }
  if (logicalTestId !== `${result.scene.cellId}--${result.browser}`) {
    throw new Error(`Resultado Atomico identidade invalida: ${logicalTestId}.`);
  }
  if (!Array.isArray(result.captures)) throw new Error('Resultado Atomico captures invalido.');
  if (!isRecord(result.proofs) || !Array.isArray(result.proofs.groups)) {
    throw new Error('Resultado Atomico proofs invalido.');
  }
  if (!Array.isArray(result.routes)) throw new Error('Resultado Atomico routes invalido.');
  if (!isRecord(result.diagnostics)) throw new Error('Resultado Atomico diagnostics invalido.');
  assertStringArray(result.diagnostics.console, 'diagnostics.console');
  assertStringArray(result.diagnostics.pageErrors, 'diagnostics.pageErrors');
  if (!Array.isArray(result.diagnostics.attachments)) {
    throw new Error('diagnostics.attachments invalido.');
  }
  validateArtifactPaths(result);
  return result;
}

export function writeAtomicResult(runDir: string, result: AtomicResult) {
  validateAtomicResult(result);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  const file = atomicResultPath(runDir, result.logicalTestId, result.attempt);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  if (fs.existsSync(file)) {
    throw new Error(`Resultado Atomico ja existe e e imutavel: ${file}.`);
  }

  const lock = `${file}.lock`;
  let lockHandle: number | undefined;
  let temporary = '';
  try {
    lockHandle = fs.openSync(lock, 'wx');
    if (fs.existsSync(file)) {
      throw new Error(`Resultado Atomico ja existe e e imutavel: ${file}.`);
    }
    temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    const handle = fs.openSync(temporary, 'wx');
    try {
      fs.writeFileSync(handle, serialized);
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(temporary, file);
    temporary = '';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`Resultado Atomico ja existe, esta sendo publicado ou e imutavel: ${file}.`, {cause: error});
    }
    throw error;
  } finally {
    if (temporary) fs.rmSync(temporary, {force: true});
    if (lockHandle !== undefined) {
      fs.closeSync(lockHandle);
      fs.rmSync(lock, {force: true});
    }
  }
  return file;
}

function readResult(file: string, logicalTestId: string, attempt: number) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Resultado Atomico malformado: ${file}.`, {cause: error});
  }
  const result = validateAtomicResult(parsed as AtomicResult);
  if (result.logicalTestId !== logicalTestId || result.attempt !== attempt) {
    throw new Error(`Resultado Atomico identidade do path diverge do payload: ${file}.`);
  }
  return result;
}

export function readAtomicResults(runDir: string): AtomicResult[] {
  const root = path.join(runDir, 'results');
  if (!fs.existsSync(root)) return [];
  const results: AtomicResult[] = [];
  for (const logicalEntry of fs.readdirSync(root, {withFileTypes: true})) {
    const logicalTestId = safeId(logicalEntry.name);
    if (!logicalEntry.isDirectory()) {
      throw new Error(`Diretorio de Resultado Atomico invalido: ${logicalEntry.name}.`);
    }
    const logicalDir = path.join(root, logicalTestId);
    for (const attemptEntry of fs.readdirSync(logicalDir, {withFileTypes: true})) {
      const match = /^attempt-(\d+)$/.exec(attemptEntry.name);
      if (!attemptEntry.isDirectory() || !match) {
        throw new Error(`Diretorio de tentativa invalido: ${attemptEntry.name}.`);
      }
      const attempt = Number(match[1]);
      assertAttempt(attempt);
      const file = path.join(logicalDir, attemptEntry.name, 'result.json');
      if (!fs.existsSync(file)) throw new Error(`Resultado Atomico ausente na tentativa: ${file}.`);
      results.push(readResult(file, logicalTestId, attempt));
    }
  }
  return results.sort((left, right) =>
    left.logicalTestId.localeCompare(right.logicalTestId) || left.attempt - right.attempt);
}

function withoutPaths(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPaths);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !key.toLowerCase().endsWith('path'))
      .map(([key, item]) => [key, withoutPaths(item)]));
  }
  return value;
}

function signature(result: AtomicResult) {
  return JSON.stringify(withoutPaths({
    status: result.status,
    captures: result.captures,
    proofs: result.proofs,
    routes: result.routes,
  }));
}

export function consolidateAttempts(results: AtomicResult[]): LogicalResult[] {
  const groups = new Map<string, AtomicResult[]>();
  for (const result of results) {
    validateAtomicResult(result);
    const attempts = groups.get(result.logicalTestId) || [];
    if (attempts.some(item => item.attempt === result.attempt)) {
      throw new Error(`Resultado Atomico com tentativa duplicada: ${result.logicalTestId} attempt-${result.attempt}.`);
    }
    groups.set(result.logicalTestId, [...attempts, result]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([logicalTestId, unordered]) => {
      const attempts = [...unordered].sort((left, right) => left.attempt - right.attempt);
      const stability: Stability = new Set(attempts.map(signature)).size === 1 ? 'stable' : 'flaky';
      return {logicalTestId, stability, attempts, final: attempts.at(-1)!};
    });
}
