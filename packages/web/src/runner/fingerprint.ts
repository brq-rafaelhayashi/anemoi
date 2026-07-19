import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {PublicSurface} from './publicSurface.ts';

export interface ReviewedFingerprint {
  schemaVersion: 1;
  component: string;
  digest: string;
  surface: PublicSurface;
}

export interface FingerprintDiff {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  value?: unknown;
  before?: unknown;
  after?: unknown;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function fingerprintDigest(surface: PublicSurface) {
  return createHash('sha256').update(canonical(surface)).digest('hex');
}

export function createFingerprint(surface: PublicSurface): ReviewedFingerprint {
  const digest = fingerprintDigest(surface);
  return {schemaVersion: 1, component: surface.component, digest, surface};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: string[], label: string) {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  if (actual.length !== canonicalExpected.length
    || actual.some((key, index) => key !== canonicalExpected[index])) {
    throw new Error(`Fingerprint revisado ${label} invalido.`);
  }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Fingerprint revisado ${label} invalido.`);
  }
}

function assertStringArray(value: unknown, label: string, allowEmptyItem = false) {
  if (!Array.isArray(value)
    || value.some(item => typeof item !== 'string' || (!allowEmptyItem && item.length === 0))) {
    throw new Error(`Fingerprint revisado ${label} invalido.`);
  }
}

function assertNamedTypes(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new Error(`Fingerprint revisado ${label} invalido.`);
  for (const item of value) {
    if (!isRecord(item)) throw new Error(`Fingerprint revisado ${label} invalido.`);
    assertExactKeys(item, ['name', 'type'], label);
    assertNonEmptyString(item.name, `${label}.name`);
    assertNonEmptyString(item.type, `${label}.type`);
  }
}

export function validateReviewedFingerprint(value: unknown): ReviewedFingerprint {
  if (!isRecord(value)) throw new Error('Fingerprint revisado invalido.');
  assertExactKeys(value, ['schemaVersion', 'component', 'digest', 'surface'], 'shape');
  if (value.schemaVersion !== 1) {
    throw new Error(`Fingerprint revisado schemaVersion invalido: ${String(value.schemaVersion)}.`);
  }
  assertNonEmptyString(value.component, 'component');
  if (typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.digest)) {
    throw new Error('Fingerprint revisado digest invalido; esperado SHA-256 lowercase.');
  }
  if (!isRecord(value.surface)) throw new Error('Fingerprint revisado surface invalido.');
  assertExactKeys(value.surface, ['component', 'wc', 'react', 'angular'], 'surface');
  assertNonEmptyString(value.surface.component, 'surface.component');
  if (value.surface.component !== value.component) {
    throw new Error(
      `Fingerprint revisado component diverge da surface: ${value.component} != ${value.surface.component}.`,
    );
  }

  const wc = value.surface.wc;
  if (!isRecord(wc)) throw new Error('Fingerprint revisado surface.wc invalido.');
  assertExactKeys(wc, ['attributes', 'properties', 'events', 'slots'], 'surface.wc');
  assertNamedTypes(wc.attributes, 'surface.wc.attributes');
  assertNamedTypes(wc.properties, 'surface.wc.properties');
  assertNamedTypes(wc.events, 'surface.wc.events');
  assertStringArray(wc.slots, 'surface.wc.slots', true);

  const react = value.surface.react;
  if (!isRecord(react)) throw new Error('Fingerprint revisado surface.react invalido.');
  assertExactKeys(react, ['exportName', 'events'], 'surface.react');
  assertNonEmptyString(react.exportName, 'surface.react.exportName');
  assertStringArray(react.events, 'surface.react.events');

  const angular = value.surface.angular;
  if (!isRecord(angular)) throw new Error('Fingerprint revisado surface.angular invalido.');
  assertExactKeys(
    angular,
    ['selector', 'inputs', 'outputs', 'projectableSlots'],
    'surface.angular',
  );
  assertNonEmptyString(angular.selector, 'surface.angular.selector');
  if (angular.selector !== value.component) {
    throw new Error('Fingerprint revisado surface.angular.selector invalido.');
  }
  assertStringArray(angular.inputs, 'surface.angular.inputs');
  assertStringArray(angular.outputs, 'surface.angular.outputs');
  assertStringArray(angular.projectableSlots, 'surface.angular.projectableSlots', true);

  const fingerprint = value as unknown as ReviewedFingerprint;
  const currentDigest = fingerprintDigest(fingerprint.surface);
  if (fingerprint.digest !== currentDigest) {
    throw new Error(
      `Fingerprint revisado digest diverge da surface: ${fingerprint.digest} != ${currentDigest}.`,
    );
  }
  return fingerprint;
}

function flatten(value: unknown, prefix = '', out = new Map<string, unknown>()) {
  if (Array.isArray(value)) {
    out.set(prefix, value);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      flatten(item, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out.set(prefix, value);
  }
  return out;
}

function multiset(values: unknown[]) {
  const result = new Map<string, number>();
  for (const value of values) {
    const key = canonical(value);
    result.set(key, (result.get(key) || 0) + 1);
  }
  return result;
}

export function diffFingerprints(
  reviewed: ReviewedFingerprint,
  current: ReviewedFingerprint,
): FingerprintDiff[] {
  const before = flatten(reviewed.surface);
  const after = flatten(current.surface);
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const diffs: FingerprintDiff[] = [];
  for (const itemPath of paths) {
    const left = before.get(itemPath);
    const right = after.get(itemPath);
    if (Array.isArray(left) && Array.isArray(right)) {
      const leftValues = multiset(left);
      const rightValues = multiset(right);
      const values = [...new Set([...leftValues.keys(), ...rightValues.keys()])].sort();
      for (const value of values) {
        const removed = Math.max((leftValues.get(value) || 0) - (rightValues.get(value) || 0), 0);
        const added = Math.max((rightValues.get(value) || 0) - (leftValues.get(value) || 0), 0);
        for (let index = 0; index < added; index += 1) {
          diffs.push({path: itemPath, kind: 'added', value: JSON.parse(value)});
        }
        for (let index = 0; index < removed; index += 1) {
          diffs.push({path: itemPath, kind: 'removed', value: JSON.parse(value)});
        }
      }
    } else if (canonical(left) !== canonical(right)) {
      diffs.push({
        path: itemPath,
        kind: left === undefined ? 'added' : right === undefined ? 'removed' : 'changed',
        before: left,
        after: right,
      });
    }
  }
  return diffs;
}

export function readReviewedFingerprint(file: string): ReviewedFingerprint {
  const content = fs.readFileSync(file, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Fingerprint revisado possui JSON invalido: ${file}.`, {cause: error});
  }
  return validateReviewedFingerprint(parsed);
}

export function writeReviewedFingerprint(file: string, fingerprint: ReviewedFingerprint) {
  validateReviewedFingerprint(fingerprint);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(fingerprint, null, 2)}\n`);
}
