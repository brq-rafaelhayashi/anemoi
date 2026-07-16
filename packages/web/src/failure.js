'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {buildFailureManifest, writeManifest} = require('@gol-smiles/anemoi-core');

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

  const manifest = buildFailureManifest({
    stage: context.stage,
    card: context.card,
    component: context.component,
    error: error?.message || String(error),
    logPath: path.relative(runRoot, logPath),
    runDir,
  });
  writeManifest(runRoot, manifest);
  return manifest;
}

module.exports = {writeFailureManifest};
