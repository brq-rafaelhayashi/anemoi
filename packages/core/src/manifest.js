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

module.exports = {buildManifest, buildFailureManifest};
