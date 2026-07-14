'use strict';

const fs = require('node:fs');
const path = require('node:path');

function writeFailureManifest(runDir, context, error) {
  const runRoot = path.resolve(runDir);
  fs.rmSync(path.join(runRoot, 'index.html'), {force: true});
  const logPath = path.join(runRoot, 'logs', `${String(context.stage || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '-')}.log`);
  const sourceLogPath = error?.logPath && path.resolve(error.logPath);

  fs.mkdirSync(path.dirname(logPath), {recursive: true});
  let persistedLog = sourceLogPath === logPath && fs.existsSync(logPath);
  if (!persistedLog && sourceLogPath && fs.existsSync(sourceLogPath)) {
    try {
      fs.copyFileSync(sourceLogPath, logPath);
      persistedLog = true;
    } catch {
      // Mantem o manifesto autocontido mesmo quando um log externo nao pode ser lido.
    }
  }
  if (!persistedLog) {
    fs.writeFileSync(logPath, `${error?.stack || error?.message || String(error)}\n`);
  }

  const manifest = {
    tool: 'Anemoi Web',
    status: 'failed',
    stage: context.stage,
    card: context.card,
    component: context.component,
    generatedAt: new Date().toISOString(),
    runDir,
    error: error?.message || String(error),
    logPath: path.relative(runRoot, logPath),
  };
  fs.writeFileSync(path.join(runRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

module.exports = {writeFailureManifest};
