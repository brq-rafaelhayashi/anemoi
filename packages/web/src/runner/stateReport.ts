export type ReportStatus = 'failed' | 'unavailable' | 'passed';

type UnknownRecord = Record<string, any>;

export type StateReportManifest = {
  axes?: {frameworks?: string[]};
  gate?: {dimensions?: Record<string, {status?: string}>};
  groups?: UnknownRecord[];
  behavior?: {results?: UnknownRecord[]};
  attempts?: UnknownRecord[];
};

export type StateReportGroup = {
  id: string;
  name: string;
  status: ReportStatus;
  open: boolean;
  orphaned: boolean;
  groups: UnknownRecord[];
  behavior: UnknownRecord[];
  attempts: UnknownRecord[];
  axes: {browsers: string[]; themes: string[]; viewports: string[]};
  issues: {
    parityFailed: number;
    parityUnavailable: number;
    axeFailed: number;
    axeUnavailable: number;
    behaviorFailed: number;
    behaviorUnavailable: number;
    stabilityFailed: number;
    stabilityUnavailable: number;
  };
};

const STATUS_WEIGHT: Record<ReportStatus, number> = {passed: 0, unavailable: 1, failed: 2};
const FRAMEWORKS = ['wc', 'react', 'angular'];

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
}

function text(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function stateIdentity(group: UnknownRecord) {
  const cell = group._cell && typeof group._cell === 'object' ? group._cell : {};
  const id = text(group.storyId) || text(cell.storyId);
  const name = text(group.story) || text(cell.story) || id;
  return id && name ? {id, name} : null;
}

function logicalTestIdFromGroup(group: UnknownRecord) {
  for (const framework of FRAMEWORKS) {
    const source = text(group[framework]);
    const match = source?.match(/^results\/([^/]+)\/attempt-\d+\//);
    if (match) return match[1];
  }
  return null;
}

function visualStatus(group: UnknownRecord, frameworks: string[], axeExpected: boolean): ReportStatus {
  const parity = records(group.parity);
  const audits = group.a11y?.audits && typeof group.a11y.audits === 'object'
    ? group.a11y.audits
    : {};
  const aria = records(group.a11y?.ariaParity);
  if (parity.some(item => item.mismatch > 0 || item.sizeMatch === false)
    || Object.values(audits).some((audit: any) => records(audit?.violations).length > 0)
    || aria.some(item => item.match === false)) return 'failed';
  if (frameworks.some(framework => !text(group[framework]))
    || Object.values(audits).some((audit: any) => text(audit?.error))
    || (axeExpected && frameworks.some(framework => !(framework in audits)))) return 'unavailable';
  return 'passed';
}

function behaviorStatus(result: UnknownRecord): ReportStatus {
  const routes = records(result.routes);
  if (routes.some(route => route.parity === 'failed'
    || Object.values(route.frameworks || {}).some((value: any) => value?.conformance === 'failed'))) {
    return 'failed';
  }
  if (routes.some(route => ['not-comparable', 'not-run'].includes(route.parity)
    || Object.values(route.frameworks || {}).some((value: any) => value?.execution === 'error'
      || !value?.conformance))) return 'unavailable';
  return 'passed';
}

function attemptStatus(result: UnknownRecord): ReportStatus {
  const attempts = records(result.attempts);
  if (result.stability === 'flaky' || attempts.some(item => item.status === 'failed')) return 'failed';
  if (attempts.some(item => item.status === 'error')) return 'unavailable';
  return 'passed';
}

function worst(statuses: ReportStatus[]): ReportStatus {
  return statuses.reduce((current, status) =>
    STATUS_WEIGHT[status] > STATUS_WEIGHT[current] ? status : current, 'passed');
}

function unique(items: unknown[]) {
  return [...new Set(items.filter((item): item is string => typeof item === 'string' && item.length > 0))];
}

function countIssues(
  groups: UnknownRecord[],
  behavior: UnknownRecord[],
  attempts: UnknownRecord[],
  frameworks: string[],
  axeExpected: boolean,
) {
  const parity = groups.flatMap(group => records(group.parity));
  const audits = groups.flatMap(group => Object.values(group.a11y?.audits || {})) as UnknownRecord[];
  const routes = behavior.flatMap(result => records(result.routes));
  const attemptItems = attempts.flatMap(result => records(result.attempts));
  return {
    parityFailed: parity.filter(item => item.mismatch > 0 || item.sizeMatch === false).length,
    parityUnavailable: groups.reduce((total, group) => total
      + frameworks.filter(framework => !text(group[framework])).length
      + Math.max(0, 2 - records(group.parity).length), 0),
    axeFailed: audits.filter(item => records(item.violations).length > 0).length,
    axeUnavailable: audits.filter(item => text(item.error)).length
      + (axeExpected ? groups.reduce((total, group) => {
        const observed = group.a11y?.audits && typeof group.a11y.audits === 'object'
          ? Object.keys(group.a11y.audits)
          : [];
        return total + frameworks.filter(framework => !observed.includes(framework)).length;
      }, 0) : 0),
    behaviorFailed: routes.filter(route => behaviorStatus({routes: [route]}) === 'failed').length,
    behaviorUnavailable: routes.filter(route => behaviorStatus({routes: [route]}) === 'unavailable').length,
    stabilityFailed: attemptItems.filter(item => item.status === 'failed').length
      + attempts.filter(item => item.stability === 'flaky').length,
    stabilityUnavailable: attemptItems.filter(item => item.status === 'error').length,
  };
}

function finalize(
  group: Omit<StateReportGroup, 'status' | 'open' | 'axes' | 'issues'>,
  frameworks: string[],
  axeExpected: boolean,
) {
  group.groups.sort((left, right) => STATUS_WEIGHT[visualStatus(right, frameworks, axeExpected)]
    - STATUS_WEIGHT[visualStatus(left, frameworks, axeExpected)]);
  const status = group.orphaned ? 'unavailable' : worst([
    ...group.groups.map(item => visualStatus(item, frameworks, axeExpected)),
    ...group.behavior.map(behaviorStatus),
    ...group.attempts.map(attemptStatus),
  ]);
  return {
    ...group,
    status,
    open: status !== 'passed',
    axes: {
      browsers: unique(group.groups.map(item => item.browser)),
      themes: unique(group.groups.map(item => item.theme)),
      viewports: unique(group.groups.map(item => item.viewport)),
    },
    issues: countIssues(group.groups, group.behavior, group.attempts, frameworks, axeExpected),
  } satisfies StateReportGroup;
}

export function projectStateReport(manifest: StateReportManifest): StateReportGroup[] {
  const frameworks = manifest.axes?.frameworks || FRAMEWORKS;
  const axeExpected = Boolean(manifest.gate?.dimensions?.axe);
  const states = new Map<string, Omit<StateReportGroup, 'status' | 'open' | 'axes' | 'issues'>>();
  const logicalToState = new Map<string, string>();
  const orphan: Omit<StateReportGroup, 'status' | 'open' | 'axes' | 'issues'> = {
    id: '__orphan__',
    name: 'Evidências sem estado',
    orphaned: true,
    groups: [],
    behavior: [],
    attempts: [],
  };
  for (const group of records(manifest.groups)) {
    const identity = stateIdentity(group);
    if (!identity) {
      orphan.groups.push(group);
      continue;
    }
    if (!states.has(identity.id)) states.set(identity.id, {...identity, orphaned: false, groups: [], behavior: [], attempts: []});
    states.get(identity.id)!.groups.push(group);
    const logicalTestId = logicalTestIdFromGroup(group);
    if (logicalTestId) logicalToState.set(logicalTestId, identity.id);
  }
  for (const result of records(manifest.behavior?.results)) {
    const state = logicalToState.get(result.logicalTestId);
    (state ? states.get(state)!.behavior : orphan.behavior).push(result);
  }
  for (const result of records(manifest.attempts)) {
    const state = logicalToState.get(result.logicalTestId);
    (state ? states.get(state)!.attempts : orphan.attempts).push(result);
  }
  const projected = [...states.values()].map(item => finalize(item, frameworks, axeExpected));
  if (orphan.groups.length || orphan.behavior.length || orphan.attempts.length) {
    projected.push(finalize(orphan, frameworks, axeExpected));
  }
  return projected.sort((left, right) => STATUS_WEIGHT[right.status] - STATUS_WEIGHT[left.status]);
}
