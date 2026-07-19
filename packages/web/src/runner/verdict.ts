export interface DimensionVerdict {
  status: 'passed' | 'failed' | 'unavailable';
  required: boolean;
  failed: number;
  unavailable: number;
}

export function buildConfidenceGate({
  diagnostic,
  dimensions,
}: {
  diagnostic: boolean;
  dimensions: Record<string, DimensionVerdict>;
}) {
  const blocked = Object.values(dimensions)
    .some(value => value.required && value.status !== 'passed');
  return {
    status: diagnostic ? 'not-approved' : blocked ? 'failed' : 'passed',
    trusted: !diagnostic && !blocked,
    dimensions,
  } as const;
}
