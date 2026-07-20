const {test} = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {writeManifest, writeSummary, renderHtml, escapeHtml} = require('../src/output');
const {buildManifest} = require('../src/manifest');

// Fixture canonica: passa pelo buildManifest — o mesmo caminho dos produtores reais.
function grid(overrides = {}) {
  return buildManifest({
    tool: 'Anemoi Web',
    card: 'CDCOM-99',
    component: 'tgr-button',
    mode: 'current',
    runDir: '/tmp/run',
    now: new Date('2026-07-15T00:00:00.000Z'),
    ...overrides,
  });
}

test('escapeHtml: escapa caracteres', () => {
  assert.equal(escapeHtml('<a>&"'), '&lt;a&gt;&amp;&quot;');
});

test('writeManifest: grava manifest.json formatado', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-'));
  const p = writeManifest(dir, grid({cellCount: 1, runDir: dir}));
  assert.ok(p.endsWith('manifest.json'));
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(parsed.component, 'tgr-button');
  assert.equal(parsed.cellCount, 1);
  assert.deepEqual(fs.readdirSync(dir).filter(name => name.endsWith('.tmp')), []);
  assert.throws(() => writeManifest(dir, grid({component: 'tgr-link', runDir: dir})), /manifest\.json ja existe/);
  assert.equal(JSON.parse(fs.readFileSync(p, 'utf8')).component, 'tgr-button');
});

test('writeSummary: grava summary.md legivel', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-'));
  const p = writeSummary(dir, grid({
    cellCount: 1,
    runDir: dir,
    axes: {brands: ['gol'], stories: ['Primary'], viewports: ['sm'], themes: ['light']},
  }));
  const md = fs.readFileSync(p, 'utf8');
  assert.match(md, /tgr-button/);
  assert.match(md, /CDCOM-99/);
  assert.match(md, /Status: passed/);
  assert.match(md, /Prints: 1/);
});

test('renderHtml layout parity monta grade wc|react|angular', () => {
  const html = renderHtml(grid({
    cellCount: 1,
    axes: {frameworks: ['wc', 'react', 'angular'], stories: ['Primary'], themes: ['light'], viewports: ['sm'], brands: ['gol']},
    groups: [{
      label: 'gol · Primary · sm · light',
      wc: 'wc/gol/Primary/sm/light.png',
      react: 'react/gol/Primary/sm/light.png',
      angular: 'angular/gol/Primary/sm/light.png',
      parity: [{against: 'react', mismatch: 0}, {against: 'angular', mismatch: 0}],
    }],
  }));
  assert.match(html, /react\/gol\/Primary\/sm\/light\.png/);
  assert.match(html, /angular\/gol\/Primary\/sm\/light\.png/);
  assert.match(html, /paridade/i);
});

test('renderHtml embute parityLabel customizado no payload da galeria', () => {
  const html = renderHtml(grid({
    tool: 'Anemoi Service',
    mode: 'koba-state',
    cellCount: 2,
    parityLabel: 'Paridade vs react',
    axes: {frameworks: ['react', 'angular']},
    groups: [{
      label: 'gol · estado abc · sm · light',
      react: 'a.png', angular: 'b.png',
      parity: [{against: 'angular', mismatch: 0, diffPath: 'd.png'}],
    }],
  }));
  assert.ok(html.includes('"parityLabel":"Paridade vs react"'));
  assert.ok(!html.includes("'Paridade vs wc</th>'"));
});

test('renderHtml usa "Paridade vs wc" como parityLabel default (garantido pelo buildManifest)', () => {
  const html = renderHtml(grid());
  assert.ok(html.includes('"parityLabel":"Paridade vs wc"'));
});

test('renderHtml: badge de paridade usa percentual com fallback px', () => {
  const html = renderHtml(grid({
    cellCount: 1,
    axes: {frameworks: ['wc', 'react']},
    groups: [{
      label: 'gol · Primary · sm · light',
      wc: 'a.png', react: 'b.png',
      parity: [{against: 'react', mismatch: 8, width: 40, height: 40, diffPath: 'diff/react-vs-wc/x.png'}],
    }],
  }));
  assert.ok(html.includes('"width":40'));
  assert.ok(html.includes('"height":40'));
  assert.ok(html.includes('"diffPath":"diff/react-vs-wc/x.png"'));
  assert.match(html, /function fmtParity/);
  assert.match(html, /<0,1%/);
  assert.match(html, /toFixed\(1\)\.replace\('\.', ','\)/);
});

test('renderHtml: badge divergente e clicavel e lightbox tem aba Diff', () => {
  const html = renderHtml(grid({
    cellCount: 1,
    axes: {frameworks: ['wc', 'react']},
    groups: [{
      label: 'gol · Primary · sm · light',
      wc: 'a.png', react: 'b.png',
      parity: [{against: 'react', mismatch: 8, width: 40, height: 40, diffPath: 'diff/react-vs-wc/x.png'}],
    }],
  }));
  assert.match(html, /function viewsOf/);
  assert.match(html, /'Diff ' \+ fwLabel/);
  assert.match(html, /button class="pill bad diff"/);
});

test('renderHtml: cabecalho lista stories divergentes como chips clicaveis', () => {
  const html = renderHtml(grid({
    cellCount: 2,
    axes: {frameworks: ['wc', 'react']},
    groups: [
      {label: 'gol · Com Icone · sm · light', wc: 'a.png', react: 'b.png',
        parity: [{against: 'react', mismatch: 8, width: 40, height: 40, diffPath: 'd.png'}]},
      {label: 'gol · Loading · sm · light', wc: 'c.png', react: 'd2.png',
        parity: [{against: 'react', mismatch: 0, width: 40, height: 40, diffPath: 'd3.png'}]},
    ],
  }));
  assert.match(html, /class="schip"/);
  assert.match(html, /failingByStory/);
  assert.ok(!html.includes("'px de divergência'"));
  assert.ok(!html.includes('totalDiff'));
});

test('renderHtml: prints em tamanho real com scroll por celula', () => {
  const html = renderHtml(grid({
    cellCount: 1,
    axes: {frameworks: ['wc', 'react']},
    groups: [{label: 'gol · Primary · sm · light', wc: 'a.png', react: 'b.png', parity: []}],
  }));
  assert.ok(!/\.shot \{[^}]*width:150px/.test(html));
  assert.match(html, /table-layout:fixed/);
  assert.match(html, /class="shotwrap"/);
  assert.match(html, /naturalWidth\s*\/\s*2/);
});

test('writeSummary: renderiza secao de proveniencia quando presente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-prov-'));
  const p = writeSummary(dir, grid({
    cellCount: 1,
    runDir: dir,
    provenance: {
      anemoi: {version: '1.0.0', commit: 'abc123'},
      tangerina: {commit: 'def456'},
      environment: {os: 'darwin 25.5.0', node: 'v24.0.0', browser: 'chromium', playwright: '1.48.0'},
      thresholds: {pixelmatch: 0.1, mismatchTolerance: 0, fit: 'union'},
    },
  }));
  const md = fs.readFileSync(p, 'utf8');
  assert.match(md, /## Proveniência/);
  assert.match(md, /abc123/);
  assert.match(md, /def456/);
  assert.match(md, /pixelmatch 0\.1/);
});

test('writeSummary: sem proveniencia, secao nao aparece', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-noprov-'));
  const p = writeSummary(dir, grid({cellCount: 1, runDir: dir}));
  const md = fs.readFileSync(p, 'utf8');
  assert.ok(!md.includes('Proveniência'));
});

test('renderHtml: divergencia de dimensao marca badge mesmo com mismatch 0', () => {
  const html = renderHtml(grid({
    cellCount: 1,
    axes: {frameworks: ['wc', 'react']},
    groups: [{
      label: 'gol · Primary · sm · light',
      wc: 'a.png', react: 'b.png',
      parity: [{against: 'react', mismatch: 0, width: 40, height: 40, sizeMatch: false, diffPath: 'd.png'}],
    }],
  }));
  assert.match(html, /const isBad/);
  assert.match(html, /≠dim/);
  assert.ok(html.includes('"sizeMatch":false'));
});

const A11Y_GROUP = {
  label: 'gol · Primary · sm · light',
  wc: 'wc/gol/Primary/sm/light.png',
  react: 'react/gol/Primary/sm/light.png',
  parity: [{against: 'react', mismatch: 0, width: 40, height: 40, sizeMatch: true}],
  a11y: {
    audits: {
      wc: {violations: [{id: 'button-name', impact: 'critical', wcag: ['wcag2a'], description: 'Botao sem nome', helpUrl: 'https://dequeuniversity.com/rules/axe/button-name', nodes: [{target: 'button', html: '<button></button>'}]}], artifactPath: 'wc/gol/Primary/sm/light.a11y.json'},
      react: {error: 'axe timeout'},
    },
    ariaParity: [{against: 'react', match: false, diffPath: 'aria-diff/react-vs-wc/gol-Primary-sm-light.txt'}],
  },
};

test('renderHtml embute o bloco a11y por celula e o agregado no payload', () => {
  const html = renderHtml(grid({
    cellCount: 1,
    a11y: {totalViolations: 1, worstImpact: 'critical', ariaMismatches: 1, ruleset: ['wcag2a']},
    axes: {frameworks: ['wc', 'react']},
    groups: [A11Y_GROUP],
  }));
  assert.ok(html.includes('"a11y":{"audits"'));
  assert.ok(html.includes('"button-name"'));
  assert.ok(html.includes('"error":"axe timeout"'));
  assert.ok(html.includes('"totalViolations":1'));
  assert.match(html, /A11y \(WCAG A\/AA\)/);
  assert.match(html, /function a11yState/);
  assert.match(html, /function a11yDetailHtml/);
  assert.match(html, /a11ySummary/);
  assert.match(html, /aria-diff\/react-vs-wc\/gol-Primary-sm-light\.txt/);
});

test('renderHtml sem a11y (manifesto antigo) nao rende coluna nem chip a11y', () => {
  const html = renderHtml(grid({
    cellCount: 1,
    axes: {frameworks: ['wc', 'react']},
    groups: [{label: 'gol · Primary · sm · light', wc: 'a.png', react: 'b.png', parity: []}],
  }));
  assert.ok(html.includes('"a11y":null'));
  // A coluna so aparece quando alguma celula tem a11y (hasA11y em runtime);
  // o payload sem dados garante isso.
  assert.ok(!html.includes('"audits"'));
});

test('writeSummary: renderiza secao de acessibilidade quando presente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-a11y-'));
  const p = writeSummary(dir, grid({
    cellCount: 1,
    runDir: dir,
    a11y: {totalViolations: 3, worstImpact: 'serious', ariaMismatches: 1, ruleset: ['wcag2a', 'wcag2aa']},
  }));
  const md = fs.readFileSync(p, 'utf8');
  assert.match(md, /## Acessibilidade/);
  assert.match(md, /Violações WCAG: 3 \(pior impacto: serious\)/);
  assert.match(md, /1 célula\(s\) divergente\(s\)/);
  assert.match(md, /wcag2a, wcag2aa/);
});

test('writeSummary: coleta indisponivel mostra linha de celulas sem medicao', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-a11y-coll-'));
  const p = writeSummary(dir, grid({
    cellCount: 1,
    runDir: dir,
    a11y: {totalViolations: 0, worstImpact: null, ariaMismatches: 0, collectionErrors: 2, ruleset: ['wcag2a']},
  }));
  const md = fs.readFileSync(p, 'utf8');
  assert.match(md, /## Acessibilidade/);
  assert.match(md, /- Coleta: 2 célula\(s\) sem medição/);
});

test('renderHtml: embute collectionErrors no payload quando presente', () => {
  const html = renderHtml(grid({
    cellCount: 1,
    a11y: {totalViolations: 0, worstImpact: null, ariaMismatches: 0, collectionErrors: 2, ruleset: ['wcag2a']},
    axes: {frameworks: ['wc', 'react']},
    groups: [A11Y_GROUP],
  }));
  assert.ok(html.includes('"collectionErrors":2'));
});

test('writeSummary: sem a11y, secao nao aparece', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-noa11y-'));
  const p = writeSummary(dir, grid({cellCount: 1, runDir: dir}));
  const md = fs.readFileSync(p, 'utf8');
  assert.ok(!md.includes('Acessibilidade'));
});

test('renderHtml embute needsReview e failureSummary; painel tem secao A revisar', () => {
  const html = renderHtml(grid({
    cellCount: 1,
    a11y: {totalViolations: 0, worstImpact: null, ariaMismatches: 0, collectionErrors: 0, needsReview: 2, ruleset: ['wcag2a']},
    axes: {frameworks: ['wc', 'react']},
    groups: [{
      label: 'gol · Primary · sm · light',
      wc: 'a.png', react: 'b.png', parity: [],
      a11y: {audits: {wc: {violations: [], needsReview: [{id: 'color-contrast', impact: 'serious', wcag: ['wcag2aa'], description: 'd', helpUrl: 'https://x', nodes: [{target: 'p', html: '<p>x</p>', failureSummary: 'Fix any of the following: contrast of 2.7'}]}], artifactPath: 'wc.a11y.json'}}, ariaParity: []},
    }],
  }));
  assert.ok(html.includes('"needsReview":2'));
  assert.ok(html.includes('contrast of 2.7'));
  assert.match(html, /A revisar \(axe não conseguiu medir\)/);
});

test('writeSummary: linha A revisar so aparece quando needsReview > 0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-review-'));
  const p = writeSummary(dir, grid({cellCount: 1, runDir: dir,
    a11y: {totalViolations: 0, worstImpact: null, ariaMismatches: 0, collectionErrors: 0, needsReview: 3, ruleset: ['wcag2a']}}));
  const md = fs.readFileSync(p, 'utf8');
  assert.match(md, /- A revisar: 3 item\(ns\)/);
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'out-review0-'));
  const md2 = fs.readFileSync(writeSummary(dir2, grid({cellCount: 1, runDir: dir2,
    a11y: {totalViolations: 0, worstImpact: null, ariaMismatches: 0, collectionErrors: 0, needsReview: 0, ruleset: ['wcag2a']}})), 'utf8');
  assert.ok(!md2.includes('A revisar'));
});
