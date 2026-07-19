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
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
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

const ARTIFACT_PATH_KEYS = new Set(['relPath', 'ariaRelPath', 'artifactPath', 'diffPath']);

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
    if (ARTIFACT_PATH_KEYS.has(key)) {
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isSlotValue(value: unknown) {
  return typeof value === 'string' || (isRecord(value) && isNonEmptyString(value.icon));
}

function assertScene(value: unknown): asserts value is AtomicResult['scene'] {
  if (!isRecord(value)
    || !isNonEmptyString(value.id)
    || !isNonEmptyString(value.cellId)
    || !isNonEmptyString(value.name)
    || !isNonEmptyString(value.component)
    || !isRecord(value.args)
    || !isRecord(value.slots)
    || Object.values(value.slots).some(item => !isSlotValue(item))
    || !isNonEmptyString(value.brand)
    || !isNonEmptyString(value.theme)
    || !isNonEmptyString(value.viewport)
    || !Number.isFinite(value.width)
    || (value.width as number) <= 0) {
    throw new Error('Resultado Atomico scene invalida.');
  }
}

function assertRecordArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some(item => !isRecord(item))) {
    throw new Error(`Resultado Atomico ${label} invalido.`);
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
  assertScene(result.scene);
  if (logicalTestId !== `${result.scene.cellId}--${result.browser}`) {
    throw new Error(`Resultado Atomico identidade invalida: ${logicalTestId}.`);
  }
  assertRecordArray(result.captures, 'captures');
  if (!isRecord(result.proofs)) {
    throw new Error('Resultado Atomico proofs invalido.');
  }
  assertRecordArray(result.proofs.groups, 'proofs');
  assertRecordArray(result.routes, 'routes');
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

  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const handle = fs.openSync(temporary, 'wx');
    try {
      fs.writeFileSync(handle, serialized);
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.linkSync(temporary, file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`Resultado Atomico ja existe e e imutavel: ${file}.`, {cause: error});
    }
    throw error;
  } finally {
    fs.rmSync(temporary, {force: true});
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
      if (attemptEntry.name !== `attempt-${attempt}`) {
        throw new Error(`Diretorio de tentativa invalido: ${attemptEntry.name}.`);
      }
      const file = path.join(logicalDir, attemptEntry.name, 'result.json');
      if (!fs.existsSync(file)) throw new Error(`Resultado Atomico ausente na tentativa: ${file}.`);
      results.push(readResult(file, logicalTestId, attempt));
    }
  }
  return results.sort((left, right) =>
    left.logicalTestId.localeCompare(right.logicalTestId) || left.attempt - right.attempt);
}

function normalizeAttemptLocalAddress(value: unknown) {
  return typeof value === 'string'
    ? value.replace(/(^|[\\/])attempt-\d+(?=[\\/])/g, '$1attempt-*')
    : value;
}

function normalizeArtifactAddresses(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeArtifactAddresses);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => {
        if (ARTIFACT_PATH_KEYS.has(key)) return [key, normalizeAttemptLocalAddress(item)];
        if (key === 'attachments' && Array.isArray(item)) {
          return [key, item.map(normalizeAttemptLocalAddress)];
        }
        return [key, normalizeArtifactAddresses(item)];
      }));
  }
  return value;
}

function signature(result: AtomicResult) {
  return JSON.stringify(normalizeArtifactAddresses({
    status: result.status,
    captures: result.captures,
    proofs: result.proofs,
    routes: result.routes,
    diagnostics: result.diagnostics,
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
