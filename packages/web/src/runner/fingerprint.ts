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

export function createFingerprint(surface: PublicSurface): ReviewedFingerprint {
  const digest = createHash('sha256').update(canonical(surface)).digest('hex');
  return {schemaVersion: 1, component: surface.component, digest, surface};
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
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ReviewedFingerprint;
}

export function writeReviewedFingerprint(file: string, fingerprint: ReviewedFingerprint) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(fingerprint, null, 2)}\n`);
}
