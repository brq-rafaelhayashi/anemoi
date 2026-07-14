'use strict';
// Cliente do catalogo vivo do Koba (GET /catalog.json).
// O catalogo e derivado do docs.json + stories do DS pelo proprio Koba.

function unavailable(message) {
  const error = new Error(message);
  error.code = 'KOBA_UNAVAILABLE';
  return error;
}

async function fetchKobaCatalog(kobaBaseUrl, {timeoutMs = 5000, fetchImpl = fetch} = {}) {
  let response;
  try {
    response = await fetchImpl(`${kobaBaseUrl}/catalog.json`, {signal: AbortSignal.timeout(timeoutMs)});
  } catch (error) {
    throw unavailable(
      `Koba indisponivel em ${kobaBaseUrl} (${error.message}). Suba o Koba: pnpm dev (no repo koba).`,
    );
  }
  if (!response.ok) {
    throw unavailable(
      `GET ${kobaBaseUrl}/catalog.json respondeu ${response.status} — o DS pode estar sem build. `
      + 'No repo koba, rode: pnpm ds:build.',
    );
  }
  const catalog = await response.json();
  if (!Array.isArray(catalog)) {
    throw unavailable(`GET ${kobaBaseUrl}/catalog.json nao retornou uma lista de componentes.`);
  }
  return catalog;
}

module.exports = {fetchKobaCatalog};
