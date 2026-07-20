const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/axeDiagnostics.ts')).href);
}

function group(overrides = {}) {
  return {
    browser: 'chromium',
    brand: 'gol',
    storyId: 'primary',
    storyName: 'Primary',
    viewport: 'sm',
    theme: 'light',
    label: 'chromium · gol · Primary · sm · light',
    parity: [],
    a11y: {audits: {}, ariaParity: []},
    ...overrides,
  };
}

function violation(nodes, overrides = {}) {
  return {
    id: 'color-contrast',
    impact: 'serious',
    nodes,
    ...overrides,
  };
}

function node(target, failureSummary) {
  return {target, failureSummary, html: '<span>Salvar</span>'};
}

test('agrega auditorias, ocorrencias de regra e nos sem misturar as contagens', async () => {
  const {aggregateAxeDiagnostics} = await subject();
  const groups = [
    group({
      a11y: {
        audits: {
          wc: {
            violations: [violation([
              node(' tgr-button,   .label ', 'Fix any of the following:\n  contrast of 2.7:1'),
            ])],
            artifactPath: 'results/primary--chromium/attempt-0/evidence/wc.a11y.json',
          },
          react: {violations: []},
          angular: {violations: []},
        },
        ariaParity: [],
      },
    }),
    group({
      browser: 'firefox',
      theme: 'dark',
      a11y: {
        audits: {
          wc: {
            violations: [violation([
              node('tgr-button, .label', 'Fix any of the following: contrast of 2.7:1'),
              node('tgr-button .icon', 'Element has insufficient contrast'),
            ])],
            artifactPath: 'results/primary--firefox/attempt-0/evidence/wc.a11y.json',
          },
          react: {violations: []},
          angular: {violations: []},
        },
        ariaParity: [],
      },
    }),
  ];

  const result = aggregateAxeDiagnostics(groups);

  assert.deepEqual(
    {
      totalAudits: result.totalAudits,
      failedAudits: result.failedAudits,
      passedAudits: result.passedAudits,
      unavailableAudits: result.unavailableAudits,
      uniqueRules: result.uniqueRules,
      ruleOccurrences: result.ruleOccurrences,
      affectedNodes: result.affectedNodes,
    },
    {
      totalAudits: 6,
      failedAudits: 2,
      passedAudits: 4,
      unavailableAudits: 0,
      uniqueRules: 1,
      ruleOccurrences: 2,
      affectedNodes: 3,
    },
  );
  assert.equal(result.rules[0].id, 'color-contrast');
  assert.equal(result.rules[0].occurrences, 2);
  assert.equal(result.rules[0].affectedNodes, 3);
  assert.equal(result.rules[0].evidence.length, 2);
  assert.equal(result.rules[0].evidence[0].target, 'tgr-button .icon');
  assert.equal(result.rules[0].evidence[1].target, 'tgr-button, .label');
  assert.equal(result.rules[0].evidence[1].failureSummary, 'Fix any of the following: contrast of 2.7:1');
  assert.equal(result.rules[0].evidence[1].affectedNodes, 2);
  assert.deepEqual(
    result.rules[0].evidence[1].axes.map(value => `${value.browser}/${value.framework}/${value.theme}`),
    ['chromium/wc/light', 'firefox/wc/dark'],
  );
});

test('processa shapes desconhecidos sem lancar e ordena regras e evidencias', async () => {
  const {aggregateAxeDiagnostics} = await subject();
  const groups = [
    null,
    {a11y: {audits: []}},
    group({
      a11y: {
        audits: {
          zeta: {error: 'axe timeout'},
          react: {violations: 'invalid'},
          wc: {
            violations: [
              violation([node('#z', 'summary z')], {id: 'z-rule', impact: 'minor'}),
              null,
              violation([node('#a', 'summary a')], {id: 'a-rule', impact: 'critical'}),
            ],
            needsReview: [{id: 'manual-review'}, null],
          },
          angular: null,
        },
        ariaParity: 'invalid',
      },
    }),
  ];

  const first = aggregateAxeDiagnostics(groups);
  const second = aggregateAxeDiagnostics(structuredClone(groups));

  assert.deepEqual(first, second);
  assert.equal(first.totalAudits, 4);
  assert.equal(first.failedAudits, 1);
  assert.equal(first.passedAudits, 0);
  assert.equal(first.unavailableAudits, 3);
  assert.equal(first.needsReview, 1);
  assert.deepEqual(first.rules.map(rule => rule.id), ['a-rule', 'z-rule']);
});

test('formatter lista somente as causas presentes e detalha Axe', async () => {
  const {formatAttemptFailure} = await subject();
  const result = {
    logicalTestId: 'primary--chromium',
    attempt: 0,
    captures: [],
    proofs: {
      groups: [group({
        a11y: {
          audits: {
            wc: {
              violations: [violation([
                node('tgr-button, .label', 'Fix any of the following: contrast of 2.7:1; expected 4.5:1'),
              ])],
              artifactPath: 'results/primary--chromium/attempt-0/evidence/wc.a11y.json',
            },
          },
          ariaParity: [],
        },
      })],
    },
    routes: [],
    diagnostics: {console: [], pageErrors: [], attachments: []},
  };

  const formatted = formatAttemptFailure(result);

  assert.match(formatted, /Axe/);
  assert.match(formatted, /color-contrast/);
  assert.match(formatted, /impacto: serious/);
  assert.match(formatted, /1 auditoria afetada, 1 ocorrencia, 1 no afetado/);
  assert.match(formatted, /chromium.*wc.*gol.*Primary.*sm.*light/);
  assert.match(formatted, /tgr-button, \.label/);
  assert.match(formatted, /contrast of 2\.7:1; expected 4\.5:1/);
  assert.match(formatted, /results\/primary--chromium\/attempt-0\/evidence\/wc\.a11y\.json/);
  assert.doesNotMatch(formatted, /Captura/);
  assert.doesNotMatch(formatted, /Visual\/dimensoes/);
  assert.doesNotMatch(formatted, /ARIA/);
  assert.doesNotMatch(formatted, /Comportamento/);
});

test('formatter preserva contagens quando impacto Axe esta ausente', async () => {
  const {formatAttemptFailure} = await subject();
  const formatted = formatAttemptFailure({
    logicalTestId: 'primary--chromium',
    attempt: 0,
    captures: [],
    proofs: {groups: [group({
      a11y: {
        audits: {wc: {violations: [{id: 'unknown-impact', nodes: [node('button', 'sem nome')]}]}},
        ariaParity: [],
      },
    })]},
    routes: [],
  });

  assert.match(formatted, /unknown-impact: 1 auditoria afetada, 1 ocorrencia, 1 no afetado/);
});

test('formatter inclui captura, visual, dimensoes, ARIA e comportamento quando falham', async () => {
  const {formatAttemptFailure} = await subject();
  const result = {
    logicalTestId: 'primary--chromium',
    attempt: 1,
    captures: [{framework: 'react', error: 'mount failed'}],
    proofs: {
      groups: [group({
        parity: [{
          against: 'react',
          mismatch: 42,
          sizeMatch: false,
          referenceSize: {width: 360, height: 40},
          againstSize: {width: 320, height: 40},
          diffPath: 'results/primary--chromium/attempt-1/evidence/diff.png',
        }],
        a11y: {
          audits: {wc: {violations: []}},
          ariaParity: [{against: 'angular', match: false, diffPath: 'results/primary--chromium/attempt-1/evidence/aria.txt'}],
        },
      })],
    },
    routes: [{
      routeId: 'activation',
      parity: 'failed',
      frameworks: {
        wc: {execution: 'passed', conformance: 'passed'},
        react: {execution: 'passed', conformance: 'failed', error: 'evento ausente'},
      },
    }],
    diagnostics: {console: [], pageErrors: [], attachments: []},
  };

  const formatted = formatAttemptFailure(result);

  assert.match(formatted, /Captura.*react.*mount failed/s);
  assert.match(formatted, /Visual\/dimensoes.*mismatch: 42.*360x40.*320x40/s);
  assert.match(formatted, /ARIA.*angular.*aria\.txt/s);
  assert.match(formatted, /Comportamento.*activation.*react.*evento ausente/s);
  assert.doesNotMatch(formatted, /^Axe$/m);
});
