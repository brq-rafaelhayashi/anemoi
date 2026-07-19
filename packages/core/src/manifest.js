// Unica fonte da verdade do formato do manifest.json.
// Todo produtor (CLI web, service, failure) monta o manifesto por aqui;
// renderHtml/writeSummary podem confiar nas chaves garantidas.

function requireFields(fields) {
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') {
      throw new Error(`buildManifest: campo obrigatorio ausente: ${name}`);
    }
  }
}

// Manifesto de bundle (grade + paridade). status 'failed' aqui significa
// "paridade divergente", nao erro de execucao (esse e o buildFailureManifest).
function buildManifest({
  tool,
  status = 'passed',
  card,
  component,
  mode,
  layout = 'parity',
  parityLabel = 'Paridade vs wc',
  axes = {},
  cellCount = 0,
  groups = [],
  compareState,
  provenance,
  a11y,
  runDir,
  now = new Date(),
}) {
  requireFields({tool, card, component, mode, runDir});
  return {
    tool,
    status,
    card,
    component,
    mode,
    layout,
    parityLabel,
    axes,
    cellCount,
    groups,
    ...(compareState !== undefined ? {compareState} : {}),
    ...(provenance !== undefined ? {provenance} : {}),
    ...(a11y !== undefined ? {a11y} : {}),
    generatedAt: now.toISOString(),
    runDir,
  };
}

function buildManifestV2({
  tool,
  status,
  card,
  component,
  mode,
  axes,
  cellCount,
  groups,
  provenance,
  a11y,
  behavior,
  gate,
  attempts,
  runDir,
  now = new Date(),
}) {
  requireFields({tool, status, card, component, mode, runDir, gate});
  return {
    schemaVersion: 2,
    tool,
    status,
    card,
    component,
    mode,
    layout: 'confidence',
    parityLabel: 'Paridade vs wc no mesmo browser',
    axes,
    cellCount,
    groups,
    provenance,
    a11y,
    behavior,
    gate,
    attempts,
    generatedAt: now.toISOString(),
    runDir,
  };
}

function manifestSchemaVersion(manifest) {
  return manifest && manifest.schemaVersion === 2 ? 2 : 1;
}

// Manifesto de falha de execucao: sem grade, com diagnostico apontando o log.
function buildFailureManifest({
  tool = 'Anemoi Web',
  stage,
  card,
  component,
  error,
  logPath,
  runDir,
  now = new Date(),
}) {
  requireFields({tool, card, component, runDir});
  return {
    tool,
    status: 'failed',
    stage,
    card,
    component,
    generatedAt: now.toISOString(),
    runDir,
    error,
    logPath,
  };
}

module.exports = {buildManifest, buildManifestV2, buildFailureManifest, manifestSchemaVersion};
