'use strict';
// Proveniencia do run: versoes, commits e parametros de captura registrados no
// manifesto para a evidencia ser reprodutivel. Coleta best-effort: campo
// indisponivel vira null, nunca lanca.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {DEFAULT_THRESHOLD} = require('@gol-smiles/anemoi-core');

function gitCommit(cwd) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {cwd, stdio: ['ignore', 'pipe', 'ignore']})
      .toString().trim();
  } catch {
    return null;
  }
}

function packageVersion(packageJsonPath) {
  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

function playwrightVersion() {
  try {
    return require('playwright/package.json').version;
  } catch {
    return null;
  }
}

function collectProvenance({repo, anemoiDir = path.resolve(__dirname, '..')}) {
  return {
    anemoi: {
      version: packageVersion(path.join(anemoiDir, 'package.json')),
      commit: gitCommit(anemoiDir),
    },
    tangerina: {commit: gitCommit(repo)},
    environment: {
      os: `${process.platform} ${os.release()}`,
      node: process.version,
      browser: 'chromium',
      playwright: playwrightVersion(),
    },
    // Espelha os parametros fixos de captureCells (core/src/capture.js).
    capture: {deviceScaleFactor: 2, viewportHeight: 900, waitUntil: 'networkidle', animations: 'disabled'},
    thresholds: {pixelmatch: DEFAULT_THRESHOLD, mismatchTolerance: 0, fit: 'union'},
  };
}

module.exports = {collectProvenance};
