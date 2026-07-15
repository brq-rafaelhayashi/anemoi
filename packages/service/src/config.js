'use strict';
// Config do Anemoi Service — secao "service" do .anemoi.local.json na raiz do anemoi.
// O checkout do DS reusa o mecanismo de aliases do anemoi-web (repositories/defaultRepository).

const {readLocalConfig, resolveRepository} = require('@gol-smiles/anemoi-web/src/config');

const DEFAULTS = {port: 9200, kobaBaseUrl: 'http://localhost:9000'};

function readServiceConfig(rootDir, {cwd = rootDir} = {}) {
  const config = readLocalConfig(rootDir);
  const service = config.service || {};

  const port = service.port ?? DEFAULTS.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Config invalida: "service.port" deve ser uma porta valida (1-65535), recebi ${JSON.stringify(service.port)}.`);
  }

  const rawUrl = service.kobaBaseUrl || DEFAULTS.kobaBaseUrl;
  let kobaBaseUrl;
  try {
    kobaBaseUrl = new URL(rawUrl).origin;
  } catch {
    throw new Error(`Config invalida: "service.kobaBaseUrl" nao e uma URL: ${JSON.stringify(rawUrl)}.`);
  }

  const dsRepo = resolveRepository({rootDir, cwd, repoArg: service.repo});
  return {port, kobaBaseUrl, dsRepo};
}

module.exports = {readServiceConfig, DEFAULTS};
