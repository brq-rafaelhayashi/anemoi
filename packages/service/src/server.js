'use strict';
// API HTTP do Anemoi Service.
//   POST /runs                   -> 202 {runId} | 400 | 422 | 503
//   GET  /runs/:id               -> status do run
//   GET  /runs/:id/gallery/*     -> bundle do run (galeria, PNGs, manifest)
// Escuta apenas em 127.0.0.1; CORS restrito a origem do Koba.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {MIME, assertSafePathSegment} = require('@gol-smiles/anemoi-core');
const {VIEWPORT_WIDTHS} = require('@gol-smiles/anemoi-web/src/brands');
const {normalizeCompareState, compareStateToCells} = require('./stateAdapter');

const MAX_BODY_BYTES = 1024 * 1024;
const RUN_ID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const GALLERY_ROUTE = new RegExp(`^/runs/(${RUN_ID_PATTERN})/gallery(/.*)?$`);
const RUN_ROUTE = new RegExp(`^/runs/(${RUN_ID_PATTERN})$`);

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {'Content-Type': 'application/json; charset=utf-8'});
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body acima de 1MB.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('JSON invalido no body.'));
      }
    });
    req.on('error', reject);
  });
}

// Retorna a mensagem do 422, ou null se o payload e valido.
function validatePayload(payload) {
  if (payload.mode !== 'state') {
    return `mode nao suportado: ${JSON.stringify(payload.mode)}. Unico valor na v1: "state".`;
  }
  const compareState = payload.compareState;
  if (!compareState || typeof compareState !== 'object'
      || typeof compareState.componentKey !== 'string' || !compareState.componentKey) {
    return 'compareState.componentKey e obrigatorio.';
  }
  const axes = payload.axes || {};
  if (axes.viewports !== undefined) {
    const valid = Array.isArray(axes.viewports) && axes.viewports.length > 0
      && axes.viewports.every(viewport => VIEWPORT_WIDTHS[viewport]);
    if (!valid) {
      return `axes.viewports invalido. Use valores de: ${Object.keys(VIEWPORT_WIDTHS).join(', ')}.`;
    }
  }
  if (axes.themes !== undefined && JSON.stringify(axes.themes) !== '["light"]') {
    return 'axes.themes nao suportado na v1: apenas ["light"] (theme chega na fase 2).';
  }
  return null;
}

async function handlePostRuns(req, res, ctx) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {error: error.message});
    return;
  }

  const invalid = validatePayload(payload);
  if (invalid) {
    sendJson(res, 422, {error: invalid});
    return;
  }

  const card = payload.card || 'koba';
  try {
    assertSafePathSegment(card, 'card');
  } catch (error) {
    sendJson(res, 422, {error: error.message});
    return;
  }

  let catalog;
  try {
    catalog = await ctx.deps.fetchCatalog(ctx.config.kobaBaseUrl);
  } catch (error) {
    if (error.code === 'KOBA_UNAVAILABLE') {
      sendJson(res, 503, {error: error.message});
      return;
    }
    throw error;
  }

  let state;
  try {
    state = normalizeCompareState(payload.compareState, catalog);
  } catch (error) {
    if (error.code === 'UNKNOWN_COMPONENT') {
      sendJson(res, 422, {error: error.message});
      return;
    }
    throw error;
  }

  const cells = compareStateToCells(state, {
    viewports: (payload.axes && payload.axes.viewports) || undefined,
  });
  const run = ctx.store.create({component: state.componentKey, card});
  ctx.queue.enqueue(() => ctx.deps.executeRun({run, store: ctx.store, cells, state, config: ctx.config}));
  sendJson(res, 202, {runId: run.runId});
}

function runResponse(run) {
  const body = {
    runId: run.runId,
    status: run.status,
    stage: run.stage,
    component: run.component,
    card: run.card,
    createdAt: run.createdAt,
  };
  if (run.summary) body.summary = run.summary;
  if (run.error) body.error = run.error;
  if (run.status === 'passed' || run.status === 'failed') {
    body.manifestUrl = `/runs/${run.runId}/gallery/manifest.json`;
    body.galleryUrl = `/runs/${run.runId}/gallery/`;
  }
  return body;
}

function handleGallery(res, run, rawPath) {
  if (!run.runDir) {
    sendJson(res, 404, {error: 'Bundle ainda nao disponivel para este run.'});
    return;
  }
  let urlPath;
  try {
    urlPath = decodeURIComponent(rawPath);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  let filePath = path.join(run.runDir, urlPath);
  if (urlPath === '' || urlPath.endsWith('/')) {
    filePath = path.join(filePath, 'index.html');
  }
  const rel = path.relative(run.runDir, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream'});
    res.end(data);
  });
}

function createService({config, store, queue, deps}) {
  const ctx = {config, store, queue, deps};

  return http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', config.kobaBaseUrl);
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      });
      res.end();
      return;
    }

    const urlPath = (req.url || '/').split('?')[0];

    if (req.method === 'POST' && urlPath === '/runs') {
      handlePostRuns(req, res, ctx).catch(error => sendJson(res, 500, {error: error.message}));
      return;
    }

    const galleryMatch = urlPath.match(GALLERY_ROUTE);
    if (req.method === 'GET' && galleryMatch) {
      const run = store.get(galleryMatch[1]);
      if (!run) {
        sendJson(res, 404, {error: `Run desconhecido: ${galleryMatch[1]}. O servico pode ter sido reiniciado — dispare de novo.`});
        return;
      }
      handleGallery(res, run, (galleryMatch[2] || '/').slice(1));
      return;
    }

    const runMatch = urlPath.match(RUN_ROUTE);
    if (req.method === 'GET' && runMatch) {
      const run = store.get(runMatch[1]);
      if (!run) {
        sendJson(res, 404, {error: `Run desconhecido: ${runMatch[1]}. O servico pode ter sido reiniciado — dispare de novo.`});
        return;
      }
      sendJson(res, 200, runResponse(run));
      return;
    }

    sendJson(res, 404, {error: 'rota desconhecida'});
  });
}

module.exports = {createService, validatePayload, readJsonBody};
