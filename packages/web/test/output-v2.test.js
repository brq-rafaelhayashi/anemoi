const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/outputV2.ts')).href);
}

function stateSection(html, stateId) {
  const sections = html.split('<section class="state-shell">');
  return sections.find(section => section.includes(`data-state="${stateId}"`)) || '';
}

const manifest = {
  schemaVersion: 2,
  tool: 'Anemoi Web',
  status: 'failed',
  card: 'CDCOM-1',
  component: 'tgr-button',
  generatedAt: '2026-07-18T12:00:00.000Z',
  cellCount: 9,
  axes: {
    browsers: ['chromium', 'firefox', 'webkit'],
    frameworks: ['wc', 'react', 'angular'],
  },
  gate: {
    status: 'failed',
    trusted: false,
    dimensions: {
      visualParity: {status: 'passed', required: true, failed: 0, unavailable: 0},
      behavioralParity: {status: 'failed', required: true, failed: 1, unavailable: 0},
    },
  },
  groups: [{
    browser: 'firefox',
    brand: 'gol',
    storyId: 'primary',
    story: 'Primary',
    viewport: 'sm',
    theme: 'light',
    label: 'firefox · gol · Primary · sm · light',
    wc: 'results/primary--firefox/attempt-1/evidence/firefox/wc/a.png',
    react: 'results/primary--firefox/attempt-1/evidence/firefox/react/a.png',
    angular: 'results/primary--firefox/attempt-1/evidence/firefox/angular/a.png',
    parity: [
      {against: 'react', mismatch: 0, sizeMatch: true},
      {against: 'angular', mismatch: 0, sizeMatch: true},
    ],
    a11y: {
      audits: {
        wc: {
          violations: [{
            id: 'button-name',
            impact: 'critical',
            wcag: ['wcag2a', 'wcag412'],
            description: 'Botoes devem ter nome discernivel',
            helpUrl: 'https://deque.example/rule/button-name',
            nodes: [{
              target: 'tgr-button button',
              html: '<button aria-label="">Salvar</button>',
              failureSummary: 'Corrija o nome acessivel',
            }],
          }],
          needsReview: [{
            id: 'color-contrast',
            impact: 'serious',
            wcag: ['wcag2aa'],
            description: 'Contraste requer revisao',
            helpUrl: 'https://deque.example/rule/color-contrast',
            nodes: [{
              target: '.gradient',
              html: '<span class="gradient">Texto</span>',
              failureSummary: 'Fundo complexo requer revisao manual',
            }],
          }],
          artifactPath: 'results/primary--firefox/attempt-0/evidence/wc.a11y.json',
        },
        react: {error: 'axe timeout'},
        angular: {violations: []},
      },
      ariaParity: [],
    },
  }],
  a11y: {
    totalViolations: 1,
    worstImpact: 'critical',
    ariaMismatches: 0,
    collectionErrors: 1,
    needsReview: 1,
    ruleset: ['wcag2a', 'wcag2aa'],
  },
  behavior: {
    results: [{
      logicalTestId: 'primary--firefox',
      stability: 'stable',
      routes: [{
        routeId: 'activation',
        parity: 'failed',
        frameworks: {
          wc: {conformance: 'passed'},
          react: {conformance: 'passed'},
          angular: {conformance: 'passed'},
        },
      }],
    }],
  },
  attempts: [{
    logicalTestId: 'primary--firefox',
    stability: 'flaky',
    attempts: [
      {
        attempt: 0,
        status: 'failed',
        resultPath: 'results/primary--firefox/attempt-0/result.json',
        attachments: ['results/primary--firefox/attempt-0/attachments/failure.png'],
      },
      {
        attempt: 1,
        status: 'passed',
        resultPath: 'results/primary--firefox/attempt-1/result.json',
        attachments: ['results/primary--firefox/attempt-1/attachments/trace.zip'],
      },
    ],
  }],
};

test('galeria agrupa visual comportamento Axe e tentativas pelo estado', async () => {
  const {renderHtmlV2} = await subject();
  const html = renderHtmlV2(manifest);

  assert.match(html, /<details class="state-group failed" data-state="primary" data-status="failed" open>/);
  assert.match(html, /<summary[^>]*>.*Primary.*1 combina[cç][aã]o.*falh/is);
  assert.match(html, /data-state="primary"[\s\S]*Diagnostico Axe do estado[\s\S]*Evidencia visual[\s\S]*Comportamento[\s\S]*Tentativas e diagnosticos/);
});

test('galeria fecha estados aprovados e abre falhos ou indisponiveis', async () => {
  const {renderHtmlV2} = await subject();
  const passed = structuredClone(manifest.groups[0]);
  passed.storyId = 'secondary';
  passed.story = 'Secondary';
  passed.label = 'firefox · gol · Secondary · sm · light';
  passed.a11y.audits.wc.violations = [];
  passed.a11y.audits.react = {violations: []};
  passed.wc = passed.wc.replace('primary--firefox', 'secondary--firefox');
  passed.react = passed.react.replace('primary--firefox', 'secondary--firefox');
  passed.angular = passed.angular.replace('primary--firefox', 'secondary--firefox');
  const grouped = structuredClone(manifest);
  grouped.groups.push(passed);
  grouped.behavior.results.push({logicalTestId: 'secondary--firefox', stability: 'stable', routes: []});
  grouped.attempts.push({logicalTestId: 'secondary--firefox', stability: 'stable', attempts: [{
    attempt: 0,
    status: 'passed',
    resultPath: 'results/secondary--firefox/attempt-0/result.json',
  }]});

  const html = renderHtmlV2(grouped);
  assert.match(html, /class="state-group failed"[^>]*open/);
  assert.match(html, /class="state-group passed" data-state="secondary" data-status="passed">/);
});

test('galeria mostra evidencias orfas em grupo indisponivel aberto', async () => {
  const {renderHtmlV2} = await subject();
  const orphaned = structuredClone(manifest);
  orphaned.attempts.push({logicalTestId: 'orphan--webkit', stability: 'stable', attempts: [{
    attempt: 0,
    status: 'error',
    resultPath: 'results/orphan--webkit/attempt-0/result.json',
  }]});
  const html = renderHtmlV2(orphaned);

  assert.match(html, /data-state="__orphan__" data-status="unavailable" open/);
  assert.match(html, /Evidências sem estado/);
  assert.match(html, /orphan--webkit/);
});

test('summary v2 lista browsers e dimensoes independentes', async () => {
  const {renderSummaryV2} = await subject();
  const summary = renderSummaryV2(manifest);
  assert.match(summary, /Chromium, Firefox, WebKit/);
  assert.match(summary, /behavioralParity: failed/);
  assert.match(summary, /Gate confiável: não/);
});

test('summary v2 inclui contagens e evidencia representativa do diagnostico Axe', async () => {
  const {renderSummaryV2} = await subject();
  const summary = renderSummaryV2(manifest);
  assert.match(summary, /## Diagnostico Axe/);
  assert.match(summary, /3 auditorias.*1 falhou.*1 passou.*1 indisponivel/s);
  assert.match(summary, /button-name.*critical.*1 auditoria afetada.*1 ocorrencia.*1 no afetado/s);
  assert.match(summary, /tgr-button button/);
  assert.match(summary, /Corrija o nome acessivel/);
  assert.match(summary, /needsReview: 1/);
  assert.match(summary, /erros de coleta: 1/);
});

test('summary v2 escolhe evidencia Axe com mais nos, nao a primeira lexical', async () => {
  const {renderSummaryV2} = await subject();
  const dominant = {
    target: 'tgr-button, .label',
    html: '<span class="label">Salvar</span>',
    failureSummary: 'razao dominante com 3 nos',
  };
  const withDominantEvidence = structuredClone(manifest);
  withDominantEvidence.groups[0].a11y.audits.wc.violations[0].nodes = [
    {
      target: 'span',
      html: '<span>decorativo</span>',
      failureSummary: 'razao lexical com 1 no',
    },
    dominant,
    structuredClone(dominant),
    structuredClone(dominant),
  ];

  const summary = renderSummaryV2(withDominantEvidence);

  assert.match(summary, /alvo: tgr-button, \.label/);
  assert.match(summary, /failureSummary: razao dominante com 3 nos/);
  assert.doesNotMatch(summary, /alvo: span/);
  assert.doesNotMatch(summary, /razao lexical com 1 no/);
});

test('summary v2 neutraliza HTML e quebras de linha em campos dinamicos', async () => {
  const {renderSummaryV2} = await subject();
  const unsafe = structuredClone(manifest);
  unsafe.component = '<img src=x onerror=alert(1)>\n- injetado: sim';
  unsafe.card = '[externo](https://example.test)';
  unsafe.groups[0].a11y.audits.wc.violations[0].id = '<script>alert(2)</script>\n- regra injetada';
  unsafe.groups[0].a11y.audits.wc.violations[0].nodes[0].target = '[alvo](https://example.test)';
  const summary = renderSummaryV2(unsafe);
  assert.doesNotMatch(summary, /<img src=x onerror/);
  assert.doesNotMatch(summary, /<script>alert\(2\)<\/script>/);
  assert.doesNotMatch(summary, /\n- injetado: sim/);
  assert.doesNotMatch(summary, /\n- regra injetada/);
  assert.doesNotMatch(summary, /\[externo\]\(https:\/\/example\.test\)/);
  assert.doesNotMatch(summary, /\[alvo\]\(https:\/\/example\.test\)/);
});

test('galeria v2 e autocontida e mostra browser, comportamento e estabilidade', async () => {
  const {renderHtmlV2} = await subject();
  const html = renderHtmlV2(manifest);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /firefox/);
  assert.match(html, /activation/);
  assert.match(html, /stable/);
  assert.match(html, /trace\.zip/);
  assert.match(html, /attempt-1\/result\.json/);
  assert.doesNotMatch(html, /https?:\/\/(?!127\.0\.0\.1)/);
});

test('galeria v2 detalha Axe por regra e evidencia sem link externo', async () => {
  const {renderHtmlV2} = await subject();
  const html = renderHtmlV2(manifest);
  const primary = stateSection(html, 'primary');
  assert.match(html, /<h2>Diagnostico Axe<\/h2>/);
  assert.match(primary, /<details[^>]*>.*button-name.*<details[^>]*>.*tgr-button button/s);
  assert.match(primary, /critical/);
  assert.match(primary, /wcag2a/);
  assert.match(primary, /<dt>browser<\/dt><dd>firefox \(1\)<\/dd>.*<dt>framework<\/dt><dd>wc \(1\)<\/dd>.*<dt>brand<\/dt><dd>gol \(1\)<\/dd>.*<dt>story<\/dt><dd>Primary \(1\)<\/dd>/s);
  assert.match(primary, /&lt;button aria-label=&quot;&quot;&gt;Salvar&lt;\/button&gt;/);
  assert.match(primary, /Corrija o nome acessivel/);
  assert.match(primary, /needsReview/);
  assert.match(primary, /color-contrast/);
  assert.match(primary, /Fundo complexo requer revisao manual/);
  assert.match(primary, /Erros de coleta/);
  assert.match(primary, /axe timeout/);
  assert.match(primary, /href="results\/primary--firefox\/attempt-0\/evidence\/wc\.a11y\.json"/);
  assert.doesNotMatch(html, /deque\.example/);
});

test('galeria v2 compacta eixos e nao duplica links Axe entre regra e evidencia', async () => {
  const {renderHtmlV2} = await subject();
  const repeated = structuredClone(manifest);
  repeated.groups[0].a11y.audits = {wc: repeated.groups[0].a11y.audits.wc};
  repeated.groups[0].a11y.audits.wc.needsReview = [];
  const second = structuredClone(repeated.groups[0]);
  second.browser = 'chromium';
  second.label = 'chromium · gol · Primary · sm · light';
  second.a11y.audits.wc.artifactPath = 'results/primary--chromium/attempt-0/evidence/wc.a11y.json';
  repeated.groups.push(second);

  const html = renderHtmlV2(repeated);
  const primary = stateSection(html, 'primary');
  const firefoxArtifact = 'href="results/primary--firefox/attempt-0/evidence/wc.a11y.json"';
  const chromiumArtifact = 'href="results/primary--chromium/attempt-0/evidence/wc.a11y.json"';

  assert.equal((primary.match(/<dt>browser<\/dt>/g) || []).length, 1);
  assert.match(primary, /chromium \(1\), firefox \(1\)/);
  assert.equal(primary.split(firefoxArtifact).length - 1, 1);
  assert.equal(primary.split(chromiumArtifact).length - 1, 1);
  assert.match(primary, /<details class="axe-artifacts">/);
  assert.doesNotMatch(primary, /<li>browser=/);
});

test('galeria v2 cria no maximo um href global por artefato compartilhado entre violation e needsReview', async () => {
  const {renderHtmlV2} = await subject();
  const html = renderHtmlV2(manifest);
  const primary = stateSection(html, 'primary');
  const artifact = 'results/primary--firefox/attempt-0/evidence/wc.a11y.json';
  const href = `href="${artifact}"`;

  assert.equal(primary.split(href).length - 1, 1);
  assert.ok(primary.split(artifact).length - 1 >= 2, 'associacoes subsequentes devem preservar o path como texto');
  assert.match(primary, /color-contrast/);
  assert.match(primary, /já listado/);
});

test('galeria v2 explica needsReview inconclusivo quando detalhes estao indisponiveis', async () => {
  const {renderHtmlV2} = await subject();
  const partial = structuredClone(manifest);
  partial.groups[0].a11y.audits = {
    wc: {
      violations: [],
      needsReview: [{id: 'manual-review'}],
      artifactPath: 'results/primary--firefox/attempt-0/evidence/wc.a11y.json',
    },
  };
  const html = renderHtmlV2(partial);
  const primary = stateSection(html, 'primary');

  assert.match(primary, /needsReview.*inconclusivo.*não altera o gate/is);
  assert.match(primary, /1 item.*detalhes.*metadados.*indisponíveis/is);
  assert.doesNotMatch(primary, /Nenhum item requer revisão/);
});

test('outputs explicam gate Axe indisponivel sem auditorias nos groups', async () => {
  const {renderHtmlV2, renderSummaryV2} = await subject();
  const unavailable = structuredClone(manifest);
  unavailable.groups = [];
  unavailable.gate.dimensions.axe = {
    status: 'unavailable',
    required: true,
    failed: 0,
    unavailable: 3,
  };

  const summary = renderSummaryV2(unavailable);
  const html = renderHtmlV2(unavailable);

  for (const output of [summary, html]) {
    assert.match(output, /Diagnostico Axe/);
    assert.match(output, /0 auditorias.*0 falh.*0 pass.*0 indisponive/s);
    assert.match(output, /3 indisponibilidades estruturais.*sem auditorias correspondentes/i);
  }
  assert.doesNotMatch(html, /Sem violacoes Axe/);
});

test('galeria v2 informa saldo needsReview sem metadados em cenario misto', async () => {
  const {renderHtmlV2} = await subject();
  const mixed = structuredClone(manifest);
  mixed.groups[0].a11y.audits.wc.needsReview.push({id: 'manual-review-sem-nodes'});
  const html = renderHtmlV2(mixed);
  const primary = stateSection(html, 'primary');

  assert.match(primary, /color-contrast/);
  assert.match(primary, /Há 1 item em needsReview com detalhes e metadados indisponíveis/);
  assert.doesNotMatch(primary, /Há 2 itens em needsReview com detalhes e metadados indisponíveis/);
});

test('galeria v2 escapa diagnostico Axe e aceita somente artefato local a11y', async () => {
  const {renderHtmlV2} = await subject();
  const unsafe = structuredClone(manifest);
  const audits = unsafe.groups[0].a11y.audits;
  audits.wc.violations[0].id = '<img src=x onerror=alert(1)>';
  audits.wc.violations[0].description = '<script>alert(2)</script>';
  audits.wc.violations[0].wcag = ['<svg onload=alert(3)>'];
  audits.wc.violations[0].nodes[0] = {
    target: '<a href="javascript:alert(4)">alvo</a>',
    html: '<img src=x onerror=alert(5)>',
    failureSummary: '<script>alert(6)</script>',
  };
  audits.react.error = '<img src=x onerror=alert(7)>';
  const violation = structuredClone(audits.wc.violations);
  audits.traversal = {violations: structuredClone(violation), artifactPath: '../outside.a11y.json'};
  audits.absolute = {violations: structuredClone(violation), artifactPath: '/results/absolute.a11y.json'};
  audits.scheme = {violations: structuredClone(violation), artifactPath: 'javascript:alert(8).a11y.json'};
  audits.encoded = {violations: structuredClone(violation), artifactPath: 'results/%2e%2e/outside.a11y.json'};
  audits.backslash = {violations: structuredClone(violation), artifactPath: 'results\\outside.a11y.json'};
  audits.wrongExtension = {violations: structuredClone(violation), artifactPath: 'results/outside.json'};
  const html = renderHtmlV2(unsafe);

  assert.doesNotMatch(html, /<(?:script|img|svg|a)\b[^>]*(?:alert|javascript:)/i);
  assert.doesNotMatch(html, /href="(?:\.\.\/|\/|javascript:|[^"]*%2e%2e|[^"]*\\)/i);
  assert.doesNotMatch(html, /href="results\/outside\.json"/);
  assert.match(html, /href="results\/primary--firefox\/attempt-0\/evidence\/wc\.a11y\.json"/);
});

test('manifesto sem A11y continua renderizando summary e galeria', async () => {
  const {renderHtmlV2, renderSummaryV2} = await subject();
  const legacy = structuredClone(manifest);
  delete legacy.a11y;
  delete legacy.groups[0].a11y;
  assert.doesNotThrow(() => renderSummaryV2(legacy));
  assert.doesNotThrow(() => renderHtmlV2(legacy));
  assert.doesNotMatch(renderHtmlV2(legacy), /Diagnostico Axe/);
});

test('fixture usa diagnostico causal como custom message sem alterar a assercao', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/runner/fixtures.ts'), 'utf8');
  assert.match(source, /import \{formatAttemptFailure\} from ['"]\.\/axeDiagnostics\.ts['"]/);
  assert.match(source, /expect\(result\.status,\s*formatAttemptFailure\(result\)\)\.toBe\(['"]passed['"]\)/);
});

test('galeria oferece controles globais e filtro por browser sobre grupos locais', async () => {
  const {renderHtmlV2} = await subject();
  const html = renderHtmlV2(manifest);

  assert.match(html, /data-action="open-failed"[^>]*>Abrir estados com falha/);
  assert.match(html, /data-action="close-all"[^>]*>Fechar todos/);
  assert.match(html, /data-browser-filter="firefox"/);
  assert.match(html, /querySelectorAll\('\.state-group'\)/);
  assert.match(html, /querySelectorAll\('\.browser-evidence'\)/);
});

test('galeria usa details nativo e contem tabelas em wrappers responsivos', async () => {
  const {renderHtmlV2} = await subject();
  const html = renderHtmlV2(manifest);

  assert.match(html, /<details class="state-group/);
  assert.match(html, /<summary>/);
  assert.match(html, /class="table-scroll"/);
  assert.match(html, /\.table-scroll\{overflow-x:auto/);
  assert.doesNotMatch(html, /role="button"|tabindex="0"/);
});

test('galeria v2 escapa HTML e recusa caminhos externos ou fora da tentativa', async () => {
  const {renderHtmlV2} = await subject();
  const unsafe = structuredClone(manifest);
  unsafe.component = '<img src=x onerror=alert(1)>';
  unsafe.groups[0].label = '<script>alert(1)</script>';
  unsafe.groups[0].wc = 'javascript:alert(1)';
  unsafe.groups[0].react = '../outside.png';
  unsafe.attempts[0].attempts[0].resultPath = 'javascript:alert(1)';
  unsafe.attempts[0].attempts[0].attachments = [
    '../outside.zip',
    'results/primary--firefox/attempt-1/attachments/cross-attempt.zip',
  ];
  unsafe.attempts[0].attempts.push({
    attempt: 2,
    status: 'passed',
    resultPath: 'results/primary--firefox/attempt-9/result.json',
    attachments: ['results/primary--firefox/attempt-9/attachments/wrong-attempt.zip'],
  });
  const html = renderHtmlV2(unsafe);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.doesNotMatch(html, /(?:href|src)="(?:javascript:|\.\.\/)/);
  assert.doesNotMatch(html, /href="[^"]*cross-attempt\.zip/);
  assert.doesNotMatch(html, /href="[^"]*attempt-9/);
  assert.match(html, /href="results\/primary--firefox\/attempt-1\/result\.json"/);
  assert.match(html, /href="results\/primary--firefox\/attempt-1\/attachments\/trace\.zip"/);
});
