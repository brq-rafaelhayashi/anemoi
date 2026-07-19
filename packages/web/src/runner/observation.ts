import {isDeepStrictEqual} from 'node:util';
import type {BehaviorObservation} from './types.ts';

function assertSerializable(
  value: unknown,
  path = 'observation',
  seen = new Set<object>(),
): void {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object') {
    throw new Error(`${path} nao e serializavel.`);
  }
  if (seen.has(value as object)) {
    throw new Error(`${path} possui referencia circular.`);
  }

  seen.add(value as object);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertSerializable(item, `${path}[${index}]`, seen);
    });
  } else {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      assertSerializable(item, `${path}.${key}`, seen);
    });
  }
  seen.delete(value as object);
}

export function assertObservation(value: BehaviorObservation): BehaviorObservation {
  if (
    !value
    || !('focus' in value)
    || !Array.isArray(value.events)
    || !value.visibility
    || !('state' in value)
  ) {
    throw new Error(
      'Observacao Comportamental invalida: focus, events, visibility e state sao obrigatorios.',
    );
  }

  assertSerializable(value);
  return JSON.parse(JSON.stringify(value)) as BehaviorObservation;
}

interface ObservationDifference {
  path: string;
  reference: unknown;
  against: unknown;
}

function diff(
  reference: unknown,
  against: unknown,
  path = '',
): ObservationDifference[] {
  if (isDeepStrictEqual(reference, against)) return [];
  if (
    reference
    && against
    && typeof reference === 'object'
    && typeof against === 'object'
    && !Array.isArray(reference)
    && !Array.isArray(against)
  ) {
    const referenceRecord = reference as Record<string, unknown>;
    const againstRecord = against as Record<string, unknown>;
    const keys = [
      ...new Set([
        ...Object.keys(referenceRecord),
        ...Object.keys(againstRecord),
      ]),
    ].sort();
    return keys.flatMap(key => diff(
      referenceRecord[key],
      againstRecord[key],
      path ? `${path}.${key}` : key,
    ));
  }
  return [{path, reference, against}];
}

export function compareObservations(
  reference: BehaviorObservation,
  against: BehaviorObservation,
) {
  const differences = diff(reference, against);
  return differences.length === 0
    ? {match: true as const}
    : {match: false as const, diff: differences};
}
